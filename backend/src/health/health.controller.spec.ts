import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  it('delegates public health checks to the service', async () => {
    const health = {
      status: 'ok',
      checkedAt: '2026-01-01T00:00:00.000Z',
      services: { api: { status: 'ok' }, database: { status: 'ok' } },
    };
    const service = { check: jest.fn().mockResolvedValue(health) };
    const controller = new HealthController(
      service as unknown as HealthService,
    );

    await expect(controller.check()).resolves.toBe(health);
    expect(service.check).toHaveBeenCalledWith();
  });
});
