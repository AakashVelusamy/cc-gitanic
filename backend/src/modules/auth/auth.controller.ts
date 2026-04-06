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
  async requestOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body as { email?: string };
      // Do not await this. Fire and forget to free the http thread and prevent Vercel 504 timeouts.
      // If it fails, the frontend will just let them try again in 60s.
      AuthService.requestOtp(email ?? '').catch((err) => {
        console.error('[OTP Error in Controller Bubble]', err);
      });
      res.status(202).json({ message: 'If the email is valid, an OTP will be sent shortly' });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/register
   *
   * Body:   { username, password, email, otp }
   * 201:    { id, username, token } — auto-login on registration
   * 400:    validation error / invalid OTP
   * 409:    username or email taken
   * 429:    too many OTP attempts
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password, email, otp } = req.body as {
        username?: string;
        password?: string;
        email?: string;
        otp?: string;
      };
      const result = await AuthService.register(username ?? '', password ?? '', email ?? '', otp ?? '');
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
