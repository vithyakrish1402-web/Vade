import type { Request, Response, NextFunction } from 'express';
import type { HealthResponse, ReadinessResponse } from '@enctxt/shared';
import { HealthService } from '../services/healthService.js';

export class HealthController {
  /**
   * GET /api/health (Liveness probe)
   */
  static async checkHealth(
    _req: Request,
    res: Response<HealthResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const healthData = await HealthService.getHealthStatus();
      res.status(200).json(healthData);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/health/ready or /api/ready (Readiness probe)
   */
  static async checkReadiness(
    _req: Request,
    res: Response<ReadinessResponse>,
    next: NextFunction
  ): Promise<void> {
    try {
      const readinessData = await HealthService.getReadinessStatus();
      const statusCode = readinessData.ready ? 200 : 503;
      res.status(statusCode).json(readinessData);
    } catch (error) {
      next(error);
    }
  }
}
