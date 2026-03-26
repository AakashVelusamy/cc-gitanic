/**
 * routes/deploy.ts — Deployment router
 * All routes require JWT authentication.
 */

import { Router } from 'express';
import { DeploymentController } from '../modules/deployment/deployment.controller';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

// POST /api/repos/:repoName/deploy          → enqueue deployment
router.post('/repos/:repoName/deploy', DeploymentController.enqueue);

// GET  /api/repos/:repoName/deployments     → list deployments for repo
router.get('/repos/:repoName/deployments', DeploymentController.list);

// GET  /api/deployments/:deploymentId       → get single deployment
router.get('/deployments/:deploymentId', DeploymentController.getOne);

// GET  /api/deployments/:deploymentId/logs  → get deployment logs
router.get('/deployments/:deploymentId/logs', DeploymentController.getLogs);

// GET  /api/repos/:repoName/deployments/:deploymentId      → get single deployment (repo-scoped alias)
router.get('/repos/:repoName/deployments/:deploymentId', DeploymentController.getOne);

// GET  /api/repos/:repoName/deployments/:deploymentId/logs → get deployment logs (repo-scoped alias)
router.get('/repos/:repoName/deployments/:deploymentId/logs', DeploymentController.getLogs);

// GET  /api/queue/status                    → monitoring
router.get('/queue/status', DeploymentController.queueStatus);

export default router;
