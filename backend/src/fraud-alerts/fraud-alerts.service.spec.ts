import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { FraudAlertsService } from './fraud-alerts.service';

describe('FraudAlertsService', () => {
  const alert = {
    id: 12,
    riskScore: 88,
    riskLevel: 'HIGH',
    reason: 'Suspicious transfer',
    status: 'OPEN',
    transactionId: 99,
    transaction: { id: 99 },
  };
  let prisma: {
    fraudAlert: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let auditLogsService: { create: jest.Mock };
  let service: FraudAlertsService;

  beforeEach(() => {
    prisma = {
      fraudAlert: {
        findMany: jest.fn().mockResolvedValue([alert]),
        findUnique: jest.fn().mockResolvedValue(alert),
        update: jest.fn().mockResolvedValue({
          ...alert,
          status: 'INVESTIGATING',
        }),
      },
    };
    auditLogsService = { create: jest.fn().mockResolvedValue({}) };
    service = new FraudAlertsService(
      prisma as unknown as PrismaService,
      auditLogsService as unknown as AuditLogsService,
    );
  });

  it('lists fraud alerts with severity, score, status, and pagination filters', async () => {
    await service.findAll({
      severity: 'HIGH',
      minRiskScore: 80,
      maxRiskScore: 90,
      status: 'OPEN',
      page: 2,
      limit: 10,
      get skip() {
        return 10;
      },
    });

    expect(prisma.fraudAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          riskLevel: 'HIGH',
          status: 'OPEN',
          riskScore: { gte: 80, lte: 90 },
        },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('updates alert status and writes an audit record', async () => {
    const result = await service.updateStatus(
      12,
      { status: 'INVESTIGATING' },
      7,
    );

    expect(result.alert).toMatchObject({ status: 'INVESTIGATING' });
    expect(prisma.fraudAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 12 },
        data: { status: 'INVESTIGATING' },
      }),
    );
    expect(auditLogsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        action: 'FRAUD_ALERT_STATUS_CHANGED',
      }),
    );
  });

  it('rejects missing alerts and duplicate status updates', async () => {
    prisma.fraudAlert.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.updateStatus(404, { status: 'INVESTIGATING' }, 7),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.updateStatus(12, { status: 'OPEN' }, 7),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
