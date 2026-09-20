import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { createHash, randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { FraudAnalysisResponse, FraudService } from '../fraud/fraud.service';
import { DevicesService } from '../devices/devices.service';

import { CreateTransferDto } from './dto/create-transfer.dto';

const PER_TRANSFER_LIMIT = 10_000;
const DAILY_TRANSFER_LIMIT = 25_000;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,

    private readonly fraudService: FraudService,

    private readonly devicesService: DevicesService,
  ) {}

  private normalizeIdempotencyKey(idempotencyKey?: string) {
    const normalized = idempotencyKey?.trim();
    return normalized ? normalized : undefined;
  }

  private getTransferFingerprint(userId: number, dto: CreateTransferDto) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          userId,
          senderAccountId: dto.senderAccountId,
          beneficiaryId: dto.beneficiaryId,
          amount: Number(dto.amount).toFixed(2),
          description: dto.description?.trim() ?? null,
        }),
      )
      .digest('hex');
  }

  private async findIdempotentTransfer(
    userId: number,
    idempotencyKey: string,
    fingerprint: string,
  ) {
    const existing = await this.prisma.transaction.findUnique({
      where: { idempotencyKey },
      include: {
        fraudAlert: true,
        senderAccount: { select: { userId: true } },
      },
    });

    if (!existing) return null;

    if (existing.senderAccount?.userId !== userId) {
      throw new ConflictException('Idempotency key is already in use');
    }

    if (existing.idempotencyFingerprint !== fingerprint) {
      throw new ConflictException(
        'Idempotency key was already used for a different transfer',
      );
    }

    return {
      message:
        existing.status === 'REJECTED'
          ? 'Transfer rejected because fraud detection service is unavailable'
          : existing.status === 'FLAGGED'
            ? 'Transaction flagged for security review'
            : 'Transaction completed successfully',
      transaction: existing,
      ...(existing.fraudAlert ? { fraudAlert: existing.fraudAlert } : {}),
      idempotentReplay: true,
    };
  }

  private async enforceTransferLimits(senderAccountId: number, amount: number) {
    if (amount > PER_TRANSFER_LIMIT) {
      throw new BadRequestException(
        `Transfer amount exceeds the per-transfer limit of ${PER_TRANSFER_LIMIT}`,
      );
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const dailyTotal = await this.prisma.transaction.aggregate({
      where: {
        senderAccountId,
        type: 'TRANSFER',
        status: { in: ['COMPLETED', 'FLAGGED'] },
        createdAt: { gte: startOfDay },
      },
      _sum: { amount: true },
    });
    const usedToday = Number(dailyTotal._sum.amount ?? 0);

    if (usedToday + amount > DAILY_TRANSFER_LIMIT) {
      throw new BadRequestException(
        `Transfer would exceed the daily transfer limit of ${DAILY_TRANSFER_LIMIT}`,
      );
    }
  }

  private async recordFraudServiceFailure(data: {
    userId: number;
    senderAccountId: number;
    receiverAccountId: number;
    amount: number;
    currency: string;
    description?: string;
    reference: string;
    idempotencyKey?: string;
    idempotencyFingerprint?: string;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          reference: data.reference,
          idempotencyKey: data.idempotencyKey,
          idempotencyFingerprint: data.idempotencyFingerprint,
          amount: data.amount,
          currency: data.currency,
          description: data.description?.trim(),
          type: 'TRANSFER',
          status: 'REJECTED',
          senderAccountId: data.senderAccountId,
          receiverAccountId: data.receiverAccountId,
        },
      });

      await tx.securityEvent.create({
        data: {
          userId: data.userId,
          eventType: 'FRAUD_SERVICE_UNAVAILABLE',
          description:
            'Transfer was rejected because fraud detection service was unavailable',
          riskLevel: 'HIGH',
        },
      });

      await tx.auditLog.create({
        data: {
          userId: data.userId,
          action: 'TRANSFER_REJECTED_FRAUD_SERVICE_UNAVAILABLE',
          resource: `Transaction:${transaction.id}`,
          result: 'FAILURE',
          details: JSON.stringify({
            reference: data.reference,
            amount: data.amount,
            currency: data.currency,
            senderAccountId: data.senderAccountId,
            receiverAccountId: data.receiverAccountId,
          }),
        },
      });
    });
  }

  async transfer(
    userId: number,
    dto: CreateTransferDto,
    deviceId: string,
    idempotencyKey?: string,
  ) {
    const normalizedIdempotencyKey =
      this.normalizeIdempotencyKey(idempotencyKey);
    const idempotencyFingerprint = normalizedIdempotencyKey
      ? this.getTransferFingerprint(userId, dto)
      : undefined;

    if (normalizedIdempotencyKey && idempotencyFingerprint) {
      const existingTransfer = await this.findIdempotentTransfer(
        userId,
        normalizedIdempotencyKey,
        idempotencyFingerprint,
      );
      if (existingTransfer) return existingTransfer;
    }

    // ----------------------------------
    // 1. VERIFY SENDER ACCOUNT
    // ----------------------------------

    const senderAccount = await this.prisma.bankAccount.findFirst({
      where: {
        id: dto.senderAccountId,
        userId,
      },
    });

    if (!senderAccount) {
      throw new NotFoundException('Sender account not found');
    }

    // ----------------------------------
    // 2. VERIFY BENEFICIARY
    // ----------------------------------

    const beneficiary = await this.prisma.beneficiary.findFirst({
      where: {
        id: dto.beneficiaryId,
        ownerId: userId,
      },
    });

    if (!beneficiary) {
      throw new NotFoundException('Beneficiary not found');
    }

    // ----------------------------------
    // 3. FIND RECEIVER ACCOUNT
    // ----------------------------------

    const receiverAccount = await this.prisma.bankAccount.findUnique({
      where: {
        accountNumber: beneficiary.accountNumber,
      },
    });

    if (!receiverAccount) {
      throw new NotFoundException('Beneficiary bank account not found');
    }

    // ----------------------------------
    // 4. PREVENT SELF TRANSFER
    // ----------------------------------

    if (senderAccount.id === receiverAccount.id) {
      throw new BadRequestException(
        'You cannot transfer money to the same account',
      );
    }

    // ----------------------------------
    // 5. CHECK CURRENCY
    // ----------------------------------

    if (senderAccount.currency !== receiverAccount.currency) {
      throw new BadRequestException('Account currencies do not match');
    }

    // ----------------------------------
    // 6. CHECK BALANCE
    // ----------------------------------

    if (Number(senderAccount.balance) < dto.amount) {
      throw new BadRequestException('Insufficient balance');
    }

    await this.enforceTransferLimits(senderAccount.id, dto.amount);

    // ----------------------------------
    // 7. CREATE TRANSACTION REFERENCE
    // ----------------------------------

    const reference = `TX-${randomUUID()}`;

    // ==================================
    // CYBERSECURITY ANALYSIS
    // ==================================

    // ----------------------------------
    // 8. CHECK DEVICE
    // ----------------------------------

    const isNewDevice = await this.devicesService.isNewDevice(userId, deviceId);

    // ----------------------------------
    // 9. COUNT TRANSACTIONS LAST HOUR
    // ----------------------------------

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const transactionsLastHour = await this.prisma.transaction.count({
      where: {
        senderAccountId: senderAccount.id,

        createdAt: {
          gte: oneHourAgo,
        },
      },
    });

    // ----------------------------------
    // 10. CALCULATE AVERAGE AMOUNT
    // ----------------------------------

    const historicalTransactions = await this.prisma.transaction.aggregate({
      where: {
        senderAccountId: senderAccount.id,
      },
      _avg: {
        amount: true,
      },
    });

    const averageAmount = Number(
      historicalTransactions._avg.amount ?? dto.amount,
    );

    // ----------------------------------
    // 11. COUNT FAILED LOGINS LAST HOUR
    // ----------------------------------

    const failedLoginsLastHour = await this.prisma.auditLog.count({
      where: {
        userId,
        action: 'LOGIN_FAILED',
        createdAt: {
          gte: oneHourAgo,
        },
      },
    });

    // ----------------------------------
    // 10. CHECK BENEFICIARY AGE
    // ----------------------------------

    const beneficiaryAge = Date.now() - beneficiary.createdAt.getTime();

    const twentyFourHours = 24 * 60 * 60 * 1000;

    const isNewBeneficiary = beneficiaryAge < twentyFourHours;

    // ----------------------------------
    // 11. SEND DATA TO PYTHON
    // ----------------------------------

    let fraudResult: FraudAnalysisResponse;
    try {
      fraudResult = await this.fraudService.analyzeTransaction({
        amount: dto.amount,

        average_amount: averageAmount,

        new_device: isNewDevice,

        new_beneficiary: isNewBeneficiary,

        transactions_last_hour: transactionsLastHour,

        failed_logins_last_hour: failedLoginsLastHour,

        transaction_hour: new Date().getHours(),
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        await this.recordFraudServiceFailure({
          userId,
          senderAccountId: senderAccount.id,
          receiverAccountId: receiverAccount.id,
          amount: dto.amount,
          currency: senderAccount.currency,
          description: dto.description,
          reference,
          idempotencyKey: normalizedIdempotencyKey,
          idempotencyFingerprint,
        });
      }

      throw error;
    }

    // ==================================
    // HIGH / CRITICAL RISK
    // ==================================

    if (fraudResult.flagged) {
      return this.prisma.$transaction(async (tx) => {
        // Create transaction but
        // DO NOT move money.

        const transaction = await tx.transaction.create({
          data: {
            reference,
            idempotencyKey: normalizedIdempotencyKey,
            idempotencyFingerprint,

            amount: dto.amount,

            currency: senderAccount.currency,

            description: dto.description?.trim(),

            type: 'TRANSFER',

            status: 'FLAGGED',

            senderAccountId: senderAccount.id,

            receiverAccountId: receiverAccount.id,

            riskScore: fraudResult.risk_score,

            riskLevel: fraudResult.risk_level,
          },
        });

        // Create security alert

        const fraudAlert = await tx.fraudAlert.create({
          data: {
            transactionId: transaction.id,

            riskScore: fraudResult.risk_score,

            riskLevel: fraudResult.risk_level,

            reason: fraudResult.reasons.join('; '),
          },
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: 'TRANSFER_FLAGGED',
            resource: `Transaction:${transaction.id}`,
            result: 'SUCCESS',
            details: JSON.stringify({
              reference,
              amount: dto.amount,
              currency: senderAccount.currency,
              fraudAlertId: fraudAlert.id,
              riskScore: fraudResult.risk_score,
              riskLevel: fraudResult.risk_level,
            }),
          },
        });

        return {
          message: 'Transaction flagged for security review',

          transaction,

          fraudAlert,

          fraudAnalysis: fraudResult,
        };
      });
    }

    // ==================================
    // LOW / MEDIUM RISK
    // ==================================

    return this.prisma.$transaction(async (tx) => {
      // --------------------------------
      // 12. DEBIT SENDER
      // --------------------------------

      const debitResult = await tx.bankAccount.updateMany({
        where: {
          id: senderAccount.id,

          userId,

          balance: {
            gte: dto.amount,
          },
        },

        data: {
          balance: {
            decrement: dto.amount,
          },
        },
      });

      if (debitResult.count !== 1) {
        throw new BadRequestException('Insufficient balance');
      }

      // --------------------------------
      // 13. CREDIT RECEIVER
      // --------------------------------

      await tx.bankAccount.update({
        where: {
          id: receiverAccount.id,
        },

        data: {
          balance: {
            increment: dto.amount,
          },
        },
      });

      // --------------------------------
      // 14. SAVE TRANSACTION
      // --------------------------------

      const transaction = await tx.transaction.create({
        data: {
          reference,
          idempotencyKey: normalizedIdempotencyKey,
          idempotencyFingerprint,

          amount: dto.amount,

          currency: senderAccount.currency,

          description: dto.description?.trim(),

          type: 'TRANSFER',

          status: 'COMPLETED',

          senderAccountId: senderAccount.id,

          receiverAccountId: receiverAccount.id,

          riskScore: fraudResult.risk_score,

          riskLevel: fraudResult.risk_level,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'TRANSFER_COMPLETED',
          resource: `Transaction:${transaction.id}`,
          result: 'SUCCESS',
          details: JSON.stringify({
            reference,
            amount: dto.amount,
            currency: senderAccount.currency,
            senderAccountId: senderAccount.id,
            receiverAccountId: receiverAccount.id,
            riskScore: fraudResult.risk_score,
            riskLevel: fraudResult.risk_level,
          }),
        },
      });

      return {
        message: 'Transaction completed successfully',

        transaction,

        fraudAnalysis: fraudResult,
      };
    });
  }

  async getMyTransactions(userId: number) {
    return this.prisma.transaction.findMany({
      where: {
        OR: [
          {
            senderAccount: {
              userId,
            },
          },

          {
            receiverAccount: {
              userId,
            },
          },
        ],
      },

      select: {
        id: true,
        reference: true,
        amount: true,
        currency: true,
        description: true,
        type: true,
        status: true,

        senderAccountId: true,

        receiverAccountId: true,

        riskScore: true,
        riskLevel: true,
        reversedAt: true,
        reversalReason: true,
        createdAt: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async reverse(userId: number, transactionId: number, reason: string) {
    const normalizedReason = reason.trim();
    const original = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        senderAccount: { select: { id: true, userId: true } },
        receiverAccount: { select: { id: true, balance: true } },
      },
    });

    if (!original || original.senderAccount?.userId !== userId) {
      throw new NotFoundException('Transaction not found');
    }

    if (original.type !== 'TRANSFER') {
      throw new BadRequestException('Only transfers can be reversed');
    }

    if (original.status === 'REVERSED') {
      throw new ConflictException('Transaction has already been reversed');
    }

    if (original.status !== 'COMPLETED') {
      throw new BadRequestException('Only completed transfers can be reversed');
    }

    if (!original.senderAccountId || !original.receiverAccountId) {
      throw new BadRequestException('Transaction accounts are incomplete');
    }

    const amount = Number(original.amount);
    const senderAccountId = original.senderAccountId;
    const receiverAccountId = original.receiverAccountId;

    if (Number(original.receiverAccount?.balance ?? 0) < amount) {
      throw new BadRequestException(
        'Receiver account has insufficient balance for reversal',
      );
    }

    const reversedTransaction = await this.prisma.$transaction(async (tx) => {
      const receiverDebit = await tx.bankAccount.updateMany({
        where: {
          id: receiverAccountId,
          balance: { gte: amount },
        },
        data: {
          balance: { decrement: amount },
        },
      });

      if (receiverDebit.count !== 1) {
        throw new BadRequestException(
          'Receiver account has insufficient balance for reversal',
        );
      }

      await tx.bankAccount.update({
        where: { id: senderAccountId },
        data: {
          balance: { increment: amount },
        },
      });

      const updateResult = await tx.transaction.updateMany({
        where: { id: transactionId, status: 'COMPLETED' },
        data: {
          status: 'REVERSED',
          reversedAt: new Date(),
          reversedById: userId,
          reversalReason: normalizedReason,
        },
      });

      if (updateResult.count !== 1) {
        throw new ConflictException('Transaction could not be reversed');
      }

      const updated = await tx.transaction.findUnique({
        where: { id: transactionId },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'TRANSFER_REVERSED',
          resource: `Transaction:${transactionId}`,
          result: 'SUCCESS',
          details: JSON.stringify({
            reference: original.reference,
            amount,
            currency: original.currency,
            senderAccountId,
            receiverAccountId,
            reason: normalizedReason,
          }),
        },
      });

      await tx.securityEvent.create({
        data: {
          userId,
          eventType: 'TRANSFER_REVERSED',
          description: `Transfer ${original.reference} was reversed`,
          riskLevel: 'MEDIUM',
        },
      });

      return updated;
    });

    return {
      message: 'Transaction reversed successfully',
      transaction: reversedTransaction,
    };
  }
}
