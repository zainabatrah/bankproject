import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FraudAlertsService } from '../fraud-alerts/fraud-alerts.service';
import { UpdateFraudAlertStatusDto } from '../fraud-alerts/dto/update-fraud-alert-status.dto';

type FraudAlertStatus =
  'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'FALSE_POSITIVE';

type RawAlert = {
  id: number;
  riskScore: number;
  riskLevel: string;
  reason: string;
  status: FraudAlertStatus;
  transactionId: number;
  createdAt: Date;
  updatedAt: Date;
  transaction: {
    reference: string;
    amount: unknown;
    currency: string;
    status: string;
  };
};

type RawInvestigationCase = {
  id: number;
  alertId: number;
  status: FraudAlertStatus;
  assignedAnalyst: string;
  summary: string;
  outcome: string | null;
  createdAt: Date;
  updatedAt: Date;
  alert: RawAlert;
};

@Injectable()
export class SocService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly fraudAlertsService: FraudAlertsService,
  ) {}

  private async getRawAlerts(): Promise<RawAlert[]> {
    const alerts = await this.prisma.fraudAlert.findMany({
      include: {
        transaction: {
          select: {
            reference: true,
            amount: true,
            currency: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return alerts;
  }

  private mapAlert(alert: RawAlert) {
    return {
      id: alert.id,
      amount: Number(alert.transaction.amount),
      currency: alert.transaction.currency,
      risk_score: alert.riskScore,
      severity: alert.riskLevel,
      reason: alert.reason,
      decision: alert.transaction.status,
      status: alert.status,
      transaction_id: alert.transactionId,
      reference: alert.transaction.reference,
      created_at: alert.createdAt.toISOString(),
      updated_at: alert.updatedAt.toISOString(),
    };
  }

  private mapCase(investigationCase: RawInvestigationCase) {
    return {
      id: investigationCase.id,
      alert_id: investigationCase.alertId,
      status: investigationCase.status,
      assigned_analyst: investigationCase.assignedAnalyst,
      summary: investigationCase.summary,
      outcome: investigationCase.outcome,
      alert: this.mapAlert(investigationCase.alert),
      created_at: investigationCase.createdAt.toISOString(),
      updated_at: investigationCase.updatedAt.toISOString(),
    };
  }

  async getSummary() {
    const [totalAlerts, criticalAlerts, openCases, totalSecurityEvents] =
      await Promise.all([
        this.prisma.fraudAlert.count(),
        this.prisma.fraudAlert.count({ where: { riskLevel: 'CRITICAL' } }),
        this.prisma.investigationCase.count({
          where: { status: { in: ['OPEN', 'INVESTIGATING'] } },
        }),
        this.prisma.securityEvent.count(),
      ]);

    return {
      total_alerts: totalAlerts,
      critical_alerts: criticalAlerts,
      open_cases: openCases,
      total_security_events: totalSecurityEvents,
    };
  }

  async getAlerts() {
    const alerts = await this.getRawAlerts();
    return alerts.map((alert) => this.mapAlert(alert));
  }

  async getRiskDistribution() {
    const distribution: Record<string, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };

    for (const alert of await this.getRawAlerts()) {
      distribution[alert.riskLevel] = (distribution[alert.riskLevel] ?? 0) + 1;
    }

    return distribution;
  }

  async getAlertsPerDay() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const alerts = await this.prisma.fraudAlert.findMany({
      where: { createdAt: { gte: cutoff } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const counts = new Map<string, number>();

    for (const alert of alerts) {
      const date = alert.createdAt.toISOString().slice(0, 10);
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }

    return [...counts.entries()].map(([date, count]) => ({ date, count }));
  }

  async getCasesByStatus() {
    const counts: Record<string, number> = {
      OPEN: 0,
      INVESTIGATING: 0,
      RESOLVED: 0,
      FALSE_POSITIVE: 0,
    };

    for (const investigationCase of await this.prisma.investigationCase.findMany(
      {
        select: { status: true },
      },
    )) {
      counts[investigationCase.status] =
        (counts[investigationCase.status] ?? 0) + 1;
    }

    return counts;
  }

  async getSecurityEvents() {
    const events = await this.prisma.securityEvent.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        eventType: true,
        description: true,
        riskLevel: true,
        createdAt: true,
      },
    });

    return events.map((event) => ({
      id: event.id,
      event_type: event.eventType,
      severity: event.riskLevel,
      description: event.description,
      created_at: event.createdAt.toISOString(),
    }));
  }

  async getSecurityEventsByType() {
    const counts: Record<string, number> = {};

    for (const event of await this.prisma.securityEvent.findMany({
      select: { eventType: true },
    })) {
      counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
    }

    return counts;
  }

  async getAuditLogs() {
    const logs = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return logs.map((log) => {
      const [entityType, ...entityParts] = (log.resource ?? '').split(':');
      const entityId = entityParts.join(':') || null;

      return {
        id: log.id,
        action: log.action,
        entity_type: entityType || 'SYSTEM',
        entity_id: entityId,
        actor: log.user
          ? `${log.user.firstName} ${log.user.lastName} (${log.user.email})`
          : 'System',
        result: log.result,
        details: log.details,
        created_at: log.createdAt.toISOString(),
      };
    });
  }

  async getCases() {
    const cases = await this.prisma.investigationCase.findMany({
      include: {
        alert: {
          include: {
            transaction: {
              select: {
                reference: true,
                amount: true,
                currency: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return cases.map((investigationCase) => this.mapCase(investigationCase));
  }

  async updateAlertStatus(
    id: number,
    status: FraudAlertStatus,
    analystUserId: number,
  ) {
    const dto = new UpdateFraudAlertStatusDto();
    dto.status = status;
    await this.fraudAlertsService.updateStatus(id, dto, analystUserId);

    const updatedAlert = (await this.getAlerts()).find(
      (alert) => alert.id === id,
    );
    if (!updatedAlert) throw new NotFoundException('Fraud alert not found');

    return {
      message: 'Fraud alert status updated successfully',
      alert: updatedAlert,
    };
  }

  async addNote(id: number, note: string, analystUserId: number) {
    const alert = await this.prisma.fraudAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Fraud alert not found');

    await this.auditLogsService.create({
      userId: analystUserId,
      action: 'FRAUD_ALERT_NOTE_ADDED',
      resource: `FraudAlert:${id}`,
      result: 'SUCCESS',
      details: JSON.stringify({ note: note.trim() }),
    });

    return { message: `Note added successfully to Alert #${id}` };
  }

  async createCase(
    alertId: number,
    assignedAnalyst: string,
    summary: string,
    analystUserId: number,
  ) {
    const alert = await this.prisma.fraudAlert.findUnique({
      where: { id: alertId },
    });
    if (!alert) throw new NotFoundException('Fraud alert not found');

    const existingCase = await this.prisma.investigationCase.findUnique({
      where: { alertId },
    });
    if (existingCase) {
      throw new BadRequestException(
        'An investigation case already exists for this alert',
      );
    }

    if (alert.status === 'OPEN') {
      await this.updateAlertStatus(alertId, 'INVESTIGATING', analystUserId);
    }

    const investigationCase = await this.prisma.investigationCase.create({
      data: {
        alertId,
        assignedAnalyst: assignedAnalyst.trim(),
        summary: summary.trim(),
        status:
          alert.status === 'RESOLVED' || alert.status === 'FALSE_POSITIVE'
            ? alert.status
            : 'INVESTIGATING',
        outcome:
          alert.status === 'RESOLVED' || alert.status === 'FALSE_POSITIVE'
            ? alert.status
            : null,
        createdById: analystUserId,
        updatedById: analystUserId,
      },
      include: {
        alert: {
          include: {
            transaction: {
              select: {
                reference: true,
                amount: true,
                currency: true,
                status: true,
              },
            },
          },
        },
      },
    });

    await this.auditLogsService.create({
      userId: analystUserId,
      action: 'INVESTIGATION_CASE_CREATED',
      resource: `InvestigationCase:${investigationCase.id}`,
      result: 'SUCCESS',
      details: JSON.stringify({
        alertId,
        assignedAnalyst: assignedAnalyst.trim(),
        summary: summary.trim(),
      }),
    });

    return {
      message: `Investigation case created for Alert #${alertId}`,
      case: this.mapCase(investigationCase),
    };
  }

  async updateCaseStatus(
    id: number,
    status: FraudAlertStatus,
    analystUserId: number,
  ) {
    const investigationCase = await this.prisma.investigationCase.findUnique({
      where: { id },
      include: { alert: true },
    });
    if (!investigationCase) {
      throw new NotFoundException('Investigation case not found');
    }

    if (investigationCase.status === status) {
      throw new BadRequestException(
        'Investigation case already has the requested status',
      );
    }

    await this.updateAlertStatus(
      investigationCase.alertId,
      status,
      analystUserId,
    );

    const updatedCase = await this.prisma.investigationCase.update({
      where: { id },
      data: {
        status,
        outcome:
          status === 'RESOLVED' || status === 'FALSE_POSITIVE' ? status : null,
        updatedById: analystUserId,
      },
      include: {
        alert: {
          include: {
            transaction: {
              select: {
                reference: true,
                amount: true,
                currency: true,
                status: true,
              },
            },
          },
        },
      },
    });

    await this.auditLogsService.create({
      userId: analystUserId,
      action: 'INVESTIGATION_CASE_STATUS_CHANGED',
      resource: `InvestigationCase:${id}`,
      result: 'SUCCESS',
      details: JSON.stringify({
        caseId: id,
        alertId: investigationCase.alertId,
        previousStatus: investigationCase.status,
        newStatus: status,
      }),
    });

    return {
      message: 'Investigation case status updated successfully',
      case: this.mapCase(updatedCase),
    };
  }

  async getAlertsCsv() {
    const rows = await this.getAlerts();
    const escape = (value: unknown) => {
      if (value == null) return '""';
      const normalizedValue =
        typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
      return `"${(normalizedValue ?? '').replaceAll('"', '""')}"`;
    };
    const header = [
      'id',
      'amount',
      'currency',
      'risk_score',
      'severity',
      'decision',
      'status',
      'transaction_id',
      'reference',
      'created_at',
    ];
    const lines = rows.map((row) =>
      [
        row.id,
        row.amount,
        row.currency,
        row.risk_score,
        row.severity,
        row.decision,
        row.status,
        row.transaction_id,
        row.reference,
        row.created_at,
      ]
        .map(escape)
        .join(','),
    );

    return [header.join(','), ...lines].join('\n');
  }

  async getSecurityReport() {
    return {
      generated_at: new Date().toISOString(),
      summary: await this.getSummary(),
      risk_distribution: await this.getRiskDistribution(),
      cases_by_status: await this.getCasesByStatus(),
    };
  }
}
