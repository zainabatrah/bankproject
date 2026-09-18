import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FraudAlertsService } from '../fraud-alerts/fraud-alerts.service';
import { PrismaService } from '../prisma/prisma.service';
import { SocService } from './soc.service';

describe('SocService fraud investigation workflow', () => {
  const alert = {
    id: 12,
    riskScore: 91,
    riskLevel: 'CRITICAL',
    reason: 'High-risk transfer',
    status: 'OPEN',
    transactionId: 99,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    transaction: {
      reference: 'TX-99',
      amount: 2500,
      currency: 'USD',
      status: 'FLAGGED',
    },
  };
  const investigationCase = {
    id: 55,
    alertId: 12,
    status: 'INVESTIGATING',
    assignedAnalyst: 'Analyst One',
    summary: 'Review transfer',
    outcome: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    alert: { ...alert, status: 'INVESTIGATING' },
  };
  let prisma: {
    fraudAlert: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
    };
    investigationCase: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    securityEvent: {
      count: jest.Mock;
      findMany: jest.Mock;
    };
    auditLog: { findMany: jest.Mock };
  };
  let auditLogsService: { create: jest.Mock };
  let fraudAlertsService: { updateStatus: jest.Mock };
  let service: SocService;

  beforeEach(() => {
    prisma = {
      fraudAlert: {
        findMany: jest.fn().mockResolvedValue([alert]),
        findUnique: jest.fn().mockResolvedValue(alert),
        count: jest.fn().mockResolvedValue(1),
      },
      investigationCase: {
        findMany: jest.fn().mockResolvedValue([investigationCase]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(investigationCase),
        update: jest.fn().mockResolvedValue({
          ...investigationCase,
          status: 'RESOLVED',
          outcome: 'RESOLVED',
        }),
        count: jest.fn().mockResolvedValue(1),
      },
      securityEvent: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
    };
    auditLogsService = { create: jest.fn().mockResolvedValue({}) };
    fraudAlertsService = { updateStatus: jest.fn().mockResolvedValue({}) };
    service = new SocService(
      prisma as unknown as PrismaService,
      auditLogsService as unknown as AuditLogsService,
      fraudAlertsService as unknown as FraudAlertsService,
    );
  });

  it('lists investigation cases with mapped alert details', async () => {
    const cases = await service.getCases();

    expect(cases[0]).toMatchObject({
      id: 55,
      alert_id: 12,
      status: 'INVESTIGATING',
      assigned_analyst: 'Analyst One',
      alert: {
        risk_score: 91,
        severity: 'CRITICAL',
        transaction_id: 99,
      },
    });
  });

  it('creates a case, moves the alert into investigation, and audits the action', async () => {
    const result = await service.createCase(
      12,
      ' Analyst One ',
      ' Review transfer ',
      7,
    );

    expect(fraudAlertsService.updateStatus).toHaveBeenCalledWith(
      12,
      expect.objectContaining({ status: 'INVESTIGATING' }),
      7,
    );
    expect(prisma.investigationCase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          alertId: 12,
          assignedAnalyst: 'Analyst One',
          summary: 'Review transfer',
        }),
      }),
    );
    expect(auditLogsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INVESTIGATION_CASE_CREATED',
        resource: 'InvestigationCase:55',
      }),
    );
    expect(result.case).toMatchObject({ id: 55, alert_id: 12 });
  });

  it('rejects duplicate and missing investigation cases', async () => {
    prisma.investigationCase.findUnique.mockResolvedValueOnce({
      id: 55,
    });
    await expect(
      service.createCase(12, 'Analyst One', 'Review transfer', 7),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.fraudAlert.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.createCase(404, 'Analyst One', 'Review transfer', 7),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates investigation status and synchronizes alert status', async () => {
    prisma.investigationCase.findUnique.mockResolvedValueOnce(
      investigationCase,
    );

    const result = await service.updateCaseStatus(55, 'RESOLVED', 7);

    expect(fraudAlertsService.updateStatus).toHaveBeenCalledWith(
      12,
      expect.objectContaining({ status: 'RESOLVED' }),
      7,
    );
    expect(prisma.investigationCase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 55 },
        data: expect.objectContaining({
          status: 'RESOLVED',
          outcome: 'RESOLVED',
          updatedById: 7,
        }),
      }),
    );
    expect(auditLogsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INVESTIGATION_CASE_STATUS_CHANGED',
      }),
    );
    expect(result.case).toMatchObject({ status: 'RESOLVED' });
  });
});
