import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { DevicesService } from '../devices/devices.service';
import { MfaService } from './mfa.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

interface MfaChallengePayload {
  sub: number;
  email: string;
  role: string;
  deviceId: string;
  tokenVersion: number;
  type: 'mfa';
  purpose: 'mfa-login';
}

interface SessionUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
}

interface DeviceRegistration {
  isNewDevice: boolean;
  device: {
    id: number;
    deviceId: string;
    browser: string | null;
    os: string | null;
    trusted: boolean;
    firstSeen: Date;
    lastSeen: Date;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly devicesService: DevicesService,
    private readonly prisma: PrismaService,
    private readonly mfaService: MfaService,
  ) {}

  private generateRefreshToken(): string {
    return randomBytes(64).toString('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async createRefreshToken(
    userId: number,
    deviceId?: string,
  ): Promise<string> {
    const refreshToken = this.generateRefreshToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    if (deviceId) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(refreshToken),
        userId,
        expiresAt,
        ...(deviceId ? { deviceId } : {}),
      },
    });

    return refreshToken;
  }

  private async issueSession(
    user: SessionUser,
    deviceId: string,
    deviceResult?: DeviceRegistration,
  ) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { tokenVersion: true },
    });

    if (!currentUser) {
      throw new UnauthorizedException('User account no longer exists');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
      tokenVersion: currentUser.tokenVersion,
    });
    const refreshToken = await this.createRefreshToken(user.id, deviceId);

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        resource: 'AUTH',
        result: 'SUCCESS',
        details: JSON.stringify({ deviceId }),
      },
    });

    return {
      accessToken,
      refreshToken,
      ...(deviceResult
        ? {
            newDevice: deviceResult.isNewDevice,
            device: {
              id: deviceResult.device.id,
              deviceId: deviceResult.device.deviceId,
              browser: deviceResult.device.browser,
              os: deviceResult.device.os,
              trusted: deviceResult.device.trusted,
              firstSeen: deviceResult.device.firstSeen,
              lastSeen: deviceResult.device.lastSeen,
            },
          }
        : {}),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    const email = registerDto.email.trim().toLowerCase();
    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    const user = await this.usersService.create({
      email,
      firstName: registerDto.firstName.trim(),
      lastName: registerDto.lastName.trim(),
      passwordHash: await bcrypt.hash(registerDto.password, 12),
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  async login(
    loginDto: LoginDto,
    deviceId: string,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const email = loginDto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      await this.prisma.loginAttempt.create({
        data: {
          successful: false,
          deviceInfo: deviceId,
          ...(ipAddress ? { ipAddress } : {}),
        },
      });
      await this.prisma.auditLog.create({
        data: {
          action: 'LOGIN_FAILED',
          resource: 'AUTH',
          result: 'FAILURE',
          details: JSON.stringify({
            email,
            deviceId,
            reason: 'UNKNOWN_USER',
            ...(ipAddress ? { ipAddress } : {}),
          }),
        },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === 'LOCKED') {
      throw new UnauthorizedException('Account is locked');
    }

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Account is suspended');
    }

    const passwordMatches = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      await this.prisma.loginAttempt.create({
        data: {
          successful: false,
          deviceInfo: deviceId,
          ...(ipAddress ? { ipAddress } : {}),
          userId: user.id,
        },
      });
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN_FAILED',
          resource: 'AUTH',
          result: 'FAILURE',
          details: JSON.stringify({
            deviceId,
            reason: 'INVALID_PASSWORD',
            ...(ipAddress ? { ipAddress } : {}),
          }),
        },
      });

      const failedAttempts = await this.prisma.loginAttempt.count({
        where: {
          userId: user.id,
          successful: false,
          createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
        },
      });

      if (failedAttempts >= 5) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            status: 'LOCKED',
            tokenVersion: { increment: 1 },
          },
        });
        await this.prisma.securityEvent.create({
          data: {
            eventType: 'ACCOUNT_LOCKED',
            description:
              'Account locked after 5 failed login attempts within 15 minutes',
            riskLevel: 'HIGH',
            userId: user.id,
          },
        });
        await this.prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'ACCOUNT_LOCKED',
            resource: 'AUTH',
            result: 'SUCCESS',
            details:
              'Account locked after repeated failed login attempts within 15 minutes.',
          },
        });
        throw new UnauthorizedException(
          'Account locked because of repeated failed login attempts',
        );
      }

      throw new UnauthorizedException('Invalid email or password');
    }

    const deviceResult = (await this.devicesService.registerDevice(
      user.id,
      deviceId,
      userAgent,
    )) as DeviceRegistration;

    if (deviceResult.isNewDevice) {
      await this.prisma.securityEvent.create({
        data: {
          eventType: 'NEW_DEVICE_LOGIN',
          description: `Successful password authentication from new device: ${deviceId}`,
          riskLevel: 'MEDIUM',
          userId: user.id,
        },
      });
    }

    if (user.mfaEnabled) {
      const mfaPayload: MfaChallengePayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        deviceId,
        tokenVersion: user.tokenVersion,
        type: 'mfa',
        purpose: 'mfa-login',
      };

      const mfaToken = await this.jwtService.signAsync(mfaPayload, {
        expiresIn: 300,
      });

      return {
        mfaRequired: true,
        mfaToken,
        expiresIn: 300,
        message: 'Password verified. MFA verification required.',
      };
    }

    await this.prisma.loginAttempt.create({
      data: {
        successful: true,
        deviceInfo: deviceId,
        ...(ipAddress ? { ipAddress } : {}),
        userId: user.id,
      },
    });

    return this.issueSession(user, deviceId, deviceResult);
  }

  private async verifyMfaChallenge(
    token: string,
  ): Promise<MfaChallengePayload> {
    let payload: MfaChallengePayload;

    try {
      payload = await this.jwtService.verifyAsync<MfaChallengePayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA challenge');
    }

    if (
      payload.type !== 'mfa' ||
      payload.purpose !== 'mfa-login' ||
      !Number.isInteger(payload.sub) ||
      !Number.isInteger(payload.tokenVersion)
    ) {
      throw new UnauthorizedException('Invalid MFA challenge');
    }

    return payload;
  }

  private async getMfaUser(payload: MfaChallengePayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }
    if (!user.mfaEnabled) {
      throw new UnauthorizedException('MFA is not enabled for this account');
    }
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('MFA challenge is no longer valid');
    }

    return user;
  }

  async verifyMfaLogin(mfaToken: string, code: string, ipAddress?: string) {
    const payload = await this.verifyMfaChallenge(mfaToken);
    const user = await this.getMfaUser(payload);
    const valid = await this.mfaService.verifyUserCode(user.id, code);

    if (!valid) {
      await this.prisma.securityEvent.create({
        data: {
          eventType: 'MFA_LOGIN_FAILED',
          description: 'Invalid MFA code during login',
          riskLevel: 'MEDIUM',
          userId: user.id,
        },
      });
      throw new UnauthorizedException('Invalid MFA code');
    }

    await this.prisma.loginAttempt.create({
      data: {
        successful: true,
        deviceInfo: payload.deviceId,
        ...(ipAddress ? { ipAddress } : {}),
        userId: user.id,
      },
    });
    await this.prisma.securityEvent.create({
      data: {
        eventType: 'MFA_LOGIN_SUCCESS',
        description: 'User successfully completed MFA login',
        riskLevel: 'LOW',
        userId: user.id,
      },
    });

    return this.issueSession(user, payload.deviceId);
  }

  async verifyMfaRecoveryLogin(
    mfaToken: string,
    recoveryCode: string,
    ipAddress?: string,
  ) {
    const payload = await this.verifyMfaChallenge(mfaToken);
    const user = await this.getMfaUser(payload);
    const valid = await this.mfaService.consumeRecoveryCode(
      user.id,
      recoveryCode,
    );

    if (!valid) {
      await this.prisma.securityEvent.create({
        data: {
          eventType: 'MFA_RECOVERY_LOGIN_FAILED',
          description: 'Invalid or already used MFA recovery code',
          riskLevel: 'HIGH',
          userId: user.id,
        },
      });
      throw new UnauthorizedException('Invalid or already used recovery code');
    }

    await this.prisma.loginAttempt.create({
      data: {
        successful: true,
        deviceInfo: payload.deviceId,
        ...(ipAddress ? { ipAddress } : {}),
        userId: user.id,
      },
    });
    await this.prisma.securityEvent.create({
      data: {
        eventType: 'MFA_RECOVERY_LOGIN_SUCCESS',
        description: 'User authenticated using an MFA recovery code',
        riskLevel: 'MEDIUM',
        userId: user.id,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'MFA_RECOVERY_CODE_USED',
        resource: 'AUTH',
        result: 'SUCCESS',
        details: 'A one-time MFA recovery code was used for authentication.',
      },
    });

    return this.issueSession(user, payload.deviceId);
  }

  async refresh(refreshToken: string) {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (storedToken.revokedAt) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }
    if (storedToken.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token has expired');
    }
    if (storedToken.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    const newRefreshToken = this.generateRefreshToken();
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const revokeResult = await tx.refreshToken.updateMany({
        where: { id: storedToken.id, revokedAt: null },
        data: { revokedAt: now },
      });

      if (revokeResult.count !== 1) {
        throw new UnauthorizedException(
          'Refresh token has already been used or revoked',
        );
      }

      await tx.refreshToken.create({
        data: {
          tokenHash: this.hashToken(newRefreshToken),
          userId: storedToken.user.id,
          ...(storedToken.deviceId ? { deviceId: storedToken.deviceId } : {}),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    });

    const accessToken = await this.jwtService.signAsync({
      sub: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
      type: 'access',
      tokenVersion: storedToken.user.tokenVersion,
    });

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.hashToken(refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    return { message: 'Logged out successfully' };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ) {
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      await this.prisma.securityEvent.create({
        data: {
          eventType: 'PASSWORD_CHANGE_FAILED',
          description: 'Failed attempt to change account password',
          riskLevel: 'MEDIUM',
          userId,
        },
      });
      throw new UnauthorizedException('Invalid current password');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.securityEvent.create({
        data: {
          eventType: 'PASSWORD_CHANGED',
          description: 'Account password was changed and sessions revoked',
          riskLevel: 'LOW',
          userId,
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'PASSWORD_CHANGED',
          resource: 'AUTH',
          result: 'SUCCESS',
          details: 'Password changed and active refresh sessions revoked.',
        },
      });
    });

    return {
      message: 'Password changed successfully. Please sign in again.',
      sessionsRevoked: true,
    };
  }

  async forgotPassword(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(normalizedEmail);

    if (user && user.status === 'ACTIVE') {
      const token = randomBytes(48).toString('hex');
      await this.prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.passwordResetToken.create({
          data: {
            tokenHash: this.hashToken(token),
            userId: user.id,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          },
        });
        await tx.securityEvent.create({
          data: {
            eventType: 'PASSWORD_RESET_REQUESTED',
            description: 'A password reset was requested for the account',
            riskLevel: 'MEDIUM',
            userId: user.id,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: 'PASSWORD_RESET_REQUESTED',
            resource: 'AUTH',
            result: 'SUCCESS',
            details: 'Password reset was requested for the account.',
          },
        });
      });
    }

    return {
      message:
        'If an account exists for that email, password reset instructions have been sent.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token.trim()) },
    });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException(
        'Invalid or expired password reset token',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) {
        throw new UnauthorizedException(
          'Invalid or expired password reset token',
        );
      }

      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await tx.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.securityEvent.create({
        data: {
          eventType: 'PASSWORD_RESET_COMPLETED',
          description: 'Password reset completed and sessions revoked',
          riskLevel: 'MEDIUM',
          userId: resetToken.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: resetToken.userId,
          action: 'PASSWORD_RESET_COMPLETED',
          resource: 'AUTH',
          result: 'SUCCESS',
          details: 'Password reset completed and active sessions revoked.',
        },
      });
    });

    return {
      message: 'Password reset successfully. Please sign in again.',
      sessionsRevoked: true,
    };
  }

  async getSessions(userId: number) {
    return this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        deviceId: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async revokeSession(userId: number, sessionId: number) {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException('Session not found');
    }

    return { message: 'Session revoked successfully' };
  }

  async revokeAllSessions(userId: number) {
    const revokedCount = await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'ALL_SESSIONS_REVOKED',
          resource: 'AUTH',
          result: 'SUCCESS',
          details: 'All active refresh sessions were revoked.',
        },
      });
      return revoked.count;
    });

    return { message: 'All sessions revoked successfully', revokedCount };
  }
}
