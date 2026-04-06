/**
 * deployment.controller.ts — HTTP layer for deployment endpoints
 * Architecture: MVC Controller
 */

import { Request, Response, NextFunction } from 'express';
import { DeploymentService } from './deployment.service';

export const DeploymentController = {
  /**
   * POST /api/repos/:repoName/deploy
   * Enqueues a new deployment (Step 1 of pipeline).
   * 202: { deploymentId, message }
   */
  async enqueue(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sub: userId, username } = res.locals.user;
      const repoName = req.params['repoName'] as string;

      // Resolve repoId from repoName (service looks it up)
      const { RepoRepository } = await import('../repos/repo.repository');
      const { AuthRepository } = await import('../auth/auth.repository');
      const user = await AuthRepository.findById(userId);
      if (!user) { res.status(404).json({ error: 'User not found' }); return; }

      const repo = await RepoRepository.findByOwnerAndName(userId, repoName);
      if (!repo) { res.status(404).json({ error: `Repository "${repoName}" not found` }); return; }

      // auto_deploy_enabled is set to true by the DB trigger
      // (trg_auto_deploy_on_success) only after the first *successful* deployment.
      // Setting it here before the pipeline runs would allow hook-triggered deploys
      // to fire even when no successful deployment has ever completed.
      const result = await DeploymentService.enqueue(userId, repo.id);

      res.status(202).json({
        deploymentId: result.deploymentId,
        message: 'Deployment enqueued',
        username,
        repoName,
        queueDepth: DeploymentService.queueDepth(),
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/repos/:repoName/deployments
   * List all deployments for a repo.
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sub: userId } = res.locals.user;
      const repoName = req.params['repoName'] as string;

      const { RepoRepository } = await import('../repos/repo.repository');
      const repo = await RepoRepository.findByOwnerAndName(userId, repoName);
      if (!repo) { res.status(404).json({ error: `Repository "${repoName}" not found` }); return; }

      const deployments = await DeploymentService.listForRepo(userId, repo.id);
      res.status(200).json(deployments);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/deployments/:deploymentId
   * Get a single deployment by ID.
   */
  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sub: userId } = res.locals.user;
      const deploymentId = req.params['deploymentId'] as string;
      const deployment = await DeploymentService.getOne(userId, deploymentId);
      res.status(200).json(deployment);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/deployments/:deploymentId/logs
   * Stream log lines for a deployment.
   */
  async getLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sub: userId } = res.locals.user;
      const deploymentId = req.params['deploymentId'] as string;
      const logs = await DeploymentService.getLogs(userId, deploymentId);
      res.status(200).json(logs);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/queue/status
   * Returns current queue depth and running state (monitoring endpoint).
   */
  queueStatus(_req: Request, res: Response): void {
    const { deployQueue } = require('../../lib/deployQueue') as typeof import('../../lib/deployQueue');
    res.status(200).json({
      depth: deployQueue.depth,
      isRunning: deployQueue.isRunning,
    });
  },
};
