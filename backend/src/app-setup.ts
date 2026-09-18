import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import helmet from 'helmet';
import { json, urlencoded } from 'express';

import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { defaultCorsOrigins } from './config/configuration';
import type { RequestWithId } from './common/middleware/request-id.middleware';

type CorsCallback = (error: Error | null, allow?: boolean) => void;

function getCorsOrigins() {
  const configuredOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(
    configuredOrigins && configuredOrigins.length > 0
      ? configuredOrigins
      : defaultCorsOrigins,
  );
}

export function configureApp(app: INestApplication) {
  app.use(helmet());
  app.use(requestIdMiddleware);
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: false, limit: '100kb' }));
  app.use(
    (
      error: { type?: string; status?: number; message?: string },
      request: RequestWithId & Request,
      response: Response,
      next: NextFunction,
    ) => {
      if (!error) {
        next();
        return;
      }

      const status = error.status === 413 ? 413 : 400;
      const requestId = request.requestId ?? randomUUID();
      response.setHeader('X-Request-ID', requestId);
      response.status(status).json({
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.originalUrl ?? request.url,
        method: request.method,
        requestId,
        message:
          status === 413
            ? 'Request payload is too large'
            : 'Malformed request payload',
      });
    },
  );

  const allowedOrigins = getCorsOrigins();
  app.enableCors({
    origin: (origin: string | undefined, callback: CorsCallback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by BankShield CORS policy'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Authorization',
      'Content-Type',
      'X-Device-ID',
      'X-Idempotency-Key',
      'X-Request-ID',
    ],
    exposedHeaders: ['X-Request-ID'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
  app.enableShutdownHooks();
}
