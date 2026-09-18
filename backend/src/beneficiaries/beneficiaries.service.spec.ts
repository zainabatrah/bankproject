import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { BeneficiariesService } from './beneficiaries.service';

describe('BeneficiariesService', () => {
  const receiverAccount = {
    id: 21,
    accountNumber: 'BS200',
    userId: 8,
  };
  let prisma: {
    bankAccount: { findUnique: jest.Mock };
    beneficiary: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
  };
  let service: BeneficiariesService;

  beforeEach(() => {
    prisma = {
      bankAccount: { findUnique: jest.fn().mockResolvedValue(receiverAccount) },
      beneficiary: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 30 }),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    service = new BeneficiariesService(prisma as unknown as PrismaService);
  });

  it('creates a beneficiary for an existing external account', async () => {
    await service.create(7, {
      name: '  Receiver  ',
      accountNumber: ' BS200 ',
      bankName: '  BankShield  ',
    });

    expect(prisma.bankAccount.findUnique).toHaveBeenCalledWith({
      where: { accountNumber: 'BS200' },
    });
    expect(prisma.beneficiary.create).toHaveBeenCalledWith({
      data: {
        name: 'Receiver',
        accountNumber: 'BS200',
        bankName: 'BankShield',
        ownerId: 7,
      },
    });
  });

  it('rejects missing, own, and duplicate beneficiary accounts', async () => {
    prisma.bankAccount.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.create(7, { name: 'Missing', accountNumber: 'BS404' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.bankAccount.findUnique.mockResolvedValueOnce({
      ...receiverAccount,
      userId: 7,
    });
    await expect(
      service.create(7, { name: 'Self', accountNumber: 'BS100' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.bankAccount.findUnique.mockResolvedValueOnce(receiverAccount);
    prisma.beneficiary.findFirst.mockResolvedValueOnce({ id: 30 });
    await expect(
      service.create(7, { name: 'Duplicate', accountNumber: 'BS200' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists and removes only beneficiaries owned by the authenticated user', async () => {
    await service.findMine(7);
    expect(prisma.beneficiary.findMany).toHaveBeenCalledWith({
      where: { ownerId: 7 },
      orderBy: { createdAt: 'desc' },
    });

    prisma.beneficiary.findFirst.mockResolvedValueOnce({
      id: 30,
      ownerId: 7,
    });
    await service.remove(7, 30);
    expect(prisma.beneficiary.delete).toHaveBeenCalledWith({
      where: { id: 30 },
    });

    prisma.beneficiary.findFirst.mockResolvedValueOnce(null);
    await expect(service.remove(7, 404)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
