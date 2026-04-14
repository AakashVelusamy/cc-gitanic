// repository api routing
// exposes endpoints for repo lifecycle management
// mounts git object exploration and list services
// enforces jwt authentication on all member routes
// maps http verbs to repository controller actions

import { Router } from 'express';
import { RepoController } from '../modules/repos/repo.controller';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// public route for deployment resolution (must come before authmiddleware)
router.get('/resolve/:username/:repoName', RepoController.resolveDeployment);

// all repo routes are protected
router.use(authMiddleware);

// post   /api/repos         → create a new repo
router.post('/', RepoController.create);

// get    /api/repos         → list the caller's repos
router.get('/', RepoController.list);

// get    /api/repos/:reponame  → get one repo
router.get('/:repoName', RepoController.getOne);

// delete /api/repos/:reponame  → delete a repo
router.delete('/:repoName', RepoController.remove);

// patch /api/repos/:reponame  → rename a repo
router.patch('/:repoName', RepoController.rename);

// get /api/repos/:reponame/tree   → list tree entries
router.get('/:repoName/tree', RepoController.getTree);

// get /api/repos/:reponame/blob   → get file content
router.get('/:repoName/blob', RepoController.getBlob);

// get /api/repos/:reponame/commits → list commits
router.get('/:repoName/commits', RepoController.getCommits);

export default router;
