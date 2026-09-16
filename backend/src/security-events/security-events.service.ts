import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';

import { PrismaService } from '../prisma/prisma.service';
import { CreateSecurityEventDto } from './dto/create-security-event.dto';
import { ListSecurityEventsDto } from './dto/list-security-events.dto';

type SecurityEventRecord = {
  id: number;
  eventType: string;
  description: string;
  riskLevel: string;
  userId: number | null;
  createdAt: Date;
};

@Injectable()
export class SecurityEventsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(
    query: ListSecurityEventsDto,
  ): Prisma.SecurityEventWhereInput {
    const riskLevel = query.riskLevel ?? query.risk_level ?? query.severity;
    const eventType = query.eventType ?? query.event_type ?? query.type;
    const where: Prisma.SecurityEventWhereInput = {};

    if (eventType) where.eventType = eventType;
    if (riskLevel) where.riskLevel = riskLevel;
    const userId = query.userId ?? query.user_id;
    if (userId) where.userId = userId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    return where;
  }

  private mapEvent(event: SecurityEventRecord) {
    return {
      id: event.id,
      eventType: event.eventType,
      event_type: event.eventType,
      description: event.description,
      riskLevel: event.riskLevel,
      risk_level: event.riskLevel,
      severity: event.riskLevel,
      userId: event.userId,
      user_id: event.userId,
      createdAt: event.createdAt,
      created_at: event.createdAt,
    };
  }

  async findAll(query?: ListSecurityEventsDto) {
    const filters = query ?? new ListSecurityEventsDto();
    const events = await this.prisma.securityEvent.findMany({
      where: this.buildWhere(filters),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: filters.skip,
      take: filters.limit,
      select: {
        id: true,
        eventType: true,
        description: true,
        riskLevel: true,
        userId: true,
        createdAt: true,
      },
    });

    return events.map((event) => this.mapEvent(event));
  }

  async findOne(id: number) {
    const event = await this.prisma.securityEvent.findUnique({
      where: { id },
      select: {
        id: true,
        eventType: true,
        description: true,
        riskLevel: true,
        userId: true,
        createdAt: true,
      },
    });

    if (!event) throw new NotFoundException('Security event not found');
    return this.mapEvent(event);
  }

  async getSummary(query?: ListSecurityEventsDto) {
    const filters = query ?? new ListSecurityEventsDto();
    const events = await this.prisma.securityEvent.findMany({
      where: this.buildWhere(filters),
      select: { eventType: true, riskLevel: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const byEventType: Record<string, number> = {};
    const byRiskLevel: Record<string, number> = {};

    for (const event of events) {
      byEventType[event.eventType] = (byEventType[event.eventType] ?? 0) + 1;
      byRiskLevel[event.riskLevel] = (byRiskLevel[event.riskLevel] ?? 0) + 1;
    }

    return {
      total: events.length,
      byEventType,
      byRiskLevel,
      latestEventAt: events[0]?.createdAt ?? null,
    };
  }

  async getTypeCounts(query?: ListSecurityEventsDto) {
    return (await this.getSummary(query)).byEventType;
  }

  async create(dto: CreateSecurityEventDto, actorUserId: number) {
    const eventType = dto.eventType ?? dto.event_type;
    const riskLevel = dto.riskLevel ?? dto.severity;
    const requestedUserId = dto.userId ?? dto.user_id;
    const subjectUserId = requestedUserId ?? actorUserId;

    if (!eventType) {
      throw new BadRequestException('eventType is required');
    }
    if (!riskLevel) {
      throw new BadRequestException('riskLevel is required');
    }

    if (requestedUserId && requestedUserId !== actorUserId) {
      const subject = await this.prisma.user.findUnique({
        where: { id: requestedUserId },
        select: { id: true },
      });

      if (!subject) throw new NotFoundException('Event subject user not found');
    }

    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.securityEvent.create({
        data: {
          eventType: eventType.trim(),
          description: dto.description.trim(),
          riskLevel,
          userId: subjectUserId,
        },
        select: {
          id: true,
          eventType: true,
          description: true,
          riskLevel: true,
          userId: true,
          createdAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          action: 'SECURITY_EVENT_CREATED',
          resource: `SecurityEvent:${created.id}`,
          result: 'SUCCESS',
          details: JSON.stringify({
            eventType: created.eventType,
            riskLevel: created.riskLevel,
            subjectUserId: created.userId,
            ...(dto.source ? { source: dto.source.trim() } : {}),
            ...((dto.eventData ?? dto.event_data)
              ? { eventData: dto.eventData ?? dto.event_data }
              : {}),
          }),
        },
      });

      return created;
    });

    return this.mapEvent(event);
  }
}
