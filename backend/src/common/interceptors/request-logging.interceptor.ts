import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { tap } from 'rxjs';

import type { RequestWithId } from '../middleware/request-id.middleware';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();
    const requestId = request.requestId ?? 'unassigned';

    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          `${request.method} ${request.originalUrl ?? request.url} ${response.statusCode} ${Date.now() - startedAt}ms [${requestId}]`,
        );
      }),
    );
  }
}
