// deployment execution engine
// coordinates build pipelines and artifact uploads
// implements strategy-based framework detection
// manages build workspaces and workspace cleanup
// fires events for realtime logging and status updates
// triggers edge cache invalidation on success

import path       from 'node:path';
import fs         from 'node:fs';
import os         from 'node:os';
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


// build workspaces location
const BUILD_ROOT = process.env.BUILD_DIR || path.join(os.tmpdir(), 'gitanic-build');

// git binary path
const GIT_BIN = process.env.GIT_BIN_PATH || 'git';

// assert that path remains within base directory
function assertSafePath(resolvedPath: string, base: string): void {
  const normalBase = path.resolve(base);
  const normalPath = path.resolve(resolvedPath);
  if (!normalPath.startsWith(normalBase + path.sep) && normalPath !== normalBase) {
    throw createError(400, 'Path traversal detected');
  }
}

// verify that user owns the repository
function assertRepoOwner(
  repo: { owner_id: string } | null | undefined,
  userId: string,
  message = 'Access denied',
): asserts repo is { owner_id: string } {
  if (repo?.owner_id !== userId) {
    throw createError(403, message);
  }
}


function makeLog(deploymentId: string, repoId: string, userId: string) {
  return async (text: string): Promise<void> => {
    // extract step prefix from log text
    const prefixMatch = /^\[([a-zA-Z0-9:_]+)\]/.exec(text);
    const step      = prefixMatch?.[1].toLowerCase() ?? 'info';
    const msgBody   = prefixMatch ? text.slice(prefixMatch[0].length).trimStart() : text;

    logger.info(`[pipeline:${deploymentId.slice(0, 8)}] ${text}`, {
      userId, repoId, deploymentId,
    });

    // pass msgbody (without prefix) so deployevents.step doesn't double-wrap it.
    // db stores original `text`; realtime gets the cleanly formatted version.
    deployEvents.step(deploymentId, repoId, userId, step, msgBody);

    // direct db persistence — raw text keeps the "[step] message" audit format
    await LogRepository.append(deploymentId, repoId, userId, text).catch(() => undefined);
  };
}


// extracts working tree from bare repo using --work-tree
function stepCheckout(
  repoPath: string,
  workDir: string
): void {
  fs.mkdirSync(workDir, { recursive: true });

  execFileSync(
    GIT_BIN,
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

// extract commit sha and message from head
function getCommitInfo(repoPath: string): { sha: string; message: string } {
  try {
    const sha = execFileSync(
      GIT_BIN, ['--git-dir', repoPath, 'rev-parse', 'HEAD'],
      { encoding: 'utf8', timeout: 5_000 }
    ).trim();
    const message = execFileSync(
      GIT_BIN, ['--git-dir', repoPath, 'log', '-1', '--pretty=%s'],
      { encoding: 'utf8', timeout: 5_000 }
    ).trim();
    return { sha, message };
  } catch {
    return { sha: 'unknown', message: '' };
  }
}



async function runPipeline(
  deploymentId: string,
  repoId:       string,
  userId:       string,
  username:     string,
  repoName:     string
): Promise<void> {
  const startMs = Date.now();
  const workDir = path.join(BUILD_ROOT, username, deploymentId);
  assertSafePath(workDir, BUILD_ROOT);
  const log     = makeLog(deploymentId, repoId, userId);

  try {

    await log('[validate] Checking repository status');
    const repo = await RepoRepository.findById(repoId);
    assertRepoOwner(repo, userId, 'Repository not found or access denied');

    if (!RepoFactory.exists(username, repoName)) {
      throw createError(422, 'Git repository does not exist on server filesystem');
    }

    await log(`[validate] OK — auto_deploy_enabled=${repo.auto_deploy_enabled}`);

    await DeploymentRepository.markBuilding(deploymentId);
    await log(`[checkout] git --work-tree=${workDir} checkout -f HEAD -- .`);

    const repoPath = RepoFactory.repoPath(username, repoName);
    stepCheckout(repoPath, workDir);

    const { sha, message } = getCommitInfo(repoPath);
    await log(`[checkout] commit=${sha.slice(0, 8)} "${message}"`);

    // persist commit info into the deployment row (mutable fields during build)
    await DeploymentRepository.updateCommitInfo(deploymentId, sha, message);

    await log('[detect] Inspecting source tree');
    const strategy = detectStrategy(workDir);
    await log(`[detect] Strategy selected: ${strategy.name}`);

    await log(`[build] Running ${strategy.name} build`);
    const outputDir = await strategy.build(workDir, log);
    await log(`[build] Output directory: ${outputDir}`);

    const storagePath = await StorageService.upload(outputDir, username, deploymentId, log);

    const durationMs = Date.now() - startMs;
    await log('[db] Marking success + swapping active_deployment_id pointer');
    await DeploymentRepository.markSuccess(deploymentId, durationMs, storagePath);

    // atomically swap the live-site pointer + enable auto-deploy for future pushes
    await RepoRepository.setActiveDeployment(repoId, deploymentId);
    await log(`[db] active_deployment_id → ${deploymentId.slice(0, 8)}, auto_deploy_enabled → true`);

    await log(`[history] Deployment ${deploymentId.slice(0, 8)} recorded (${durationMs}ms)`);

    // pass current activeid to avoid pruning live site
    const recentIds = await DeploymentRepository.findSuccessfulDepIds(repoId);
    const freshRepo = await RepoRepository.findById(repoId);
    const activeId  = freshRepo?.active_deployment_id ?? deploymentId;
    StorageService.pruneOldDeployments(username, recentIds, activeId).catch((err: unknown) =>
      logger.warn(`[pipeline] Prune failed (non-blocking): ${String(err)}`)
    );

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

    bustDeploymentCache(username).catch(() =>
      logger.warn('[pipeline] Cache bust failed')
    );

    bustLocalServeCache(username).catch(() =>
      logger.warn('[pipeline] Local serve cache bust failed')
    );

  } catch (pipelineErr) {

    // failure handling
    const durationMs = Date.now() - startMs;
    await DeploymentRepository.markFailed(deploymentId, durationMs).catch(() => undefined);
    await log(`[failed] ${String(pipelineErr)}`).catch(() => undefined);

    StorageService.deleteDeployment(username, deploymentId).catch((err: unknown) =>
      logger.warn(`[pipeline] Cleanup failed: ${String(err)}`)
    );

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

    try {
      fs.rmSync(workDir, { recursive: true, force: true });
      await log('[cleanup] Workspace removed').catch(() => undefined);
    } catch (cleanErr) {
      logger.warn(`[pipeline] Cleanup failed for ${workDir}: ${String(cleanErr)}`);
    }

  }
}


export const DeploymentService = {

  // create pending row and push to fifo queue
  async enqueue(userId: string, repoId: string): Promise<{ deploymentId: string }> {
    const user = await AuthRepository.findById(userId);
    if (!user) throw createError(404, 'User not found');

    const repo = await RepoRepository.findById(repoId);
    if (!repo)                  throw createError(404, 'Repository not found');
    if (repo.owner_id !== userId) throw createError(403, 'Access denied');

    // create the pending row — pipeline will transition it through building → success|failed
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

    // step 1b: emit deploy:start → logSubscribers open realtime channel
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

  // list all deployments for a repo
  async listForRepo(userId: string, repoId: string): Promise<DeploymentRow[]> {
    const repo = await RepoRepository.findById(repoId);
    if (!repo)                  throw createError(404, 'Repository not found');
    if (repo.owner_id !== userId) throw createError(403, 'Access denied');
    return DeploymentRepository.findAllByRepo(repoId);
  },

  // get a single deployment
  async getOne(userId: string, deploymentId: string): Promise<DeploymentRow> {
    const dep = await DeploymentRepository.findById(deploymentId);
    if (!dep) throw createError(404, 'Deployment not found');
    const repo = await RepoRepository.findById(dep.repo_id);
    assertRepoOwner(repo, userId);
    return dep;
  },

  // get logs for a deployment
  async getLogs(userId: string, deploymentId: string): Promise<LogRow[]> {
    const dep = await DeploymentRepository.findById(deploymentId);
    if (!dep) throw createError(404, 'Deployment not found');
    const repo = await RepoRepository.findById(dep.repo_id);
    assertRepoOwner(repo, userId);
    return LogRepository.findByDeployment(deploymentId);
  },

  // queue depth
  queueDepth(): number { return deployQueue.depth; },

  // list public deployments for a repo
  async listPublicForRepo(repoId: string): Promise<DeploymentRow[]> {
    const repo = await RepoRepository.findById(repoId);
    if (!repo) throw createError(404, 'Repository not found');
    return DeploymentRepository.findAllByRepo(repoId);
  },
};



