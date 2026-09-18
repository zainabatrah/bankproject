import { requestIdMiddleware } from './request-id.middleware';

describe('requestIdMiddleware', () => {
  it('uses valid supplied request IDs and exposes them on the response', () => {
    const request = {
      header: jest.fn().mockReturnValue('request-123'),
    };
    const response = { setHeader: jest.fn() };
    const next = jest.fn();

    requestIdMiddleware(request as never, response as never, next);

    expect(request).toMatchObject({ requestId: 'request-123' });
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Request-ID',
      'request-123',
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('generates a safe request ID when the supplied value is invalid', () => {
    const request = {
      header: jest.fn().mockReturnValue('bad id with spaces'.repeat(10)),
    };
    const response = { setHeader: jest.fn() };
    const next = jest.fn();

    requestIdMiddleware(request as never, response as never, next);

    expect(request).toHaveProperty('requestId');
    expect(request.requestId).not.toContain(' ');
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Request-ID',
      request.requestId,
    );
  });
});
