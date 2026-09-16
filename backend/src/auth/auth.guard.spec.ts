import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from './auth.guard';

type MockFunction = jest.Mock;

interface MockRequest {
  headers: { authorization?: string };
  user?: unknown;
}

function makeContext(request: MockRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let jwt: { verifyAsync: MockFunction };
  let prisma: { user: { findUnique: MockFunction } };

  const validPayload = {
    sub: 7,
    email: 'user@example.com',
    role: 'CUSTOMER',
    type: 'access',
    tokenVersion: 0,
  };
  const activeUser = {
    id: 7,
    email: 'user@example.com',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    tokenVersion: 0,
  };

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn().mockResolvedValue(validPayload) };
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(activeUser) },
    };
    guard = new AuthGuard(
      jwt as unknown as JwtService,
      prisma as unknown as PrismaService,
    );
  });

  it('accepts a current access token and attaches a minimal user identity', async () => {
    const request: MockRequest = {
      headers: { authorization: 'Bearer signed-access-token' },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('signed-access-token');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        tokenVersion: true,
      },
    });
    expect(request.user).toEqual({
      sub: 7,
      email: 'user@example.com',
      role: 'CUSTOMER',
    });
  });

  it.each([
    undefined,
    '',
    'Basic signed-access-token',
    'Bearer',
    'Bearer one two',
  ])('rejects malformed authorization header %p', async (authorization) => {
    const request: MockRequest = {
      headers: { authorization },
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      'Authentication required',
    );
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects a token that fails signature or expiry validation', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));
    const request: MockRequest = {
      headers: { authorization: 'Bearer invalid-token' },
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      'Invalid or expired token',
    );
  });

  it('rejects MFA challenges and malformed token payloads', async () => {
    const request: MockRequest = {
      headers: { authorization: 'Bearer signed-token' },
    };

    jwt.verifyAsync.mockResolvedValue({ ...validPayload, type: 'mfa' });
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      'Invalid access token',
    );

    jwt.verifyAsync.mockResolvedValue({ ...validPayload, sub: '7' });
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      'Invalid token payload',
    );

    jwt.verifyAsync.mockResolvedValue({ ...validPayload, tokenVersion: '0' });
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      'Invalid token payload',
    );
  });

  it('rejects deleted, locked, and suspended accounts', async () => {
    const request: MockRequest = {
      headers: { authorization: 'Bearer signed-token' },
    };

    prisma.user.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      'User account no longer exists',
    );

    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      status: 'LOCKED',
    });
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      'Account is locked',
    );

    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      status: 'SUSPENDED',
    });
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      'Account is suspended',
    );
  });

  it('rejects changed roles and revoked token versions', async () => {
    const request: MockRequest = {
      headers: { authorization: 'Bearer signed-token' },
    };

    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      role: 'FRAUD_ANALYST',
    });
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      'User permissions changed',
    );

    prisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      tokenVersion: 1,
    });
    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      'Session has been revoked',
    );
  });
});
