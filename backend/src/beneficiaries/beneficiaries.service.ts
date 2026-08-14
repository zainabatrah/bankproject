import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';

@Injectable()
export class BeneficiariesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(
    userId: number,
    dto: CreateBeneficiaryDto,
  ) {
    const accountNumber =
      dto.accountNumber.trim();

    // Check that the receiver account really exists
    const receiverAccount =
      await this.prisma.bankAccount.findUnique({
        where: {
          accountNumber,
        },
      });

    if (!receiverAccount) {
      throw new NotFoundException(
        'Bank account does not exist',
      );
    }

    // Prevent adding your own account as beneficiary
    if (receiverAccount.userId === userId) {
      throw new BadRequestException(
        'You cannot add your own account as a beneficiary',
      );
    }

    // Prevent duplicate beneficiary
    const existing =
      await this.prisma.beneficiary.findFirst({
        where: {
          ownerId: userId,
          accountNumber,
        },
      });

    if (existing) {
      throw new BadRequestException(
        'Beneficiary already exists',
      );
    }

    return this.prisma.beneficiary.create({
      data: {
        name: dto.name.trim(),
        accountNumber,
        bankName:
          dto.bankName?.trim() ??
          'BankShield',
        ownerId: userId,
      },
    });
  }

  async findMine(userId: number) {
    return this.prisma.beneficiary.findMany({
      where: {
        ownerId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async remove(
    userId: number,
    beneficiaryId: number,
  ) {
    const beneficiary =
      await this.prisma.beneficiary.findFirst({
        where: {
          id: beneficiaryId,
          ownerId: userId,
        },
      });

    if (!beneficiary) {
      throw new NotFoundException(
        'Beneficiary not found',
      );
    }

    await this.prisma.beneficiary.delete({
      where: {
        id: beneficiaryId,
      },
    });

    return {
      message:
        'Beneficiary deleted successfully',
    };
  }
}