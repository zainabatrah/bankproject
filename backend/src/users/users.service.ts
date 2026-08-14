import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

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
}