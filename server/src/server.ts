import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { checkDatabaseConnection, disconnectDatabase } from './services/db.js';
import { wsService } from './services/websocket.js';

async function startServer(): Promise<void> {
  const app = createApp();
  const server = http.createServer(app);

  // Initialize WebSocket server attached to HTTP server
  wsService.init(server);

  server.listen(config.PORT, () => {
    logger.info(`Server started successfully on port ${config.PORT}`, {
      port: config.PORT,
      environment: config.NODE_ENV,
      apiUrl: `http://localhost:${config.PORT}/api`,
      wsUrl: `ws://localhost:${config.PORT}/ws`,
      healthUrl: `http://localhost:${config.PORT}/api/health`,
    });
  });

  // Test database connection at startup
  checkDatabaseConnection()
    .then((dbStatus) => {
      if (dbStatus === 'connected') {
        logger.info('Database connected successfully');
      } else {
        logger.warn('Database is currently unreachable (server running in fallback state)');
      }
    })
    .catch((err) => {
      logger.warn('Database check encountered an error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

  // Graceful shutdown handling
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    // Hard timeout fallback after 30 seconds
    const hardTimeout = setTimeout(() => {
      logger.error('Could not close connections in time (30s limit), forcefully terminating');
      process.exit(1);
    }, 30000);

    // Unref so hardTimeout doesn't hold the event loop open if everything closes cleanly
    hardTimeout.unref();

    try {
      // 1. Drain and close all WebSocket connections
      await wsService.close();
      logger.info('WebSocket connections drained and closed');

      // 2. Stop accepting new HTTP requests
      await new Promise<void>((resolve) => {
        server.close((err) => {
          if (err) {
            logger.warn('Error during HTTP server close', { error: err.message });
          } else {
            logger.info('HTTP server closed');
          }
          resolve();
        });
      });

      // 3. Disconnect PostgreSQL Prisma client
      await disconnectDatabase();
      logger.info('Database connection closed cleanly');

      logger.info('Application shutdown complete. Exiting.');
      process.exit(0);
    } catch (err: any) {
      logger.error('Error occurred during graceful shutdown', { error: err?.message });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer().catch((err) => {
  logger.error('Failed to start server', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
