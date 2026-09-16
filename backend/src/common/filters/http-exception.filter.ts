import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { randomUUID } from 'crypto';
import type { RequestWithId } from '../middleware/request-id.middleware';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = request.requestId ?? randomUUID();
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    response.setHeader('X-Request-ID', requestId);

    const isServerError = status >= 500;

    if (isServerError) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(
        `${request.method} ${request.originalUrl ?? request.url} ${status} [${requestId}]`,
        stack,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.originalUrl ?? request.url} ${status} [${requestId}]`,
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
      method: request.method,
      requestId,
      message: isServerError
        ? 'Internal server error'
        : this.getClientMessage(exceptionResponse),
    });
  }

  private getClientMessage(
    response: string | object | undefined,
  ): string | string[] {
    if (typeof response === 'string') return response;
    if (!response || !('message' in response)) {
      return 'Request failed';
    }

    const message = response.message;
    if (typeof message === 'string') return message;
    if (
      Array.isArray(message) &&
      message.every((item) => typeof item === 'string')
    ) {
      return message;
    }

    return 'Request failed';
  }
}
