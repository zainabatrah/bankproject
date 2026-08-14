import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private async generateAccountNumber(): Promise<string> {
    let accountNumber: string;
    let existingAccount: unknown;

    do {
      accountNumber = `BS${randomInt(
        1000000000,
        9999999999,
      )}`;

      existingAccount =
        await this.prisma.bankAccount.findUnique({
          where: {
            accountNumber,
          },
        });
    } while (existingAccount);

    return accountNumber;
  }

  async createAccount(
    userId: number,
    currency: string,
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'User not found',
      );
    }

    const accountNumber =
      await this.generateAccountNumber();

    return this.prisma.bankAccount.create({
      data: {
        accountNumber,
        currency,
        balance: 0,
        userId,
      },
      select: {
        id: true,
        accountNumber: true,
        balance: true,
        currency: true,
        createdAt: true,
      },
    });
  }

  async getMyAccounts(userId: number) {
    return this.prisma.bankAccount.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        accountNumber: true,
        balance: true,
        currency: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}