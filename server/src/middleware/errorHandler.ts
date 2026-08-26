import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import type { ApiErrorResponse } from '@enctxt/shared';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const errorHandler: ErrorRequestHandler = (
  err: Error | AppError,
  req: Request,
  res: Response<ApiErrorResponse>,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    logger.warn(`Application error: ${err.message}`, {
      code: err.code,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
    });

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Unhandled / system errors
  logger.error(`Unhandled server error: ${err.message}`, {
    name: err.name,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : err.message || 'Internal server error',
    },
  });
};
