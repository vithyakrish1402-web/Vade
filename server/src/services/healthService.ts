import type { HealthResponse } from '@enctxt/shared';
import { checkDatabaseConnection } from './db.js';

const startTime = Date.now();

export class HealthService {
  static async getHealthStatus(): Promise<HealthResponse> {
    const dbStatus = await checkDatabaseConnection();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      database: dbStatus,
      version: '0.1.0',
    };
  }
}
