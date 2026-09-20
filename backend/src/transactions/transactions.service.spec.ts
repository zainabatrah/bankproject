/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { DevicesService } from '../devices/devices.service';
import { FraudService } from '../fraud/fraud.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from './transactions.service';

const matching = <T>(value: T): T => value;

describe('TransactionsService', () => {
  const senderAccount = {
    id: 10,
    accountNumber: 'BS100',
    balance: 30_000,
    currency: 'USD',
    userId: 7,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const receiverAccount = {
    id: 20,
    accountNumber: 'BS200',
    balance: 500,
    currency: 'USD',
    userId: 8,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const beneficiary = {
    id: 30,
    name: 'Receiver',
    accountNumber: receiverAccount.accountNumber,
    bankName: 'BankShield',
    ownerId: 7,
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    updatedAt: new Date(),
  };

  let prisma: {
    transaction: {
      findUnique: jest.Mock;
      aggregate: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    bankAccount: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    beneficiary: { findFirst: jest.Mock };
    fraudAlert: { create: jest.Mock };
    auditLog: {
      create: jest.Mock;
      count: jest.Mock;
    };
    securityEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let fraudService: { analyzeTransaction: jest.Mock };
  let devicesService: { isNewDevice: jest.Mock };
  let service: TransactionsService;

  beforeEach(() => {
    prisma = {
      transaction: {
        findUnique: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount: 0 },
          _avg: { amount: 125 },
        }),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 99,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      bankAccount: {
        findFirst: jest.fn().mockResolvedValue(senderAccount),
        findUnique: jest.fn().mockResolvedValue(receiverAccount),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue(receiverAccount),
      },
      beneficiary: { findFirst: jest.fn().mockResolvedValue(beneficiary) },
      fraudAlert: { create: jest.fn() },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      securityEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn((callback: (tx: typeof prisma) => unknown) =>
        Promise.resolve(callback(prisma)),
      ),
    };
    fraudService = {
      analyzeTransaction: jest.fn().mockResolvedValue({
        risk_score: 12,
        risk_level: 'LOW',
        flagged: false,
        reasons: [],
      }),
    };
    devicesService = { isNewDevice: jest.fn().mockResolvedValue(false) };
    service = new TransactionsService(
      prisma as unknown as PrismaService,
      fraudService as unknown as FraudService,
      devicesService as unknown as DevicesService,
    );
  });

  it('stores an idempotency key on new transfers', async () => {
    const result = await service.transfer(
      7,
      { senderAccountId: 10, beneficiaryId: 30, amount: 125 },
      'device-1',
      'transfer-key-1',
    );

    expect(result.transaction).toMatchObject({
      idempotencyKey: 'transfer-key-1',
      status: 'COMPLETED',
    });
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1);
    expect(prisma.bankAccount.updateMany).toHaveBeenCalledTimes(1);
  });

  it('replays an existing transfer for the same idempotency key and payload', async () => {
    const dto = { senderAccountId: 10, beneficiaryId: 30, amount: 125 };
    await service.transfer(7, dto, 'device-1', 'transfer-key-1');
    const created = (
      prisma.transaction.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      }
    ).data;
    prisma.transaction.findUnique.mockResolvedValueOnce({
      id: 99,
      ...created,
      fraudAlert: null,
      senderAccount: { userId: 7 },
    });

    const replay = await service.transfer(7, dto, 'device-1', 'transfer-key-1');

    expect(replay).toMatchObject({
      idempotentReplay: true,
      transaction: { id: 99 },
    });
    expect(fraudService.analyzeTransaction).toHaveBeenCalledTimes(1);
    expect(prisma.bankAccount.updateMany).toHaveBeenCalledTimes(1);
  });

  it('rejects idempotency key reuse with a different payload', async () => {
    prisma.transaction.findUnique.mockResolvedValueOnce({
      id: 99,
      idempotencyFingerprint: 'different-fingerprint',
      senderAccount: { userId: 7 },
    });

    await expect(
      service.transfer(
        7,
        { senderAccountId: 10, beneficiaryId: 30, amount: 125 },
        'device-1',
        'transfer-key-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects transfers above the per-transfer limit before fraud analysis', async () => {
    await expect(
      service.transfer(
        7,
        { senderAccountId: 10, beneficiaryId: 30, amount: 10_001 },
        'device-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(fraudService.analyzeTransaction).not.toHaveBeenCalled();
    expect(prisma.bankAccount.updateMany).not.toHaveBeenCalled();
  });

  it('rejects transfers that would exceed the daily transfer limit', async () => {
    prisma.transaction.aggregate.mockResolvedValueOnce({
      _sum: { amount: 24_950 },
    });

    await expect(
      service.transfer(
        7,
        { senderAccountId: 10, beneficiaryId: 30, amount: 100 },
        'device-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(fraudService.analyzeTransaction).not.toHaveBeenCalled();
    expect(prisma.bankAccount.updateMany).not.toHaveBeenCalled();
  });

  it('records rejected transfer attempts when the fraud service is unavailable', async () => {
    fraudService.analyzeTransaction.mockRejectedValueOnce(
      new ServiceUnavailableException('Fraud detection service is unavailable'),
    );

    await expect(
      service.transfer(
        7,
        { senderAccountId: 10, beneficiaryId: 30, amount: 125 },
        'device-1',
        'fraud-down-key',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: matching(
          expect.objectContaining({
            idempotencyKey: 'fraud-down-key',
            status: 'REJECTED',
          }),
        ),
      }),
    );
    expect(prisma.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: matching(
          expect.objectContaining({
            eventType: 'FRAUD_SERVICE_UNAVAILABLE',
          }),
        ),
      }),
    );
    expect(prisma.bankAccount.updateMany).not.toHaveBeenCalled();
  });

  it('creates a fraud alert and blocks balance movement for flagged transfers', async () => {
    fraudService.analyzeTransaction.mockResolvedValueOnce({
      risk_score: 92,
      risk_level: 'CRITICAL',
      flagged: true,
      reasons: ['Unusual amount', 'New device'],
    });
    prisma.fraudAlert.create.mockImplementationOnce(({ data }) =>
      Promise.resolve({ id: 44, ...data }),
    );

    const result = await service.transfer(
      7,
      { senderAccountId: 10, beneficiaryId: 30, amount: 125 },
      'device-1',
    );

    expect(result.transaction).toMatchObject({
      status: 'FLAGGED',
      riskScore: 92,
      riskLevel: 'CRITICAL',
    });
    expect(result.fraudAlert).toMatchObject({
      riskScore: 92,
      riskLevel: 'CRITICAL',
      reason: 'Unusual amount; New device',
    });
    expect(prisma.fraudAlert.create).toHaveBeenCalledWith({
      data: matching(
        expect.objectContaining({
          riskScore: 92,
          riskLevel: 'CRITICAL',
        }),
      ),
    });
    expect(prisma.bankAccount.updateMany).not.toHaveBeenCalled();
    expect(prisma.bankAccount.update).not.toHaveBeenCalled();
  });

  it('reverses a completed transfer exactly once', async () => {
    const completedTransfer = {
      id: 99,
      reference: 'TX-99',
      amount: 125,
      currency: 'USD',
      type: 'TRANSFER',
      status: 'COMPLETED',
      senderAccountId: senderAccount.id,
      receiverAccountId: receiverAccount.id,
      senderAccount: { id: senderAccount.id, userId: 7 },
      receiverAccount: { id: receiverAccount.id, balance: 500 },
    };
    prisma.transaction.findUnique
      .mockResolvedValueOnce(completedTransfer)
      .mockResolvedValueOnce({ ...completedTransfer, status: 'REVERSED' });

    const result = await service.reverse(7, 99, 'Customer dispute resolved');

    expect(result).toMatchObject({
      message: 'Transaction reversed successfully',
      transaction: { status: 'REVERSED' },
    });
    expect(prisma.bankAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: receiverAccount.id, balance: { gte: 125 } },
        data: { balance: { decrement: 125 } },
      }),
    );
    expect(prisma.bankAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: senderAccount.id },
        data: { balance: { increment: 125 } },
      }),
    );
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 99, status: 'COMPLETED' },
        data: matching(expect.objectContaining({ status: 'REVERSED' })),
      }),
    );
  });

  it('rejects a second reversal for the same transfer', async () => {
    prisma.transaction.findUnique.mockResolvedValueOnce({
      id: 99,
      amount: 125,
      currency: 'USD',
      type: 'TRANSFER',
      status: 'REVERSED',
      senderAccountId: senderAccount.id,
      receiverAccountId: receiverAccount.id,
      senderAccount: { id: senderAccount.id, userId: 7 },
      receiverAccount: { id: receiverAccount.id, balance: 500 },
    });

    await expect(service.reverse(7, 99, 'Duplicate')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(prisma.bankAccount.updateMany).not.toHaveBeenCalled();
  });
});
