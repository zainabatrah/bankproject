import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { HttpExceptionFilter } from './http-exception.filter';

type JsonMock = jest.Mock<void, [unknown]>;

function makeHost(exceptionResponse: {
  requestId?: string;
  method?: string;
  url?: string;
}) {
  const response = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = {
    requestId: exceptionResponse.requestId ?? 'request-123',
    method: exceptionResponse.method ?? 'GET',
    originalUrl: exceptionResponse.url ?? '/test',
    url: exceptionResponse.url ?? '/test',
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ArgumentsHost;

  return { host, response };
}

describe('HttpExceptionFilter', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns safe validation errors with request IDs', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = makeHost({});

    filter.catch(
      new HttpException(
        { message: ['email must be an email'] },
        HttpStatus.BAD_REQUEST,
      ),
      host,
    );

    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Request-ID',
      'request-123',
    );
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        requestId: 'request-123',
        message: ['email must be an email'],
      }),
    );
  });

  it('does not leak internal error details for server errors', () => {
    const filter = new HttpExceptionFilter();
    const { host, response } = makeHost({});

    filter.catch(new Error('database password leaked'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
      }),
    );
    const jsonMock = response.json as JsonMock;
    expect(JSON.stringify(jsonMock.mock.calls[0][0])).not.toContain(
      'database password leaked',
    );
  });
});
