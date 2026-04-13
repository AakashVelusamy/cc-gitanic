// authentication request handler
// maps login and registration requests to services
// coordinates otp issuance and verification cycles
// exposes user profile and self-management endpoints
// ensures structured responses for identity flows

import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';

export const AuthController = {
  async requestOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body as { email?: string };
      // fire and forget to prevent timeouts
      AuthService.requestOtp(email ?? '').catch((err) => {
        console.error('[OTP Error in Controller Bubble]', err);
      });
      res.status(202).json({ message: 'If the email is valid, an OTP will be sent shortly' });
    } catch (err) {
      next(err);
    }
  },

  // post /api/auth/register
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

  // post /api/auth/login
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, password } = req.body as { username?: string; password?: string };
      const result = await AuthService.login(username ?? '', password ?? '');
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },

  // get /api/auth/me
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
