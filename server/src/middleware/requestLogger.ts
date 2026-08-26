import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  logger.debug(`HTTP request received: ${req.method} ${req.originalUrl}`, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    logger.info(`HTTP request completed: ${req.method} ${req.originalUrl} ${statusCode} in ${duration}ms`, {
      method: req.method,
      url: req.originalUrl,
      statusCode,
      durationMs: duration,
    });
  });

  next();
}
