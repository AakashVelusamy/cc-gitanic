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
      const { username, password, email } = req.body as {
        username?: string;
        password?: string;
        email?: string;
      };
      const result = await AuthService.register(username ?? '', password ?? '', email ?? '');
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
      const { sub: id } = res.locals.user;
      const me = await AuthService.me(id);
      res.status(200).json(me);
    } catch (err) {
      next(err);
    }
  },

  async updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sub: id } = res.locals.user;
      const updated = await AuthService.updateProfile(id, req.body);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  },
};
