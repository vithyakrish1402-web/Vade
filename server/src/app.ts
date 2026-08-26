import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { requestLogger } from './middleware/requestLogger.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import apiRouter from './routes/index.js';

export function createApp(): Express {
  const app = express();

  // Security headers
  app.use(securityHeaders);

  // CORS & cookies
  app.use(
    cors({
      origin: [config.CORS_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Request logging
  app.use(requestLogger);

  // Mount API routes under /api
  app.use('/api', apiRouter);

  // 404 handler
  app.use(notFoundHandler);

  // Centralized error handler
  app.use(errorHandler);

  return app;
}
