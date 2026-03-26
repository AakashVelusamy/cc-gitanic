/**
 * errorHandler.ts — Global Express error handler
 *
 * Must be registered LAST in the middleware chain (after all routes).
 * Catches any error passed via next(err) or thrown in async handlers
 * (when wrapped with asyncHandler).
 *
 * Architecture: Middleware Pattern
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export interface AppError extends Error {
  statusCode?: number;
  /** Set to true to expose the error message to the client */
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const isOperational = err.isOperational ?? false;

  // Log all errors internally
  logger.error(`[errorHandler] ${req.method} ${req.path} → ${statusCode}: ${err.message}`, {
    meta: {
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    },
  });

  // Only surface operational error messages to the client
  const clientMessage = isOperational
    ? err.message
    : 'An unexpected error occurred';

  res.status(statusCode).json({
    error: clientMessage,
    ...(process.env.NODE_ENV !== 'production' && !isOperational
      ? { detail: err.message }
      : {}),
  });
}

/**
 * asyncHandler — wraps an async route handler so errors are forwarded to
 * the global errorHandler without needing try/catch in every route.
 *
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res) => { ... }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/**
 * createError — factory for operational AppErrors.
 *
 * Usage:
 *   throw createError(404, 'Repository not found');
 */
export function createError(statusCode: number, message: string): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
}
