// internal integration routing
// exposes endpoints for post-receive git hooks
// implements timing-safe secret authorization
// triggers automatic deployments on branch push
// verifies user ownership and repository state
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { AuthRepository } from '../modules/auth/auth.repository';
import { RepoRepository } from '../modules/repos/repo.repository';
import { DeploymentService } from '../modules/deployment/deployment.service';
import { logger } from '../lib/logger';

const router = Router();

// securely compare secrets to authorize internal calls
function internalSecretGuard(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.INTERNAL_SECRET;

  if (!secret) {
    logger.error('[internal] INTERNAL_SECRET not set');
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  const provided = req.headers['x-gitanic-secret'];
  const providedStr = Array.isArray(provided) ? provided[0] : provided ?? '';

  // timing-safe comparison to prevent secret enumeration
  const secretBuf = Buffer.from(secret, 'utf8');
  const providedBuf = Buffer.from(providedStr, 'utf8');
  const isValid =
    secretBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(secretBuf, providedBuf);

  if (!isValid) {
    logger.warn('[internal] Invalid secret attempt', { meta: { ip: req.ip, path: req.path } });
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

router.use(internalSecretGuard);

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

    // only auto-deploy for pushes to the default branch (main or master)
    const DEFAULT_BRANCHES = ['main', 'master'];
    if (!DEFAULT_BRANCHES.includes(branch)) {
      logger.info(`[internal/deploy] Ignored push to branch "${branch}" — only main/master triggers deploy`, {
        meta: { username, repoName },
      });
      res.status(200).json({ message: `Branch "${branch}" ignored — only main/master triggers deploy` });
      return;
    }

    // resolve user
    const user = await AuthRepository.findByUsername(username);
    if (!user) {
      res.status(404).json({ error: `User "${username}" not found` });
      return;
    }

    // resolve repo
    const repo = await RepoRepository.findByOwnerAndName(user.id, repoName);
    if (!repo) {
      res.status(404).json({ error: `Repository "${repoName}" not found` });
      return;
    }

    // guard: hook-triggered deploys only run after manual activation.
    if (!repo.auto_deploy_enabled) {
      logger.info(`[internal/deploy] Skipped: auto_deploy disabled for ${username}/${repoName}`);
      res.status(200).json({
        message: 'Auto deploy disabled. Click Deploy in the UI to activate.',
        username,
        repo: repoName,
        branch,
        enqueued: false,
      });
      return;
    }

    // enqueue deployment
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
