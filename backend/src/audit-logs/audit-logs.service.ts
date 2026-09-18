import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

import { PrismaService } from '../prisma/prisma.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    userId?: number;
    action: string;
    resource?: string;
    result?: string;
    details?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        resource: data.resource,
        result: data.result,
        details: data.details,
      },
    });
  }

  private buildWhere(query: ListAuditLogsDto): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    const search = query.q ?? query.search;

    if (query.action) {
      where.action = { contains: query.action };
    }
    if (query.resource) {
      where.resource = { contains: query.resource };
    }
    if (query.result) where.result = query.result;
    if (query.userId ?? query.user_id)
      where.userId = query.userId ?? query.user_id;

    if (search) {
      where.OR = [
        { action: { contains: search } },
        { resource: { contains: search } },
        { result: { contains: search } },
        { details: { contains: search } },
      ];
    }

    const from = query.from ?? query.startDate;
    const to = query.to ?? query.endDate;

    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    return where;
  }

  private getInclude() {
    return {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    } as const;
  }

  async findAll(query?: ListAuditLogsDto) {
    const filters = query ?? new ListAuditLogsDto();
    return this.prisma.auditLog.findMany({
      where: this.buildWhere(filters),
      include: this.getInclude(),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: filters.skip,
      take: filters.limit,
    });
  }

  async findByUser(userId: number, query?: ListAuditLogsDto) {
    const filters = query ?? new ListAuditLogsDto();
    return this.prisma.auditLog.findMany({
      where: {
        ...this.buildWhere(filters),
        userId,
      },
      include: this.getInclude(),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: filters.skip,
      take: filters.limit,
    });
  }

  async findOne(id: number) {
    const auditLog = await this.prisma.auditLog.findUnique({
      where: { id },
      include: this.getInclude(),
    });

    if (!auditLog) throw new NotFoundException('Audit log not found');
    return auditLog;
  }

  async getSummary(query?: ListAuditLogsDto) {
    const filters = query ?? new ListAuditLogsDto();
    const logs = await this.prisma.auditLog.findMany({
      where: this.buildWhere(filters),
      select: { action: true, result: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const byAction: Record<string, number> = {};
    const byResult: Record<string, number> = {};

    for (const log of logs) {
      byAction[log.action] = (byAction[log.action] ?? 0) + 1;
      const result = log.result ?? 'UNKNOWN';
      byResult[result] = (byResult[result] ?? 0) + 1;
    }

    return {
      total: logs.length,
      byAction,
      byResult,
      oldestAt: logs.at(-1)?.createdAt ?? null,
      newestAt: logs[0]?.createdAt ?? null,
    };
  }
}
