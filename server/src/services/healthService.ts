import type { HealthResponse, ReadinessResponse } from '@enctxt/shared';
import { checkDatabaseConnection } from './db.js';

const startTime = Date.now();

export class HealthService {
  /**
   * Liveness probe: verifies process is alive and responsive.
   */
  static async getHealthStatus(): Promise<HealthResponse> {
    const dbStatus = await checkDatabaseConnection();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      database: dbStatus,
      version: '1.0.0-rc.1',
    };
  }

  /**
   * Readiness probe: verifies server is ready to accept production traffic (database is reachable).
   */
  static async getReadinessStatus(): Promise<ReadinessResponse> {
    const dbStatus = await checkDatabaseConnection();
    const ready = dbStatus === 'connected';

    return {
      ready,
      database: dbStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
