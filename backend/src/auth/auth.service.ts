import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';

import {
  createHash,
  randomBytes,
} from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { DevicesService } from '../devices/devices.service';

import { MfaService } from './mfa.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

interface MfaChallengePayload {
  sub: number;
  email: string;
  role: string;
  deviceId: string;

  type: 'mfa';
  purpose: 'mfa-login';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService:
      UsersService,

    private readonly jwtService:
      JwtService,

    private readonly devicesService:
      DevicesService,

    private readonly prisma:
      PrismaService,

    private readonly mfaService:
      MfaService,
  ) {}

  // ==========================================
  // REFRESH TOKEN HELPERS
  // ==========================================

  private generateRefreshToken(): string {
    return randomBytes(64)
      .toString('hex');
  }

  private hashRefreshToken(
    token: string,
  ): string {
    return createHash('sha256')
      .update(token)
      .digest('hex');
  }

  private async createRefreshToken(
    userId: number,
    deviceId?: string,
  ): Promise<string> {
    const refreshToken =
      this.generateRefreshToken();

    const tokenHash =
      this.hashRefreshToken(
        refreshToken,
      );

    const expiresAt =
      new Date(
        Date.now() +
          7 * 24 * 60 * 60 * 1000,
      );

    if (deviceId) {
      await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          deviceId,
          revokedAt: null,
        },

        data: {
          revokedAt: new Date(),
        },
      });
    }

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId,
        deviceId,
        expiresAt,
      },
    });

    return refreshToken;
  }

  // ==========================================
  // ISSUE FULL AUTH SESSION
  // ==========================================

  private async issueSession(
    user: {
      id: number;
      email: string;
      firstName: string;
      lastName: string;
      role: any;
      status: any;
    },

    deviceId: string,

    deviceResult?: any,
  ) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,

      // Very important:
      // AuthGuard will only allow type=access.
      type: 'access',
    };

    const accessToken =
      await this.jwtService.signAsync(
        payload,
      );

    const refreshToken =
      await this.createRefreshToken(
        user.id,
        deviceId,
      );

    return {
      accessToken,
      refreshToken,

      ...(deviceResult
        ? {
            newDevice:
              deviceResult.isNewDevice,

            device: {
              id:
                deviceResult.device.id,

              deviceId:
                deviceResult.device.deviceId,

              browser:
                deviceResult.device.browser,

              os:
                deviceResult.device.os,

              trusted:
                deviceResult.device.trusted,

              firstSeen:
                deviceResult.device.firstSeen,

              lastSeen:
                deviceResult.device.lastSeen,
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

  // ==========================================
  // REGISTER
  // ==========================================

  async register(
    registerDto: RegisterDto,
  ) {
    const email =
      registerDto.email
        .trim()
        .toLowerCase();

    const existingUser =
      await this.usersService.findByEmail(
        email,
      );

    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists',
      );
    }

    const passwordHash =
      await bcrypt.hash(
        registerDto.password,
        12,
      );

    const user =
      await this.usersService.create({
        email,

        firstName:
          registerDto.firstName.trim(),

        lastName:
          registerDto.lastName.trim(),

        passwordHash,
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

  // ==========================================
  // LOGIN
  // ==========================================

  async login(
    loginDto: LoginDto,
    deviceId: string,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const email =
      loginDto.email
        .trim()
        .toLowerCase();

    const user =
      await this.usersService.findByEmail(
        email,
      );

    // ========================================
    // UNKNOWN EMAIL
    // ========================================

    if (!user) {
      await this.prisma.loginAttempt.create({
        data: {
          successful: false,
          deviceInfo: deviceId,
          ipAddress,
          userId: null,
        },
      });

      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    // ========================================
    // ACCOUNT STATUS
    // ========================================

    if (user.status === 'LOCKED') {
      throw new UnauthorizedException(
        'Account is locked',
      );
    }

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException(
        'Account is suspended',
      );
    }

    // ========================================
    // PASSWORD
    // ========================================

    const passwordMatches =
      await bcrypt.compare(
        loginDto.password,
        user.passwordHash,
      );

    if (!passwordMatches) {
      await this.prisma.loginAttempt.create({
        data: {
          successful: false,
          deviceInfo: deviceId,
          ipAddress,
          userId: user.id,
        },
      });

      const fifteenMinutesAgo =
        new Date(
          Date.now() -
            15 * 60 * 1000,
        );

      const failedAttempts =
        await this.prisma.loginAttempt.count({
          where: {
            userId: user.id,
            successful: false,

            createdAt: {
              gte:
                fifteenMinutesAgo,
            },
          },
        });

      if (failedAttempts >= 5) {
        await this.prisma.user.update({
          where: {
            id: user.id,
          },

          data: {
            status: 'LOCKED',
          },
        });

        await this.prisma.securityEvent.create({
          data: {
            eventType:
              'ACCOUNT_LOCKED',

            description:
              'Account locked after 5 failed login attempts within 15 minutes',

            riskLevel:
              'HIGH',

            userId:
              user.id,
          },
        });

        throw new UnauthorizedException(
          'Account locked because of repeated failed login attempts',
        );
      }

      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    // ========================================
    // DEVICE
    // ========================================

    const deviceResult =
      await this.devicesService.registerDevice(
        user.id,
        deviceId,
        userAgent,
      );

    if (deviceResult.isNewDevice) {
      await this.prisma.securityEvent.create({
        data: {
          eventType:
            'NEW_DEVICE_LOGIN',

          description:
            `Successful password authentication from new device: ${deviceId}`,

          riskLevel:
            'MEDIUM',

          userId:
            user.id,
        },
      });
    }

    // ========================================
    // MFA ENABLED
    // ========================================

    if (user.mfaEnabled) {
      const mfaPayload:
        MfaChallengePayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        deviceId,

        type: 'mfa',
        purpose: 'mfa-login',
      };

      const mfaToken =
        await this.jwtService.signAsync(
          mfaPayload,
          {
            expiresIn: 300,
          },
        );

      return {
        mfaRequired: true,

        mfaToken,

        expiresIn: 300,

        message:
          'Password verified. MFA verification required.',
      };
    }

    // ========================================
    // MFA NOT ENABLED
    // NORMAL LOGIN COMPLETE
    // ========================================

    await this.prisma.loginAttempt.create({
      data: {
        successful: true,
        deviceInfo: deviceId,
        ipAddress,
        userId: user.id,
      },
    });

    return this.issueSession(
      user,
      deviceId,
      deviceResult,
    );
  }

  // ==========================================
  // VERIFY MFA LOGIN
  // ==========================================

  async verifyMfaLogin(
    mfaToken: string,
    code: string,
    ipAddress?: string,
  ) {
    let payload:
      MfaChallengePayload;

    try {
      payload =
        await this.jwtService
          .verifyAsync<MfaChallengePayload>(
            mfaToken,
          );
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired MFA challenge',
      );
    }

    // ========================================
    // MAKE SURE THIS IS REALLY MFA TOKEN
    // ========================================

    if (
      payload.type !== 'mfa' ||
      payload.purpose !== 'mfa-login'
    ) {
      throw new UnauthorizedException(
        'Invalid MFA challenge',
      );
    }

    // ========================================
    // USER MUST STILL EXIST
    // ========================================

    const user =
      await this.prisma.user.findUnique({
        where: {
          id: payload.sub,
        },
      });

    if (!user) {
      throw new UnauthorizedException(
        'User account no longer exists',
      );
    }

    // ========================================
    // CURRENT STATUS
    // ========================================

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        'Account is not active',
      );
    }

    if (!user.mfaEnabled) {
      throw new UnauthorizedException(
        'MFA is not enabled for this account',
      );
    }

    // ========================================
    // VERIFY OTP
    // ========================================

    const valid =
      await this.mfaService.verifyUserCode(
        user.id,
        code,
      );

    if (!valid) {
      await this.prisma.securityEvent.create({
        data: {
          eventType:
            'MFA_LOGIN_FAILED',

          description:
            'Invalid MFA code during login',

          riskLevel:
            'MEDIUM',

          userId:
            user.id,
        },
      });

      throw new UnauthorizedException(
        'Invalid MFA code',
      );
    }

    // ========================================
    // SUCCESSFUL LOGIN
    // ========================================

    await this.prisma.loginAttempt.create({
      data: {
        successful: true,
        deviceInfo:
          payload.deviceId,

        ipAddress,

        userId:
          user.id,
      },
    });

    await this.prisma.securityEvent.create({
      data: {
        eventType:
          'MFA_LOGIN_SUCCESS',

        description:
          'User successfully completed MFA login',

        riskLevel:
          'LOW',

        userId:
          user.id,
      },
    });

    return this.issueSession(
      user,
      payload.deviceId,
    );
  }

  // ==========================================
  // REFRESH TOKEN
  // ==========================================

  async refresh(
    refreshToken: string,
  ) {
    const tokenHash =
      this.hashRefreshToken(
        refreshToken,
      );

    const storedToken =
      await this.prisma.refreshToken.findUnique({
        where: {
          tokenHash,
        },

        include: {
          user: true,
        },
      });

    if (!storedToken) {
      throw new UnauthorizedException(
        'Invalid refresh token',
      );
    }

    if (storedToken.revokedAt) {
      throw new UnauthorizedException(
        'Refresh token has been revoked',
      );
    }

    if (
      storedToken.expiresAt.getTime() <=
      Date.now()
    ) {
      throw new UnauthorizedException(
        'Refresh token has expired',
      );
    }

    if (
      storedToken.user.status !==
      'ACTIVE'
    ) {
      throw new UnauthorizedException(
        'Account is not active',
      );
    }

    const user =
      storedToken.user;

    // ========================================
    // NEW ACCESS TOKEN MUST BE type=access
    // ========================================

    const newAccessToken =
      await this.jwtService.signAsync({
        sub: user.id,
        email: user.email,
        role: user.role,
        type: 'access',
      });

    const newRefreshToken =
      this.generateRefreshToken();

    const newTokenHash =
      this.hashRefreshToken(
        newRefreshToken,
      );

    const newExpiresAt =
      new Date(
        Date.now() +
          7 * 24 * 60 * 60 * 1000,
      );

    await this.prisma.$transaction(
      async (tx) => {
        const revokeResult =
          await tx.refreshToken.updateMany({
            where: {
              id:
                storedToken.id,

              revokedAt:
                null,
            },

            data: {
              revokedAt:
                new Date(),
            },
          });

        if (
          revokeResult.count !== 1
        ) {
          throw new UnauthorizedException(
            'Refresh token has already been used or revoked',
          );
        }

        await tx.refreshToken.create({
          data: {
            tokenHash:
              newTokenHash,

            userId:
              user.id,

            deviceId:
              storedToken.deviceId,

            expiresAt:
              newExpiresAt,
          },
        });
      },
    );

    return {
      accessToken:
        newAccessToken,

      refreshToken:
        newRefreshToken,
    };
  }

  // ==========================================
  // LOGOUT
  // ==========================================

  async logout(
    refreshToken: string,
  ) {
    const tokenHash =
      this.hashRefreshToken(
        refreshToken,
      );

    const storedToken =
      await this.prisma.refreshToken.findUnique({
        where: {
          tokenHash,
        },
      });

    if (
      !storedToken ||
      storedToken.revokedAt
    ) {
      return {
        message:
          'Logged out successfully',
      };
    }

    await this.prisma.refreshToken.update({
      where: {
        id: storedToken.id,
      },

      data: {
        revokedAt:
          new Date(),
      },
    });

    return {
      message:
        'Logged out successfully',
    };
  }
}