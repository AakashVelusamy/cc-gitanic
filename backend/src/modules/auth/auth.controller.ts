/**
 * auth.controller.ts — HTTP layer for auth endpoints
 *
 * Translates HTTP → service call → HTTP response.
 * No business logic or SQL lives here.
 * Architecture: MVC Controller
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';

export const AuthController = {
  /**
   * POST /api/auth/register
   *
   * Body:   { username: string, password: string }
   * 201:    { id: uuid, username: string }
   * 400:    validation error
   * 409:    username taken
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password } = req.body as { username?: string; password?: string };
      const result = await AuthService.register(username ?? '', password ?? '');
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/login
   *
   * Body:   { username: string, password: string }
   * 200:    { token: jwt }
   * 400:    missing fields
   * 401:    invalid credentials
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password } = req.body as { username?: string; password?: string };
      const result = await AuthService.login(username ?? '', password ?? '');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/auth/me
   * Protected — requires authMiddleware upstream.
   *
   * 200: { id: uuid, username: string }
   */
  async me(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sub: id, username } = res.locals.user;
      res.status(200).json({ id, username });
    } catch (err) {
      next(err);
    }
  },
};
