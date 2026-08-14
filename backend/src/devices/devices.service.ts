import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private detectBrowser(userAgent?: string): string {
    if (!userAgent) {
      return 'Unknown';
    }

    if (userAgent.includes('Edg/')) {
      return 'Edge';
    }

    if (userAgent.includes('Chrome/')) {
      return 'Chrome';
    }

    if (userAgent.includes('Firefox/')) {
      return 'Firefox';
    }

    if (userAgent.includes('Safari/')) {
      return 'Safari';
    }

    return 'Unknown';
  }

  private detectOS(userAgent?: string): string {
    if (!userAgent) {
      return 'Unknown';
    }

    if (userAgent.includes('Windows')) {
      return 'Windows';
    }

    if (userAgent.includes('Android')) {
      return 'Android';
    }

    if (
      userAgent.includes('iPhone') ||
      userAgent.includes('iPad')
    ) {
      return 'iOS';
    }

    if (userAgent.includes('Mac OS')) {
      return 'macOS';
    }

    if (userAgent.includes('Linux')) {
      return 'Linux';
    }

    return 'Unknown';
  }

  async registerDevice(
    userId: number,
    deviceId: string,
    userAgent?: string,
  ) {
    const existingDevice =
      await this.prisma.device.findUnique({
        where: {
          userId_deviceId: {
            userId,
            deviceId,
          },
        },
      });

    if (existingDevice) {
      const updatedDevice =
        await this.prisma.device.update({
          where: {
            id: existingDevice.id,
          },

          data: {
            lastSeen: new Date(),
            browser: this.detectBrowser(userAgent),
            os: this.detectOS(userAgent),
          },
        });

      return {
        device: updatedDevice,
        isNewDevice: false,
      };
    }

    const device =
      await this.prisma.device.create({
        data: {
          userId,
          deviceId,
          browser: this.detectBrowser(userAgent),
          os: this.detectOS(userAgent),
          trusted: false,
        },
      });

    return {
      device,
      isNewDevice: true,
    };
  }

  async isNewDevice(
    userId: number,
    deviceId: string,
  ): Promise<boolean> {
    const device =
      await this.prisma.device.findUnique({
        where: {
          userId_deviceId: {
            userId,
            deviceId,
          },
        },
      });

    // Device never seen before
    if (!device) {
      return true;
    }

    // Consider device "new" for its first 24 hours
    const deviceAge =
      Date.now() - device.firstSeen.getTime();

    const twentyFourHours =
      24 * 60 * 60 * 1000;

    return deviceAge < twentyFourHours;
  }

  async getMyDevices(userId: number) {
    return this.prisma.device.findMany({
      where: {
        userId,
      },

      orderBy: {
        lastSeen: 'desc',
      },

      select: {
        id: true,
        deviceId: true,
        browser: true,
        os: true,
        trusted: true,
        firstSeen: true,
        lastSeen: true,
      },
    });
  }
}