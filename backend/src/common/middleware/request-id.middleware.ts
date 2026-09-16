import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export type RequestWithId = Request & {
  requestId?: string;
};

const requestIdPattern = /^[A-Za-z0-9._:-]{1,100}$/;

export function requestIdMiddleware(
  request: RequestWithId,
  response: Response,
  next: NextFunction,
) {
  const suppliedRequestId = request.header('x-request-id')?.trim();
  const requestId =
    suppliedRequestId && requestIdPattern.test(suppliedRequestId)
      ? suppliedRequestId
      : randomUUID();

  request.requestId = requestId;
  response.setHeader('X-Request-ID', requestId);
  next();
}
