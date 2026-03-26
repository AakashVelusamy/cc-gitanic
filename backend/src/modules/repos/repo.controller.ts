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
};
