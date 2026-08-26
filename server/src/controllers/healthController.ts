import type { Request, Response, NextFunction } from 'express';
import type { HealthResponse } from '@enctxt/shared';
import { HealthService } from '../services/healthService.js';

export class HealthController {
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
}
