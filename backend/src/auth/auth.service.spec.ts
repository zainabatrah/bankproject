/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { DevicesService } from '../devices/devices.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { MfaService } from './mfa.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

type MockFunction = jest.Mock;

interface TestUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  mfaEnabled: boolean;
  mfaSecretEncrypted: string | null;
  tokenVersion: number;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockPrisma {
  user: {
    findUnique: MockFunction;
    update: MockFunction;
  };
  loginAttempt: {
    create: MockFunction;
    count: MockFunction;
  };
  securityEvent: {
    create: MockFunction;
  };
  auditLog: {
    create: MockFunction;
  };
  refreshToken: {
    create: MockFunction;
    findUnique: MockFunction;
    findMany: MockFunction;
    updateMany: MockFunction;
  };
  passwordResetToken: {
    create: MockFunction;
    findUnique: MockFunction;
    deleteMany: MockFunction;
    updateMany: MockFunction;
  };
  $transaction: MockFunction;
}

const bcryptMock = bcrypt as unknown as {
  compare: MockFunction;
  hash: MockFunction;
};

function makeUser(overrides: Partial<TestUser> = {}): TestUser {
  const now = new Date('2026-01-01T00:00:00.000Z');

  return {
    id: 7,
    email: 'user@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    mfaEnabled: false,
    mfaSecretEncrypted: null,
    tokenVersion: 0,
    passwordHash: 'stored-password-hash',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let users: { findByEmail: MockFunction; create: MockFunction };
  let jwt: { signAsync: MockFunction; verifyAsync: MockFunction };
  let devices: { registerDevice: MockFunction };
  let mfa: { verifyUserCode: MockFunction; consumeRecoveryCode: MockFunction };
  let prisma: MockPrisma;

  beforeEach(() => {
    jest.clearAllMocks();
    users = {
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(makeUser()),
    };
    jwt = {
      signAsync: jest.fn().mockImplementation((payload: unknown) => {
        const typedPayload = payload as {
          type?: string;
          tokenVersion?: number;
        };
        return typedPayload.type === 'mfa'
          ? 'mfa-challenge-token'
          : `access-token-v${typedPayload.tokenVersion ?? 0}`;
      }),
      verifyAsync: jest.fn(),
    };
    devices = {
      registerDevice: jest.fn().mockResolvedValue({
        isNewDevice: true,
        device: {
          id: 12,
          deviceId: 'device-1',
          browser: 'Chrome',
          os: 'Linux',
          trusted: false,
          firstSeen: new Date('2026-01-01T00:00:00.000Z'),
          lastSeen: new Date('2026-01-01T00:00:00.000Z'),
        },
      }),
    };
    mfa = {
      verifyUserCode: jest.fn().mockResolvedValue(true),
      consumeRecoveryCode: jest.fn().mockResolvedValue(true),
    };
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ tokenVersion: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
      loginAttempt: {
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(1),
      },
      securityEvent: {
        create: jest.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      passwordResetToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (transaction: MockPrisma) => Promise<unknown>) =>
        callback(prisma),
    );

    bcryptMock.compare.mockResolvedValue(true);
    bcryptMock.hash.mockResolvedValue('new-password-hash');

    service = new AuthService(
      users as unknown as UsersService,
      jwt as unknown as JwtService,
      devices as unknown as DevicesService,
      prisma as unknown as PrismaService,
      mfa as unknown as MfaService,
    );
  });

  it('registers a normalized email and never returns the password hash', async () => {
    const createdUser = makeUser({ email: 'alice@example.com' });
    users.create.mockResolvedValue(createdUser);

    const result = await service.register({
      email: ' Alice@Example.COM ',
      firstName: ' Alice ',
      lastName: ' Lovelace ',
      password: 'correct-horse-battery-staple',
    });

    expect(users.findByEmail).toHaveBeenCalledWith('alice@example.com');
    expect(bcryptMock.hash).toHaveBeenCalledWith(
      'correct-horse-battery-staple',
      12,
    );
    expect(users.create).toHaveBeenCalledWith({
      email: 'alice@example.com',
      firstName: 'Alice',
      lastName: 'Lovelace',
      passwordHash: 'new-password-hash',
    });
    expect(result).toMatchObject({
      id: 7,
      email: 'alice@example.com',
      firstName: 'Ada',
      role: 'CUSTOMER',
      status: 'ACTIVE',
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate registration without hashing the password', async () => {
    users.findByEmail.mockResolvedValue(makeUser());

    await expect(
      service.register({
        email: 'user@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        password: 'correct-horse-battery-staple',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(bcryptMock.hash).not.toHaveBeenCalled();
    expect(users.create).not.toHaveBeenCalled();
  });

  it('logs in, registers the device, and issues an access and refresh token', async () => {
    const user = makeUser();
    users.findByEmail.mockResolvedValue(user);

    const result = await service.login(
      { email: ' USER@example.com ', password: 'password-123' },
      'device-1',
      'Mozilla/5.0 Chrome/120',
      '192.0.2.10',
    );

    expect(bcryptMock.compare).toHaveBeenCalledWith(
      'password-123',
      user.passwordHash,
    );
    expect(devices.registerDevice).toHaveBeenCalledWith(
      user.id,
      'device-1',
      'Mozilla/5.0 Chrome/120',
    );
    expect(prisma.securityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'NEW_DEVICE_LOGIN' }),
      }),
    );
    expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        successful: true,
        userId: user.id,
        ipAddress: '192.0.2.10',
      }),
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        deviceId: 'device-1',
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(result).toMatchObject({
      accessToken: 'access-token-v0',
      user: { id: user.id, email: user.email },
      newDevice: true,
    });
    expect(result.refreshToken).toEqual(expect.any(String));
  });

  it('records unknown-user and wrong-password login failures', async () => {
    await expect(
      service.login(
        { email: 'missing@example.com', password: 'password-123' },
        'device-1',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.loginAttempt.create).toHaveBeenCalledWith({
      data: { successful: false, deviceInfo: 'device-1' },
    });

    const user = makeUser();
    users.findByEmail.mockResolvedValue(user);
    bcryptMock.compare.mockResolvedValue(false);
    prisma.loginAttempt.create.mockClear();
    prisma.loginAttempt.count.mockResolvedValue(2);

    await expect(
      service.login(
        { email: user.email, password: 'wrong-password' },
        'device-1',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.loginAttempt.count).toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('locks an account on the fifth recent failed password attempt', async () => {
    const user = makeUser();
    users.findByEmail.mockResolvedValue(user);
    bcryptMock.compare.mockResolvedValue(false);
    prisma.loginAttempt.count.mockResolvedValue(5);

    await expect(
      service.login(
        { email: user.email, password: 'wrong-password' },
        'device-1',
      ),
    ).rejects.toThrow('Account locked');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { status: 'LOCKED', tokenVersion: { increment: 1 } },
    });
    expect(prisma.securityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'ACCOUNT_LOCKED',
        userId: user.id,
      }),
    });
  });

  it('requires MFA after the password succeeds and completes an MFA login', async () => {
    const user = makeUser({ mfaEnabled: true, tokenVersion: 4 });
    users.findByEmail.mockResolvedValue(user);

    const pending = await service.login(
      { email: user.email, password: 'password-123' },
      'device-1',
    );

    expect(pending).toMatchObject({
      mfaRequired: true,
      mfaToken: 'mfa-challenge-token',
      expiresIn: 300,
    });
    expect(prisma.loginAttempt.create).not.toHaveBeenCalled();

    jwt.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      role: user.role,
      deviceId: 'device-1',
      tokenVersion: user.tokenVersion,
      type: 'mfa',
      purpose: 'mfa-login',
    });
    prisma.user.findUnique
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ tokenVersion: user.tokenVersion });

    const result = await service.verifyMfaLogin('mfa-token', '123456');

    expect(mfa.verifyUserCode).toHaveBeenCalledWith(user.id, '123456');
    expect(prisma.securityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'MFA_LOGIN_SUCCESS' }),
    });
    expect(result).toMatchObject({
      accessToken: 'access-token-v4',
      user: { id: user.id },
    });
  });

  it('rejects invalid MFA codes and malformed MFA challenges', async () => {
    const user = makeUser({ mfaEnabled: true });
    jwt.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      role: user.role,
      deviceId: 'device-1',
      tokenVersion: user.tokenVersion,
      type: 'mfa',
      purpose: 'mfa-login',
    });
    prisma.user.findUnique.mockResolvedValue(user);
    mfa.verifyUserCode.mockResolvedValue(false);

    await expect(service.verifyMfaLogin('mfa-token', '000000')).rejects.toThrow(
      'Invalid MFA code',
    );
    expect(prisma.securityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'MFA_LOGIN_FAILED' }),
    });

    jwt.verifyAsync.mockRejectedValue(new Error('expired'));
    await expect(
      service.verifyMfaLogin('expired-token', '123456'),
    ).rejects.toThrow('Invalid or expired MFA challenge');
  });

  it('rotates refresh tokens and prevents reuse of the old token', async () => {
    const user = makeUser();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 21,
      tokenHash: 'stored-hash',
      deviceId: 'device-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      user,
    });

    const result = await service.refresh('refresh-token');

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 21, revokedAt: null },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
    expect(prisma.refreshToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: user.id,
        deviceId: 'device-1',
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    });
    expect(result).toMatchObject({ accessToken: 'access-token-v0' });
    expect(result.refreshToken).toEqual(expect.any(String));

    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 21,
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      user,
    });
    await expect(service.refresh('refresh-token')).rejects.toThrow('revoked');
  });

  it('changes the password, increments token version, and revokes sessions', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 7,
      passwordHash: 'old-hash',
    });

    const result = await service.changePassword(
      7,
      'old-password',
      'new-password',
    );

    expect(bcryptMock.compare).toHaveBeenCalledWith('old-password', 'old-hash');
    expect(bcryptMock.hash).toHaveBeenCalledWith('new-password', 12);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        passwordHash: 'new-password-hash',
        tokenVersion: { increment: 1 },
      },
    });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 7, revokedAt: null },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
    expect(result).toEqual({
      message: 'Password changed successfully. Please sign in again.',
      sessionsRevoked: true,
    });
  });

  it('rejects a same or incorrect current password', async () => {
    await expect(
      service.changePassword(7, 'same-password', 'same-password'),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.user.findUnique.mockResolvedValue({
      id: 7,
      passwordHash: 'old-hash',
    });
    bcryptMock.compare.mockResolvedValue(false);

    await expect(
      service.changePassword(7, 'wrong-password', 'new-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.securityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: 'PASSWORD_CHANGE_FAILED' }),
    });

    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.changePassword(7, 'old-password', 'new-password'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses a generic forgot-password response and stores only a token hash', async () => {
    users.findByEmail.mockResolvedValue(makeUser());

    const response = await service.forgotPassword(' USER@example.com ');

    expect(response.message).toContain('If an account exists');
    expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 7 },
    });
    expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 7,
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    });

    users.findByEmail.mockResolvedValue(null);
    const unknownResponse = await service.forgotPassword('missing@example.com');
    expect(unknownResponse).toEqual(response);
    expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
  });

  it('atomically consumes a reset token and revokes existing sessions', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 31,
      userId: 7,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    });

    const result = await service.resetPassword('reset-token', 'new-password');

    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 31, usedAt: null }),
      data: expect.objectContaining({ usedAt: expect.any(Date) }),
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        passwordHash: 'new-password-hash',
        tokenVersion: { increment: 1 },
      },
    });
    expect(result.sessionsRevoked).toBe(true);

    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.resetPassword('reset-token', 'new-password'),
    ).rejects.toThrow('Invalid or expired password reset token');
  });

  it('lists, revokes one, and revokes all active sessions', async () => {
    const sessions = [{ id: 1, deviceId: 'device-1' }];
    prisma.refreshToken.findMany.mockResolvedValue(sessions);
    await expect(service.getSessions(7)).resolves.toEqual(sessions);
    expect(prisma.refreshToken.findMany).toHaveBeenCalledWith({
      where: {
        userId: 7,
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, deviceId: true, expiresAt: true, createdAt: true },
    });

    await expect(service.revokeSession(7, 1)).resolves.toEqual({
      message: 'Session revoked successfully',
    });

    prisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 2 });
    await expect(service.revokeAllSessions(7)).resolves.toEqual({
      message: 'All sessions revoked successfully',
      revokedCount: 2,
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { tokenVersion: { increment: 1 } },
    });
  });

  it('supports one-time MFA recovery-code login', async () => {
    const user = makeUser({ mfaEnabled: true, tokenVersion: 2 });
    jwt.verifyAsync.mockResolvedValue({
      sub: user.id,
      email: user.email,
      role: user.role,
      deviceId: 'device-1',
      tokenVersion: 2,
      type: 'mfa',
      purpose: 'mfa-login',
    });
    prisma.user.findUnique
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ tokenVersion: 2 });

    const result = await service.verifyMfaRecoveryLogin(
      'mfa-token',
      'ABCD-EFGH',
    );

    expect(mfa.consumeRecoveryCode).toHaveBeenCalledWith(7, 'ABCD-EFGH');
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'MFA_RECOVERY_CODE_USED' }),
    });
    expect(result).toMatchObject({ accessToken: 'access-token-v2' });
  });
});
