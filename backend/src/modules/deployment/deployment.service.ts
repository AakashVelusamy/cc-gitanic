/**
 * deployment.service.ts — Deployment pipeline (10 steps)
 *
 * Step  1 — enqueue:    create pending DB row, push to FIFO deployQueue
 * Step  2 — validate:   repo exists, user owns it, check auto_deploy_enabled
 * Step  3 — checkout:   git --work-tree /tmp/build/{user}/{depId} checkout HEAD --
 * Step  4 — detect:     Strategy Pattern (Vite / CRA / Static)
 * Step  5 — build:      run framework build command
 * Step  6 — upload:     parallel upload to Supabase Storage (deployments bucket)
 * Step  7 — DB update:  markSuccess → DB trigger atomically swaps active_deployment_id
 * Step  8 — history:    update commit_sha + commit_message on the deployment row
 * Step  9 — cleanup:    fs.rmSync /tmp/build/{user}/{depId}
 * Step 10 — emit:       observer events via logger + deployQueue EventEmitter
 *
 * FAILURE RULE (enforced here AND at DB trigger level):
 *   Any error → markFailed (NOT markSuccess).
 *   active_deployment_id is NEVER updated on a failed deployment.
 *
 * Architecture: Service Layer + Strategy Pattern + Observer + FIFO Queue
 */

import path       from 'node:path';
import fs         from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DeploymentRepository, LogRepository, DeploymentRow, LogRow }   from './deployment.repository';
import { RepoRepository }                        from '../repos/repo.repository';
import { RepoFactory }                           from '../repos/repo.service';
import { StorageService }                        from '../../lib/storage.service';
import { deployQueue, QueueJob }                 from '../../lib/deployQueue';
import { deployEvents }                          from '../../lib/deployEvents';
import { logger }                                from '../../lib/logger';
import { createError }                           from '../../middleware/errorHandler';
import { AuthRepository }                        from '../auth/auth.repository';
import { detectStrategy }                        from './strategies';
import { bustDeploymentCache, bustLocalServeCache } from '../../lib/cacheBust';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Ephemeral build workspaces live under /tmp/build */
const BUILD_ROOT = '/tmp/build';

/** Validate a path stays within a base directory to prevent traversal (S2083). */
function assertSafePath(resolvedPath: string, base: string): void {
  const normalBase = path.resolve(base);
  const normalPath = path.resolve(resolvedPath);
  if (!normalPath.startsWith(normalBase + path.sep) && normalPath !== normalBase) {
    throw createError(400, 'Path traversal detected');
  }
}

/**
 * Assert that `repo` exists and is owned by `userId`.
 * Throws 403 with `message` if either check fails.
 * Centralises the repeated ownership guard used across the pipeline and API.
 */
function assertRepoOwner(
  repo: { owner_id: string } | null | undefined,
  userId: string,
  message = 'Access denied',
): asserts repo is { owner_id: string } {
  if (repo?.owner_id !== userId) {
    throw createError(403, message);
  }
}

// ── Log helper ────────────────────────────────────────────────────────────────

function makeLog(deploymentId: string, repoId: string, userId: string) {
  return async (text: string): Promise<void> => {
    // Parse "[step] message" — pipeline calls use lowercase step names
    const stepMatch = /^\[([a-zA-Z0-9:_]+)\][ \t]*(.*)$/.exec(text);
    const step      = stepMatch?.[1].toLowerCase() ?? 'info';
    const msgBody   = stepMatch?.[2] ?? text;

    logger.info(`[pipeline:${deploymentId.slice(0, 8)}] ${text}`, {
      userId, repoId, deploymentId,
    });

    // Pass msgBody (without prefix) so deployEvents.step doesn't double-wrap it.
    // DB stores original `text`; Realtime gets the cleanly formatted version.
    deployEvents.step(deploymentId, repoId, userId, step, msgBody);

    // Direct DB persistence — raw text keeps the "[step] message" audit format
    await LogRepository.append(deploymentId, repoId, userId, text).catch(() => undefined);
  };
}

// ── Pipeline step implementations ─────────────────────────────────────────────

/**
 * Step 3 — Checkout using git --work-tree.
 *
 * For a bare repo, the canonical way to extract a working tree is:
 *   git --git-dir={repo.git} --work-tree={dest} checkout -f HEAD -- .
 *
 * This is safer than `git archive | tar` because:
 *   - Respects .gitattributes (line endings, filters)
 *   - No extra tar process required
 *   - Works identically on Railway (Linux)
 */
function stepCheckout(
  repoPath: string,
  workDir: string
): void {
  fs.mkdirSync(workDir, { recursive: true });

  execFileSync(
    'git',
    [
      `--git-dir=${repoPath}`,
      `--work-tree=${workDir}`,
      'checkout',
      '-f',
      'HEAD',
      '--',   // end of options
      '.'
    ],
    {
      stdio: 'pipe',
      timeout: 60_000,
    }
  );
}

/**
 * Step 3b — Read commit info from the bare repo HEAD.
 */
function getCommitInfo(repoPath: string): { sha: string; message: string } {
  try {
    const sha = execFileSync(
      'git', ['--git-dir', repoPath, 'rev-parse', 'HEAD'],
      { encoding: 'utf8', timeout: 5_000 }
    ).trim();
    const message = execFileSync(
      'git', ['--git-dir', repoPath, 'log', '-1', '--pretty=%s'],
      { encoding: 'utf8', timeout: 5_000 }
    ).trim();
    return { sha, message };
  } catch {
    return { sha: 'unknown', message: '' };
  }
}


// ── Main pipeline (runs as a QueueJob thunk) ──────────────────────────────────

async function runPipeline(
  deploymentId: string,
  repoId:       string,
  userId:       string,
  username:     string,
  repoName:     string
): Promise<void> {
  const startMs = Date.now();
  const workDir = path.join(BUILD_ROOT, username, deploymentId);
  // Guard: ensure workDir stays under BUILD_ROOT (S2083)
  assertSafePath(workDir, BUILD_ROOT);
  const log     = makeLog(deploymentId, repoId, userId);

  try {

    // ── Step 2: validate ───────────────────────────────────────────────────────
    await log('[validate] Checking repository and auto_deploy status');
    const repo = await RepoRepository.findById(repoId);

    assertRepoOwner(repo, userId, 'Repository not found or access denied');

    // First-time push: auto_deploy_enabled is still false.
    // We allow it — the DB trigger will flip the flag on first success.
    // All subsequent hooks-triggered deploys will arrive with flag = true.
    // Manual API calls (POST /api/repos/:name/deploy) are ALWAYS allowed.
    if (!RepoFactory.exists(username, repoName)) {
      throw createError(422, 'Git repository does not exist on server filesystem');
    }

    await log(`[validate] OK — auto_deploy_enabled=${repo.auto_deploy_enabled}`);

    // ── Step 3: mark building + checkout ──────────────────────────────────────
    await DeploymentRepository.markBuilding(deploymentId);
    await log(`[checkout] git --work-tree=${workDir} checkout -f HEAD -- .`);

    const repoPath = RepoFactory.repoPath(username, repoName);
    stepCheckout(repoPath, workDir);

    const { sha, message } = getCommitInfo(repoPath);
    await log(`[checkout] commit=${sha.slice(0, 8)} "${message}"`);

    // Persist commit info into the deployment row (mutable fields during build)
    await DeploymentRepository.updateCommitInfo(deploymentId, sha, message);

    // ── Step 4: detect strategy ────────────────────────────────────────────────
    await log('[detect] Inspecting source tree');
    const strategy = detectStrategy(workDir);
    await log(`[detect] Strategy selected: ${strategy.name}`);

    // ── Step 5: build ──────────────────────────────────────────────────────────
    await log(`[build] Running ${strategy.name} build`);
    const outputDir = await strategy.build(workDir, log);
    await log(`[build] Output directory: ${outputDir}`);

    // ── Step 6: upload via StorageService ─────────────────────────────────────
    const storagePath = await StorageService.upload(outputDir, username, deploymentId, log);

    // ── Step 7: DB update → triggers atomic active_deployment_id swap ──────────
    const durationMs = Date.now() - startMs;
    await log('[db] Marking success + swapping active_deployment_id pointer');
    await DeploymentRepository.markSuccess(deploymentId, durationMs, storagePath);

    // Atomically swap the live-site pointer + enable auto-deploy for future pushes
    await RepoRepository.setActiveDeployment(repoId, deploymentId);
    await log(`[db] active_deployment_id → ${deploymentId.slice(0, 8)}, auto_deploy_enabled → true`);

    // ── Step 8: history already written; prune old Storage folders ─────────────
    await log(`[history] Deployment ${deploymentId.slice(0, 8)} recorded (${durationMs}ms)`);

    // Prune old deployment folders in Supabase Storage (keep last 5).
    // Re-read the repo row to get the authoritative active_deployment_id after
    // the DB trigger has fired.  Pass it so pruning never deletes the live folder.
    const recentIds = await DeploymentRepository.findSuccessfulDepIds(repoId);
    const freshRepo = await RepoRepository.findById(repoId);
    const activeId  = freshRepo?.active_deployment_id ?? deploymentId;
    StorageService.pruneOldDeployments(username, recentIds, activeId).catch((err: unknown) =>
      logger.warn(`[pipeline] Prune failed (non-blocking): ${String(err)}`)
    );

    // ── Step 10: emit deploy:success event (Observer) ──────────────────────────
    deployEvents.success({
      deploymentId,
      repoId,
      userId,
      username,
      repoName,
      durationMs,
      storagePath,
      commitSha: sha,
    });

    // ── Step 11: bust Vercel edge cache so new deployment is live immediately ──
    bustDeploymentCache(username).catch(() =>
      logger.warn('[pipeline] Cache bust fire-and-forget failed (non-critical)')
    );

    // ── Step 11b: bust local serve server's in-memory deployment cache ────────
    bustLocalServeCache(username).catch(() =>
      logger.warn('[pipeline] Local serve cache bust failed (non-critical)')
    );

  } catch (pipelineErr) {

    // ── FAILURE RULE —————————————————————————————————————————————————————————
    // markFailed NEVER touches active_deployment_id.
    // The DB trigger (trg_auto_deploy_on_success) only fires on status='success'.
    const durationMs = Date.now() - startMs;
    await DeploymentRepository.markFailed(deploymentId, durationMs).catch(() => undefined);
    await log(`[failed] ${String(pipelineErr)}`).catch(() => undefined);

    // ── Clean up any partial Supabase Storage upload ─────────────────────────
    // Plan invariant: "Partial uploads to deployments/{user}/{depId}/ are deleted
    // on failure." active_deployment_id is NOT updated so the live site is safe,
    // but leftover objects would accumulate in storage if not pruned here.
    StorageService.deleteDeployment(username, deploymentId).catch((err: unknown) =>
      logger.warn(`[pipeline] Partial-upload cleanup failed (non-blocking): ${String(err)}`)
    );

    // ── Step 10: emit deploy:failed event (Observer) ──────────────────────────
    deployEvents.failed({
      deploymentId,
      repoId,
      userId,
      username,
      repoName,
      durationMs,
      error: String(pipelineErr),
    });

    throw pipelineErr; // re-throw → deployQueue.emit('failed', job, err)

  } finally {

    // ── Step 9: cleanup — always, even on failure ──────────────────────────────
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
      await log('[cleanup] Workspace removed').catch(() => undefined);
    } catch (cleanErr) {
      logger.warn(`[pipeline] Cleanup failed for ${workDir}: ${String(cleanErr)}`);
    }

  }
}

// ── DeploymentService (public API) ────────────────────────────────────────────

export const DeploymentService = {

  /**
   * Step 1 — ENQUEUE
   * Creates a 'pending' deployment row in DB, then pushes to FIFO queue.
   * Returns immediately with { deploymentId }.
   */
  async enqueue(userId: string, repoId: string): Promise<{ deploymentId: string }> {
    const user = await AuthRepository.findById(userId);
    if (!user) throw createError(404, 'User not found');

    const repo = await RepoRepository.findById(repoId);
    if (!repo)                  throw createError(404, 'Repository not found');
    if (repo.owner_id !== userId) throw createError(403, 'Access denied');

    // Create the pending row — pipeline will transition it through building → success|failed
    const deployment = await DeploymentRepository.create({
      repo_id: repoId,
      user_id: userId,
    });

    const job: QueueJob = {
      id:          deployment.id,
      userId,
      repoId,
      enqueuedAt:  new Date(),
      thunk: ()  => runPipeline(deployment.id, repoId, userId, user.username, repo.name),
    };

    // Step 1b: emit deploy:start → logSubscribers open Realtime channel
    deployEvents.start({
      deploymentId: deployment.id,
      repoId,
      userId,
      username:    user.username,
      repoName:    repo.name,
      enqueuedAt:  job.enqueuedAt,
    });

    deployQueue.enqueue(job);

    return { deploymentId: deployment.id };
  },

  /** List all deployments for a repo (ownership check). */
  async listForRepo(userId: string, repoId: string): Promise<DeploymentRow[]> {
    const repo = await RepoRepository.findById(repoId);
    if (!repo)                  throw createError(404, 'Repository not found');
    if (repo.owner_id !== userId) throw createError(403, 'Access denied');
    return DeploymentRepository.findAllByRepo(repoId);
  },

  /** Get a single deployment (ownership check via repo). */
  async getOne(userId: string, deploymentId: string): Promise<DeploymentRow> {
    const dep = await DeploymentRepository.findById(deploymentId);
    if (!dep) throw createError(404, 'Deployment not found');
    const repo = await RepoRepository.findById(dep.repo_id);
    assertRepoOwner(repo, userId);
    return dep;
  },

  /** Get logs for a deployment (ownership check). */
  async getLogs(userId: string, deploymentId: string): Promise<LogRow[]> {
    const dep = await DeploymentRepository.findById(deploymentId);
    if (!dep) throw createError(404, 'Deployment not found');
    const repo = await RepoRepository.findById(dep.repo_id);
    assertRepoOwner(repo, userId);
    return LogRepository.findByDeployment(deploymentId);
  },

  /** Queue depth for monitoring. */
  queueDepth(): number { return deployQueue.depth; },

  /** List deployments for a publicly viewable repo. */
  async listPublicForRepo(repoId: string): Promise<DeploymentRow[]> {
    const repo = await RepoRepository.findById(repoId);
    if (!repo) throw createError(404, 'Repository not found');
    return DeploymentRepository.findAllByRepo(repoId);
  },
};



