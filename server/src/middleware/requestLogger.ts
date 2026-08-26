import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import crypto from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = (req.headers['x-request-id'] as string) || `req_${crypto.randomBytes(8).toString('hex')}`;
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    // Log operational metadata only - never log request bodies or payloads
    logger.info(`HTTP ${req.method} ${req.originalUrl} ${statusCode} ${duration}ms`, {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode,
      durationMs: duration,
    });
  });

  next();
}
