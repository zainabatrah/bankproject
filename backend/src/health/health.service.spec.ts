import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let prisma: { $queryRawUnsafe: jest.Mock };
  let service: HealthService;

  beforeEach(() => {
    prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    service = new HealthService(prisma as unknown as PrismaService);
  });

  it('reports API and database health without exposing configuration values', async () => {
    const result = await service.check();

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
    expect(result).toMatchObject({
      status: 'ok',
      services: {
        api: { status: 'ok' },
        database: { status: 'ok' },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /DATABASE_URL|JWT_SECRET|MFA_ENCRYPTION_KEY|password|postgresql:\/\//i,
    );
  });

  it('reports degraded health when the database check fails', async () => {
    prisma.$queryRawUnsafe.mockRejectedValueOnce(new Error('database down'));

    await expect(service.check()).resolves.toMatchObject({
      status: 'degraded',
      services: {
        api: { status: 'ok' },
        database: { status: 'unavailable' },
      },
    });
  });
});
