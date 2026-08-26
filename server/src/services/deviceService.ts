import { getPrismaClient } from './db.js';
import { AppError } from '../utils/errors.js';
import type { RegisterDeviceInput, DeviceRecord } from '@enctxt/shared';
import { logger } from '../utils/logger.js';

export class DeviceService {
  /**
   * Retrieves all devices registered to a user.
   */
  static async getDevicesByUserId(userId: string): Promise<DeviceRecord[]> {
    const prisma = getPrismaClient();
    const devices = await prisma.device.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return devices.map((d: any) => ({
      id: d.id,
      userId: d.userId,
      deviceName: d.deviceName,
      platform: d.platform,
      keyId: d.keyId,
      status: d.status as 'active' | 'revoked',
      lastSeenAt: d.lastSeenAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }));
  }

  /**
   * Registers a new device or updates last seen timestamp.
   */
  static async registerDevice(userId: string, input: RegisterDeviceInput): Promise<DeviceRecord> {
    const prisma = getPrismaClient();
    const device = await prisma.device.create({
      data: {
        userId,
        deviceName: input.deviceName || 'Web Client',
        platform: input.platform || 'web',
        keyId: input.keyId,
        status: 'active',
      },
    });

    logger.info('Device registered', { userId, deviceId: device.id, deviceName: device.deviceName });

    return {
      id: device.id,
      userId: device.userId,
      deviceName: device.deviceName,
      platform: device.platform,
      keyId: device.keyId,
      status: device.status as 'active' | 'revoked',
      lastSeenAt: device.lastSeenAt.toISOString(),
      createdAt: device.createdAt.toISOString(),
      updatedAt: device.updatedAt.toISOString(),
    };
  }

  /**
   * Revokes a user device. Enforces ownership check.
   */
  static async revokeDevice(userId: string, deviceId: string): Promise<void> {
    const prisma = getPrismaClient();
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw AppError.notFound('Device not found');
    }

    if (device.userId !== userId) {
      throw AppError.forbidden('You are not authorized to revoke this device');
    }

    await prisma.device.update({
      where: { id: deviceId },
      data: { status: 'revoked' },
    });

    logger.info('Device revoked', { userId, deviceId });
  }
}
