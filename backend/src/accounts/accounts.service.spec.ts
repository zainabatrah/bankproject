/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from './accounts.service';

const matching = <T>(value: T): T => value;

describe('AccountsService', () => {
  let prisma: {
    user: { findUnique: jest.Mock };
    bankAccount: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let service: AccountsService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
      bankAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 11,
          accountNumber: 'BS1234567890',
          balance: 0,
          currency: 'USD',
          createdAt: new Date(),
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new AccountsService(prisma as unknown as PrismaService);
  });

  it('creates an account for an existing user with a generated account number', async () => {
    const result = await service.createAccount(7, 'USD');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(prisma.bankAccount.create).toHaveBeenCalledWith({
      data: matching(
        expect.objectContaining({
          accountNumber: expect.stringMatching(/^BS\d{10}$/),
          currency: 'USD',
          balance: 0,
          userId: 7,
        }),
      ),
      select: matching(
        expect.objectContaining({
          id: true,
          accountNumber: true,
          balance: true,
          currency: true,
        }),
      ),
    });
    expect(result).toMatchObject({ id: 11, currency: 'USD' });
  });

  it('retries account-number generation until it finds an unused value', async () => {
    prisma.bankAccount.findUnique
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(null);

    await service.createAccount(7, 'EUR');

    expect(prisma.bankAccount.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.bankAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: matching(expect.objectContaining({ currency: 'EUR' })),
      }),
    );
  });

  it('rejects account creation for a missing user', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(service.createAccount(404, 'USD')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.bankAccount.create).not.toHaveBeenCalled();
  });

  it('lists only the authenticated user accounts newest first', async () => {
    await service.getMyAccounts(7);

    expect(prisma.bankAccount.findMany).toHaveBeenCalledWith({
      where: { userId: 7 },
      select: {
        id: true,
        accountNumber: true,
        balance: true,
        currency: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  });
});
