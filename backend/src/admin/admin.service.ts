import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ==========================================
  // GET ALL USERS
  // ==========================================

  async findAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        mfaEnabled: true,
        createdAt: true,
        updatedAt: true,

        _count: {
          select: {
            accounts: true,
            devices: true,
            loginAttempts: true,
            securityEvents: true,
          },
        },
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  // ==========================================
  // GET ONE USER
  // ==========================================

  async findUserById(id: number) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id,
        },

        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          mfaEnabled: true,
          createdAt: true,
          updatedAt: true,

          accounts: {
            select: {
              id: true,
              accountNumber: true,
              balance: true,
              currency: true,
              createdAt: true,
            },
          },

          devices: {
            select: {
              id: true,
              deviceId: true,
              browser: true,
              os: true,
              trusted: true,
              firstSeen: true,
              lastSeen: true,
            },
          },

          loginAttempts: {
            orderBy: {
              createdAt: 'desc',
            },

            take: 10,

            select: {
              id: true,
              successful: true,
              deviceInfo: true,
              ipAddress: true,
              createdAt: true,
            },
          },

          securityEvents: {
            orderBy: {
              createdAt: 'desc',
            },

            take: 10,
          },
        },
      });

    if (!user) {
      throw new NotFoundException(
        'User not found',
      );
    }

    return user;
  }

  // ==========================================
  // UPDATE USER STATUS
  // ==========================================

  async updateUserStatus(
    targetUserId: number,
    dto: UpdateUserStatusDto,
    adminUserId: number,
  ) {
    if (targetUserId === adminUserId) {
      throw new BadRequestException(
        'You cannot change your own account status',
      );
    }

    const user =
      await this.prisma.user.findUnique({
        where: {
          id: targetUserId,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'User not found',
      );
    }

    const previousStatus =
      user.status;

    const updatedUser =
      await this.prisma.user.update({
        where: {
          id: targetUserId,
        },

        data: {
          status: dto.status,
        },

        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true,
          updatedAt: true,
        },
      });

    await this.auditLogsService.create({
      userId: adminUserId,

      action:
        'USER_STATUS_CHANGED',

      resource:
        `User:${targetUserId}`,

      result:
        'SUCCESS',

      details:
        JSON.stringify({
          targetUserId,
          email: user.email,
          previousStatus,
          newStatus: dto.status,
        }),
    });

    return {
      message:
        'User status updated successfully',

      user: updatedUser,
    };
  }
}