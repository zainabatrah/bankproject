import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Request } from 'express';

import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { CreateTransferDto } from './dto/create-transfer.dto';
import { ReverseTransactionDto } from './dto/reverse-transaction.dto';

import { TransactionsService } from './transactions.service';

interface AuthenticatedRequest extends Request {
  user: {
    sub: number;
    email: string;
    role: string;
  };
}

@Controller('transactions')
@UseGuards(AuthGuard, RolesGuard)
@Roles('CUSTOMER', 'BANK_EMPLOYEE')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('transfer')
  transfer(
    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: CreateTransferDto,

    @Headers('x-device-id')
    deviceId: string,

    @Headers('x-idempotency-key')
    idempotencyKey?: string,
  ) {
    if (!deviceId) {
      throw new BadRequestException('X-Device-ID header is required');
    }

    if (idempotencyKey && idempotencyKey.trim().length > 120) {
      throw new BadRequestException('X-Idempotency-Key is too long');
    }

    return this.transactionsService.transfer(
      request.user.sub,
      dto,
      deviceId,
      idempotencyKey,
    );
  }

  @Get('me')
  getMyTransactions(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.transactionsService.getMyTransactions(request.user.sub);
  }

  @Post(':id/reverse')
  reverse(
    @Req()
    request: AuthenticatedRequest,

    @Param('id', ParseIntPipe)
    transactionId: number,

    @Body()
    dto: ReverseTransactionDto,
  ) {
    return this.transactionsService.reverse(
      request.user.sub,
      transactionId,
      dto.reason,
    );
  }
}
