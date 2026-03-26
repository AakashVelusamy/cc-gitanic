/**
 * routes/internal.ts — Internal-only routes
 *
 * These routes are called ONLY by the git post-receive hook running on the
 * Railway server itself. They MUST NOT be publicly routable (protect with
 * a shared secret header + Railway's internal network where possible).
 *
 * POST /internal/deploy
 *   Called by post-receive hook when a push to main/master is detected.
 *   Resolves the user + repo, then enqueues a deployment job.
 *
 * Security model:
 *   - Requires X-Gitanic-Secret header matching INTERNAL_SECRET env var
 *   - Should be behind Railway's private networking (not exposed externally)
 *   - Returns 202 Accepted immediately; pipeline runs asynchronously
 */

import { Router, Request, Response, NextFunction } from 'express';
import { AuthRepository } from '../modules/auth/auth.repository';
import { RepoRepository } from '../modules/repos/repo.repository';
import { DeploymentService } from '../modules/deployment/deployment.service';
import { logger } from '../lib/logger';

const router = Router();

// ── Secret guard middleware ───────────────────────────────────────────────────

function internalSecretGuard(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.INTERNAL_SECRET ?? 'change-me-internal-secret';
  const provided = req.headers['x-gitanic-secret'];

  if (!provided || provided !== secret) {
    logger.warn('[internal] Rejected request with invalid secret', {
      meta: { ip: req.ip, path: req.path },
    });
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

router.use(internalSecretGuard);

// ── POST /internal/deploy ─────────────────────────────────────────────────────

interface DeployHookBody {
  username?: string;
  repo?: string;
  branch?: string;
  newsha?: string;
}

router.post('/deploy', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { username, repo: repoName, branch, newsha } = req.body as DeployHookBody;

    if (!username || !repoName || !branch) {
      res.status(400).json({ error: 'username, repo, and branch are required' });
      return;
    }

    // Only auto-deploy for pushes to main or master
    if (branch !== 'main' && branch !== 'master') {
      logger.info(`[internal/deploy] Ignored push to non-default branch "${branch}"`, {
        meta: { username, repoName },
      });
      res.status(200).json({ message: `Branch "${branch}" ignored — only main/master triggers deploy` });
      return;
    }

    // Resolve user
    const user = await AuthRepository.findByUsername(username);
    if (!user) {
      res.status(404).json({ error: `User "${username}" not found` });
      return;
    }

    // Resolve repo
    const repo = await RepoRepository.findByOwnerAndName(user.id, repoName);
    if (!repo) {
      res.status(404).json({ error: `Repository "${repoName}" not found` });
      return;
    }

    // Guard: only deploy if auto_deploy_enabled OR this is a hook-triggered push
    // (first deploy will set auto_deploy_enabled via DB trigger on success)
    if (!repo.auto_deploy_enabled) {
      // Allow it anyway — the pipeline's DB trigger will flip the flag on first success
      logger.info(`[internal/deploy] First-time deploy for ${username}/${repoName}`);
    }

    // Enqueue deployment
    const { deploymentId } = await DeploymentService.enqueue(user.id, repo.id);

    logger.info(`[internal/deploy] Enqueued deployment ${deploymentId}`, {
      userId: user.id,
      repoId: repo.id,
      deploymentId,
      meta: { branch, newsha: newsha ?? 'unknown' },
    });

    res.status(202).json({
      deploymentId,
      message: 'Deployment enqueued',
      username,
      repo: repoName,
      branch,
    });

  } catch (err) {
    next(err);
  }
});

export default router;
