// repository request handler
// facilitates repository creation and deletion
// exposes git tree and blob exploration apis
// provides commit history and metadata retrieval
// resolves live deployment ids for site delivery

import { Request, Response, NextFunction } from 'express';
import { RepoService } from './repo.service';

export const RepoController = {
  // post /api/repos
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sub: userId, username } = res.locals.user;
      const { name } = req.body as { name?: string };
      const result = await RepoService.create(userId, username, name ?? '');
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  // get /api/repos
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sub: userId, username } = res.locals.user;
      const repos = await RepoService.list(userId, username);
      res.status(200).json(repos);
    } catch (err) {
      next(err);
    }
  },

  // get /api/repos/:reponame
  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sub: userId, username } = res.locals.user;
      const repoName = req.params['repoName'] as string;
      const repo = await RepoService.getByName(userId, username, repoName);
      res.status(200).json(repo);
    } catch (err) {
      next(err);
    }
  },

  // delete /api/repos/:reponame
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sub: userId, username } = res.locals.user;
      const repoName = req.params['repoName'] as string;
      await RepoService.delete(userId, username, repoName);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  // patch /api/repos/:reponame
  async rename(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sub: userId, username } = res.locals.user;
      const oldName = req.params['repoName'] as string;
      const { name: newName } = req.body as { name?: string };
      if (!newName) {
        res.status(400).json({ error: 'New repository name is required' });
        return;
      }
      await RepoService.rename(userId, username, oldName, newName);
      res.status(200).json({ success: true, name: newName });
    } catch (err) {
      next(err);
    }
  },

  // get /api/repos/:reponame/tree
  async getTree(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username } = res.locals.user;
      const repoName = req.params['repoName'] as string;
      const ref = (req.query['ref'] as string | undefined) ?? 'HEAD';
      const treePath = (req.query['path'] as string | undefined) ?? '';
      const { RepoGitService } = await import('./repo.git.service');
      const entries = RepoGitService.listTree(username, repoName, ref, treePath);
      res.status(200).json(entries);
    } catch (err) {
      next(err);
    }
  },

  // get /api/repos/:reponame/blob
  async getBlob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username } = res.locals.user;
      const repoName = req.params['repoName'] as string;
      const ref = (req.query['ref'] as string | undefined) ?? 'HEAD';
      const filePath = (req.query['path'] as string | undefined) ?? '';
      if (!filePath) { res.status(400).json({ error: 'path is required' }); return; }
      const { RepoGitService } = await import('./repo.git.service');
      const blob = RepoGitService.getBlob(username, repoName, filePath, ref);
      res.status(200).json(blob);
    } catch (err) {
      next(err);
    }
  },

  // get /api/repos/:reponame/commits
  async getCommits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username } = res.locals.user;
      const repoName = req.params['repoName'] as string;
      const ref = (req.query['ref'] as string | undefined) ?? 'HEAD';
      const limit = Math.min(Number.parseInt((req.query['limit'] as string | undefined) ?? '20', 10), 100);
      const { RepoGitService } = await import('./repo.git.service');
      const commits = RepoGitService.getCommits(username, repoName, ref, limit);
      res.status(200).json(commits);
    } catch (err) {
      next(err);
    }
  },

  // get /api/repos/resolve/:username/:reponame
  async resolveDeployment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, repoName } = req.params;
      const deploymentId = await RepoService.resolveDeploymentId(username ?? '', repoName ?? '');
      if (!deploymentId) {
        res.status(404).json({ error: 'Deployment not found' });
        return;
      }
      res.status(200).json({ deploymentId });
    } catch (err) {
      next(err);
    }
  },
};
