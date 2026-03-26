/**
 * requestLogger.ts — HTTP request logging middleware
 *
 * Logs every incoming request (method, path, status, duration).
 * Uses the AppLogger EventEmitter so log lines flow through the
 * same observer pipeline as deployment logs.
 *
 * Architecture: Middleware Pattern + Observer (via logger)
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startMs = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startMs;
    const userId = (res.locals.user as { sub?: string } | undefined)?.sub;

    logger.info(`${req.method} ${req.path} → ${res.statusCode} (${durationMs}ms)`, {
      userId,
      meta: {
        method: req.method,
        path:   req.path,
        status: res.statusCode,
        durationMs,
        ip:     req.ip,
      },
    });
  });

  next();
}
