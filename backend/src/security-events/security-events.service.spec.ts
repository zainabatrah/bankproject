import { SecurityEventsService } from './security-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSecurityEventDto } from './dto/create-security-event.dto';

describe('SecurityEventsService', () => {
  const event = {
    id: 12,
    eventType: 'SUSPICIOUS_TRANSACTION',
    description: 'High-risk transfer detected',
    riskLevel: 'HIGH',
    userId: 7,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  let prisma: {
    securityEvent: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    auditLog: { create: jest.Mock };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: SecurityEventsService;

  beforeEach(() => {
    prisma = {
      securityEvent: {
        findMany: jest.fn().mockResolvedValue([event]),
        findUnique: jest.fn().mockResolvedValue(event),
        create: jest.fn().mockResolvedValue(event),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 7 }) },
      $transaction: jest.fn((callback: (tx: typeof prisma) => unknown) =>
        Promise.resolve(callback(prisma)),
      ),
    };
    service = new SecurityEventsService(prisma as unknown as PrismaService);
  });

  it('returns filtered events with compatibility field names', async () => {
    const result = await service.findAll();

    expect(prisma.securityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
      }),
    );
    expect(result[0]).toMatchObject({
      eventType: event.eventType,
      event_type: event.eventType,
      riskLevel: event.riskLevel,
      severity: event.riskLevel,
    });
  });

  it('creates a security event and an audit record atomically', async () => {
    const dto = Object.assign(new CreateSecurityEventDto(), {
      eventType: 'MANUAL_REVIEW',
      riskLevel: 'MEDIUM',
      description: 'Analyst documented a review event',
    });

    await service.create(dto, 7);

    expect(prisma.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          eventType: 'MANUAL_REVIEW',
          description: 'Analyst documented a review event',
          riskLevel: 'MEDIUM',
          userId: 7,
        },
      }),
    );
    const auditCreate = prisma.auditLog.create as jest.MockedFunction<
      (input: { data: { action: string; userId: number } }) => unknown
    >;
    expect(auditCreate.mock.calls[0][0]).toMatchObject({
      data: {
        action: 'SECURITY_EVENT_CREATED',
        userId: 7,
      },
    });
  });
});
