/**
 * authMiddleware.ts — JWT authentication guard
 *
 * Verifies a Bearer token in the Authorization header.
 * On success, attaches decoded payload to res.locals.user.
 * On failure, responds 401 — no business logic leaks through.
 *
 * Architecture: Middleware Pattern
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  sub: string;      // user UUID
  username: string;
  iat: number;
  exp: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user: AuthPayload;
    }
  }
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET not set' });
    return;
  }

  try {
    // Explicitly specify algorithm to prevent algorithm-confusion attacks (S5659)
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as AuthPayload;
    res.locals.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
