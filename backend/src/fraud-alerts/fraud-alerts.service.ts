import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

import { UpdateFraudAlertStatusDto } from './dto/update-fraud-alert-status.dto';

@Injectable()
export class FraudAlertsService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly auditLogsService:
      AuditLogsService,
  ) {}

  // ==========================================
  // GET ALL FRAUD ALERTS
  // ==========================================

  async findAll() {
    return this.prisma.fraudAlert.findMany({
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

  // ==========================================
  // GET ONE ALERT
  // ==========================================

  async findOne(id: number) {
    const alert =
      await this.prisma.fraudAlert.findUnique({
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
      throw new NotFoundException(
        'Fraud alert not found',
      );
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
    const existingAlert =
      await this.prisma.fraudAlert.findUnique({
        where: {
          id,
        },

        include: {
          transaction: true,
        },
      });

    if (!existingAlert) {
      throw new NotFoundException(
        'Fraud alert not found',
      );
    }

    const oldStatus =
      existingAlert.status;

    const updatedAlert =
      await this.prisma.fraudAlert.update({
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

      action:
        'FRAUD_ALERT_STATUS_CHANGED',

      resource:
        `FraudAlert:${id}`,

      result:
        'SUCCESS',

      details:
        JSON.stringify({
          fraudAlertId: id,

          transactionId:
            updatedAlert.transactionId,

          previousStatus:
            oldStatus,

          newStatus:
            dto.status,

          riskScore:
            updatedAlert.riskScore,

          riskLevel:
            updatedAlert.riskLevel,
        }),
    });

    return {
      message:
        'Fraud alert status updated successfully',

      alert: updatedAlert,
    };
  }
}