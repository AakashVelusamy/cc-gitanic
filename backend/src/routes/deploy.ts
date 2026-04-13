// deployment api routing
// exposes endpoints for pipeline control
// provides real-time and historical log access
// mounts queue status and monitoring services
// secures deployment actions with auth guards

import { Router } from 'express';
import { DeploymentController } from '../modules/deployment/deployment.controller';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

// post /api/repos/:reponame/deploy          → enqueue deployment
router.post('/repos/:repoName/deploy', DeploymentController.enqueue);

// delete /api/repos/:reponame/deploy          → undeploy active site
router.delete('/repos/:repoName/deploy', DeploymentController.undeploy);

// get  /api/repos/:reponame/deployments     → list deployments for repo
router.get('/repos/:repoName/deployments', DeploymentController.list);

// get  /api/deployments/:deploymentid       → get single deployment
router.get('/deployments/:deploymentId', DeploymentController.getOne);

// get  /api/deployments/:deploymentid/logs  → get deployment logs
router.get('/deployments/:deploymentId/logs', DeploymentController.getLogs);

// get  /api/repos/:reponame/deployments/:deploymentid      → get single deployment (repo-scoped alias)
router.get('/repos/:repoName/deployments/:deploymentId', DeploymentController.getOne);

// get  /api/repos/:reponame/deployments/:deploymentid/logs → get deployment logs (repo-scoped alias)
router.get('/repos/:repoName/deployments/:deploymentId/logs', DeploymentController.getLogs);

// get  /api/queue/status                    → monitoring
router.get('/queue/status', DeploymentController.queueStatus);

export default router;
