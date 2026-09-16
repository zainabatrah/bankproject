import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

import { ListFraudAlertsDto } from './dto/list-fraud-alerts.dto';
import { UpdateFraudAlertStatusDto } from './dto/update-fraud-alert-status.dto';

@Injectable()
export class FraudAlertsService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ==========================================
  // GET ALL FRAUD ALERTS
  // ==========================================

  async findAll(query?: ListFraudAlertsDto) {
    const filters = query ?? new ListFraudAlertsDto();
    const where: Prisma.FraudAlertWhereInput = {};
    const riskLevel = filters.riskLevel ?? filters.severity;

    if (riskLevel) where.riskLevel = riskLevel;
    if (filters.status) where.status = filters.status;
    if (
      filters.minRiskScore !== undefined ||
      filters.maxRiskScore !== undefined
    ) {
      where.riskScore = {
        ...(filters.minRiskScore !== undefined
          ? { gte: filters.minRiskScore }
          : {}),
        ...(filters.maxRiskScore !== undefined
          ? { lte: filters.maxRiskScore }
          : {}),
      };
    }

    return this.prisma.fraudAlert.findMany({
      where,
      skip: filters.skip,
      take: filters.limit,
      include: {
        transaction: {
          include: {
            senderAccount: {
              select: {
                id: true,
                accountNumber: true,
                currency: true,

                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },

            receiverAccount: {
              select: {
                id: true,
                accountNumber: true,
                currency: true,

                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getSummary(query?: ListFraudAlertsDto) {
    const filters = query ?? new ListFraudAlertsDto();
    const where: Prisma.FraudAlertWhereInput = {};
    const riskLevel = filters.riskLevel ?? filters.severity;

    if (riskLevel) where.riskLevel = riskLevel;
    if (filters.status) where.status = filters.status;
    if (
      filters.minRiskScore !== undefined ||
      filters.maxRiskScore !== undefined
    ) {
      where.riskScore = {
        ...(filters.minRiskScore !== undefined
          ? { gte: filters.minRiskScore }
          : {}),
        ...(filters.maxRiskScore !== undefined
          ? { lte: filters.maxRiskScore }
          : {}),
      };
    }

    const alerts = await this.prisma.fraudAlert.findMany({
      where,
      select: { riskLevel: true, status: true },
    });
    const byRiskLevel: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const alert of alerts) {
      byRiskLevel[alert.riskLevel] = (byRiskLevel[alert.riskLevel] ?? 0) + 1;
      byStatus[alert.status] = (byStatus[alert.status] ?? 0) + 1;
    }

    return {
      total: alerts.length,
      open: (byStatus.OPEN ?? 0) + (byStatus.INVESTIGATING ?? 0),
      byRiskLevel,
      byStatus,
    };
  }

  // ==========================================
  // GET ONE ALERT
  // ==========================================

  async findOne(id: number) {
    const alert = await this.prisma.fraudAlert.findUnique({
      where: {
        id,
      },

      include: {
        transaction: {
          include: {
            senderAccount: {
              select: {
                id: true,
                accountNumber: true,
                balance: true,
                currency: true,

                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    status: true,
                  },
                },
              },
            },

            receiverAccount: {
              select: {
                id: true,
                accountNumber: true,
                balance: true,
                currency: true,

                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!alert) {
      throw new NotFoundException('Fraud alert not found');
    }

    return alert;
  }

  // ==========================================
  // UPDATE ALERT STATUS + AUDIT LOG
  // ==========================================

  async updateStatus(
    id: number,
    dto: UpdateFraudAlertStatusDto,
    analystUserId: number,
  ) {
    const existingAlert = await this.prisma.fraudAlert.findUnique({
      where: {
        id,
      },

      include: {
        transaction: true,
      },
    });

    if (!existingAlert) {
      throw new NotFoundException('Fraud alert not found');
    }

    const oldStatus = existingAlert.status;

    if (oldStatus === dto.status) {
      throw new BadRequestException(
        'Fraud alert already has the requested status',
      );
    }

    const updatedAlert = await this.prisma.fraudAlert.update({
      where: {
        id,
      },

      data: {
        status: dto.status,
      },

      include: {
        transaction: true,
      },
    });

    // ========================================
    // CREATE AUDIT LOG
    // ========================================

    await this.auditLogsService.create({
      userId: analystUserId,

      action: 'FRAUD_ALERT_STATUS_CHANGED',

      resource: `FraudAlert:${id}`,

      result: 'SUCCESS',

      details: JSON.stringify({
        fraudAlertId: id,

        transactionId: updatedAlert.transactionId,

        previousStatus: oldStatus,

        newStatus: dto.status,

        riskScore: updatedAlert.riskScore,

        riskLevel: updatedAlert.riskLevel,
      }),
    });

    return {
      message: 'Fraud alert status updated successfully',

      alert: updatedAlert,
    };
  }
}
