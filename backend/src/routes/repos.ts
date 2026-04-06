/**
 * routes/repos.ts — Repository router
 * All routes require JWT authentication.
 */

import { Router } from 'express';
import { RepoController } from '../modules/repos/repo.controller';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// All repo routes are protected
router.use(authMiddleware);

// POST   /api/repos         → create a new repo
router.post('/', RepoController.create);

// GET    /api/repos         → list the caller's repos
router.get('/', RepoController.list);

// GET    /api/repos/:repoName  → get one repo
router.get('/:repoName', RepoController.getOne);

// DELETE /api/repos/:repoName  → delete a repo
router.delete('/:repoName', RepoController.remove);

// GET /api/repos/:repoName/tree   → list tree entries
router.get('/:repoName/tree', RepoController.getTree);

// GET /api/repos/:repoName/blob   → get file content
router.get('/:repoName/blob', RepoController.getBlob);

// GET /api/repos/:repoName/commits → list commits
router.get('/:repoName/commits', RepoController.getCommits);

export default router;
