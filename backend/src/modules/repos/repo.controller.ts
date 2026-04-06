/**
 * repo.controller.ts — HTTP layer for repository endpoints
 *
 * Translates HTTP → service call → HTTP response.
 * Architecture: MVC Controller
 */

import { Request, Response, NextFunction } from 'express';
import { RepoService } from './repo.service';

export const RepoController = {
  /**
   * POST /api/repos
   * Body: { name: string }
   * 201: { id, name, owner_id, auto_deploy_enabled, active_deployment_id, created_at, git_url }
   */
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

  /**
   * GET /api/repos
   * 200: RepoResult[]
   */
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sub: userId, username } = res.locals.user;
      const repos = await RepoService.list(userId, username);
      res.status(200).json(repos);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/repos/:repoName
   * 200: RepoResult
   * 404: not found
   */
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

  /**
   * DELETE /api/repos/:repoName
   * 204: deleted
   */
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

  /**
   * GET /api/repos/:repoName/tree?ref=HEAD&path=
   * 200: TreeEntry[]
   */
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

  /**
   * GET /api/repos/:repoName/blob?ref=HEAD&path=src/index.html
   * 200: BlobResult
   */
  async getBlob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username } = res.locals.user;
      const repoName = req.params['repoName'] as string;
      const ref = (req.query['ref'] as string | undefined) ?? 'HEAD';
      const filePath = (req.query['path'] as string | undefined) ?? '';
      if (!filePath) { res.status(400).json({ error: 'path is required' }); return; }
      const { RepoGitService } = await import('./repo.git.service');
      const blob = RepoGitService.getBlob(username, repoName, ref, filePath);
      res.status(200).json(blob);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/repos/:repoName/commits?ref=HEAD&limit=20
   * 200: CommitInfo[]
   */
  async getCommits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username } = res.locals.user;
      const repoName = req.params['repoName'] as string;
      const ref = (req.query['ref'] as string | undefined) ?? 'HEAD';
      const limit = Math.min(parseInt((req.query['limit'] as string | undefined) ?? '20', 10), 100);
      const { RepoGitService } = await import('./repo.git.service');
      const commits = RepoGitService.getCommits(username, repoName, ref, limit);
      res.status(200).json(commits);
    } catch (err) {
      next(err);
    }
  },
};
