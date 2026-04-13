// centralized error handling middleware
// catches and processes application-wide errors
// distinguishes operational from system errors
// sanitizes error messages for client delivery
// provides asynchronous error wrapping helpers

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export interface AppError extends Error {
  statusCode?: number;
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

  // log all errors internally
  logger.error(`[errorHandler] ${req.method} ${req.path} → ${statusCode}: ${err.message}`, {
    meta: {
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    },
  });

  // only surface operational error messages to the client
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

// wrap async handlers to forward errors to the global error handler
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

// create an operational apperror
export function createError(statusCode: number, message: string): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
}
