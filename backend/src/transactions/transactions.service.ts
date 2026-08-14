import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { FraudService } from '../fraud/fraud.service';
import { DevicesService } from '../devices/devices.service';

import { CreateTransferDto } from './dto/create-transfer.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly fraudService:
      FraudService,

    private readonly devicesService:
      DevicesService,
  ) {}

  async transfer(
    userId: number,
    dto: CreateTransferDto,
    deviceId: string,
  ) {
    // ----------------------------------
    // 1. VERIFY SENDER ACCOUNT
    // ----------------------------------

    const senderAccount =
      await this.prisma.bankAccount.findFirst({
        where: {
          id: dto.senderAccountId,
          userId,
        },
      });

    if (!senderAccount) {
      throw new NotFoundException(
        'Sender account not found',
      );
    }

    // ----------------------------------
    // 2. VERIFY BENEFICIARY
    // ----------------------------------

    const beneficiary =
      await this.prisma.beneficiary.findFirst({
        where: {
          id: dto.beneficiaryId,
          ownerId: userId,
        },
      });

    if (!beneficiary) {
      throw new NotFoundException(
        'Beneficiary not found',
      );
    }

    // ----------------------------------
    // 3. FIND RECEIVER ACCOUNT
    // ----------------------------------

    const receiverAccount =
      await this.prisma.bankAccount.findUnique({
        where: {
          accountNumber:
            beneficiary.accountNumber,
        },
      });

    if (!receiverAccount) {
      throw new NotFoundException(
        'Beneficiary bank account not found',
      );
    }

    // ----------------------------------
    // 4. PREVENT SELF TRANSFER
    // ----------------------------------

    if (
      senderAccount.id ===
      receiverAccount.id
    ) {
      throw new BadRequestException(
        'You cannot transfer money to the same account',
      );
    }

    // ----------------------------------
    // 5. CHECK CURRENCY
    // ----------------------------------

    if (
      senderAccount.currency !==
      receiverAccount.currency
    ) {
      throw new BadRequestException(
        'Account currencies do not match',
      );
    }

    // ----------------------------------
    // 6. CHECK BALANCE
    // ----------------------------------

    if (
      Number(senderAccount.balance) <
      dto.amount
    ) {
      throw new BadRequestException(
        'Insufficient balance',
      );
    }

    // ----------------------------------
    // 7. CREATE TRANSACTION REFERENCE
    // ----------------------------------

    const reference =
      `TX-${randomUUID()}`;

    // ==================================
    // CYBERSECURITY ANALYSIS
    // ==================================

    // ----------------------------------
    // 8. CHECK DEVICE
    // ----------------------------------

    const isNewDevice =
      await this.devicesService.isNewDevice(
        userId,
        deviceId,
      );

    // ----------------------------------
    // 9. COUNT TRANSACTIONS LAST HOUR
    // ----------------------------------

    const oneHourAgo =
      new Date(
        Date.now() -
          60 * 60 * 1000,
      );

    const transactionsLastHour =
      await this.prisma.transaction.count({
        where: {
          senderAccountId:
            senderAccount.id,

          createdAt: {
            gte: oneHourAgo,
          },
        },
      });

    // ----------------------------------
    // 10. CHECK BENEFICIARY AGE
    // ----------------------------------

    const beneficiaryAge =
      Date.now() -
      beneficiary.createdAt.getTime();

    const twentyFourHours =
      24 * 60 * 60 * 1000;

    const isNewBeneficiary =
      beneficiaryAge <
      twentyFourHours;

    // ----------------------------------
    // 11. SEND DATA TO PYTHON
    // ----------------------------------

    const fraudResult =
      await this.fraudService
        .analyzeTransaction({
          transaction_id:
            reference,

          user_id:
            userId,

          amount:
            dto.amount,

          new_device:
            isNewDevice,

          new_beneficiary:
            isNewBeneficiary,

          transactions_last_hour:
            transactionsLastHour,

          transaction_hour:
            new Date().getHours(),
        });

    // ==================================
    // HIGH / CRITICAL RISK
    // ==================================

    if (fraudResult.flagged) {
      return this.prisma.$transaction(
        async (tx) => {
          // Create transaction but
          // DO NOT move money.

          const transaction =
            await tx.transaction.create({
              data: {
                reference,

                amount:
                  dto.amount,

                currency:
                  senderAccount.currency,

                description:
                  dto.description?.trim(),

                type:
                  'TRANSFER',

                status:
                  'FLAGGED',

                senderAccountId:
                  senderAccount.id,

                receiverAccountId:
                  receiverAccount.id,

                riskScore:
                  fraudResult.risk_score,

                riskLevel:
                  fraudResult.risk_level,
              },
            });

          // Create security alert

          const fraudAlert =
            await tx.fraudAlert.create({
              data: {
                transactionId:
                  transaction.id,

                riskScore:
                  fraudResult.risk_score,

                riskLevel:
                  fraudResult.risk_level,

                reason:
                  fraudResult.reasons.join(
                    '; ',
                  ),
              },
            });

          return {
            message:
              'Transaction flagged for security review',

            transaction,

            fraudAlert,

            fraudAnalysis:
              fraudResult,
          };
        },
      );
    }

    // ==================================
    // LOW / MEDIUM RISK
    // ==================================

    return this.prisma.$transaction(
      async (tx) => {
        // --------------------------------
        // 12. DEBIT SENDER
        // --------------------------------

        const debitResult =
          await tx.bankAccount.updateMany({
            where: {
              id:
                senderAccount.id,

              userId,

              balance: {
                gte:
                  dto.amount,
              },
            },

            data: {
              balance: {
                decrement:
                  dto.amount,
              },
            },
          });

        if (
          debitResult.count !== 1
        ) {
          throw new BadRequestException(
            'Insufficient balance',
          );
        }

        // --------------------------------
        // 13. CREDIT RECEIVER
        // --------------------------------

        await tx.bankAccount.update({
          where: {
            id:
              receiverAccount.id,
          },

          data: {
            balance: {
              increment:
                dto.amount,
            },
          },
        });

        // --------------------------------
        // 14. SAVE TRANSACTION
        // --------------------------------

        const transaction =
          await tx.transaction.create({
            data: {
              reference,

              amount:
                dto.amount,

              currency:
                senderAccount.currency,

              description:
                dto.description?.trim(),

              type:
                'TRANSFER',

              status:
                'COMPLETED',

              senderAccountId:
                senderAccount.id,

              receiverAccountId:
                receiverAccount.id,

              riskScore:
                fraudResult.risk_score,

              riskLevel:
                fraudResult.risk_level,
            },
          });

        return {
          message:
            'Transaction completed successfully',

          transaction,

          fraudAnalysis:
            fraudResult,
        };
      },
    );
  }

  async getMyTransactions(
    userId: number,
  ) {
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

        senderAccountId:
          true,

        receiverAccountId:
          true,

        riskScore: true,
        riskLevel: true,
        createdAt: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}