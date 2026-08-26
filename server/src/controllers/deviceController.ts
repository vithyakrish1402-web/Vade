import type { Request, Response, NextFunction } from 'express';
import { DeviceService } from '../services/deviceService.js';
import { AppError } from '../utils/errors.js';

export class DeviceController {
  /**
   * GET /api/devices
   * List all devices belonging to the authenticated user.
   */
  async listDevices(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const devices = await DeviceService.getDevicesByUserId(userId);

      res.status(200).json({ devices });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/devices/register
   * Register a new device for the authenticated user.
   */
  async registerDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { deviceName, platform, keyId } = req.body;

      if (!keyId || typeof keyId !== 'string') {
        throw AppError.validationFailed('keyId is required');
      }

      const device = await DeviceService.registerDevice(userId, {
        deviceName: deviceName || 'Web Browser',
        platform: platform || 'web',
        keyId,
      });

      res.status(201).json({ device });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/devices/:id/revoke
   * Revoke a registered device.
   */
  async revokeDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      await DeviceService.revokeDevice(userId, id);

      res.status(200).json({ success: true, revokedDeviceId: id });
    } catch (error) {
      next(error);
    }
  }
}

export const deviceController = new DeviceController();
