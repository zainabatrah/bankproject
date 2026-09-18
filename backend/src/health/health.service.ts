import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check() {
    const checkedAt = new Date().toISOString();

    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');

      return {
        status: 'ok',
        checkedAt,
        services: {
          api: { status: 'ok' },
          database: { status: 'ok' },
        },
      };
    } catch {
      return {
        status: 'degraded',
        checkedAt,
        services: {
          api: { status: 'ok' },
          database: { status: 'unavailable' },
        },
      };
    }
  }
}
