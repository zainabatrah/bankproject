import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

type AppRole =
  'CUSTOMER' | 'BANK_EMPLOYEE' | 'FRAUD_ANALYST' | 'SECURITY_ANALYST' | 'ADMIN';

type AppStatus = 'ACTIVE' | 'LOCKED' | 'SUSPENDED';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: {
        email,
      },
    });
  }

  async findById(id: number) {
    return this.prisma.user.findUnique({
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
      },
    });
  }

  async findAll() {
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
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(data: {
    email: string;
    firstName: string;
    lastName: string;
    passwordHash: string;
  }) {
    return this.prisma.user.create({
      data,
    });
  }

  async updateRole(adminUserId: number, targetUserId: number, role: AppRole) {
    const targetUser = await this.prisma.user.findUnique({
      where: {
        id: targetUserId,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (adminUserId === targetUserId && role !== 'ADMIN') {
      throw new BadRequestException('You cannot remove your own admin role');
    }

    if (targetUser.role === role) {
      throw new BadRequestException('User already has this role');
    }

    const oldRole = targetUser.role;

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: {
          id: targetUserId,
        },

        data: {
          role,
          tokenVersion: { increment: 1 },
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
        },
      });

      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'USER_ROLE_CHANGED',
          resource: `USER:${targetUserId}`,
          result: 'SUCCESS',
          details: `Role changed from ${oldRole} to ${role}`,
        },
      });

      await tx.securityEvent.create({
        data: {
          userId: targetUserId,
          eventType: 'USER_ROLE_CHANGED',
          description: `User role changed from ${oldRole} to ${role}`,
          riskLevel: 'MEDIUM',
        },
      });

      return user;
    });

    return {
      message: 'User role updated successfully',
      user: updatedUser,
    };
  }

  async updateStatus(
    adminUserId: number,
    targetUserId: number,
    status: AppStatus,
  ) {
    const targetUser = await this.prisma.user.findUnique({
      where: {
        id: targetUserId,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (adminUserId === targetUserId && status !== 'ACTIVE') {
      throw new BadRequestException(
        'You cannot lock or suspend your own account',
      );
    }

    if (targetUser.status === status) {
      throw new BadRequestException('User already has this status');
    }

    const oldStatus = targetUser.status;

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: {
          id: targetUserId,
        },

        data: {
          status,
          tokenVersion: { increment: 1 },
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
        },
      });

      if (status === 'LOCKED' || status === 'SUSPENDED') {
        await tx.refreshToken.updateMany({
          where: {
            userId: targetUserId,
            revokedAt: null,
          },

          data: {
            revokedAt: new Date(),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'USER_STATUS_CHANGED',
          resource: `USER:${targetUserId}`,
          result: 'SUCCESS',
          details: `Status changed from ${oldStatus} to ${status}`,
        },
      });

      await tx.securityEvent.create({
        data: {
          userId: targetUserId,
          eventType: 'USER_STATUS_CHANGED',
          description: `User status changed from ${oldStatus} to ${status}`,
          riskLevel: status === 'ACTIVE' ? 'LOW' : 'HIGH',
        },
      });

      return user;
    });

    return {
      message: 'User status updated successfully',
      user: updatedUser,
    };
  }
}
