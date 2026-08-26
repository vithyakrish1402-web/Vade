import { createApp } from './app.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import { checkDatabaseConnection, disconnectDatabase } from './services/db.js';

async function startServer(): Promise<void> {
  const app = createApp();

  const server = app.listen(config.PORT, () => {
    logger.info(`Server started successfully on port ${config.PORT}`, {
      port: config.PORT,
      environment: config.NODE_ENV,
      apiUrl: `http://localhost:${config.PORT}/api`,
      healthUrl: `http://localhost:${config.PORT}/api/health`,
    });
  });

  // Test database connection at startup in background
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
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      logger.info('HTTP server closed');
      await disconnectDatabase();
      logger.info('Application shutdown complete');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
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
