import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Request } from 'express';

import { AuthGuard } from '../auth/auth.guard';

import { CreateTransferDto } from './dto/create-transfer.dto';

import { TransactionsService } from './transactions.service';

interface AuthenticatedRequest
  extends Request {
  user: {
    sub: number;
    email: string;
    role: string;
  };
}

@Controller('transactions')
@UseGuards(AuthGuard)
export class TransactionsController {
  constructor(
    private readonly transactionsService:
      TransactionsService,
  ) {}

  @Post('transfer')
  transfer(
    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: CreateTransferDto,

    @Headers('x-device-id')
    deviceId: string,
  ) {
    if (!deviceId) {
      throw new BadRequestException(
        'X-Device-ID header is required',
      );
    }

    return this.transactionsService.transfer(
      request.user.sub,
      dto,
      deviceId,
    );
  }

  @Get('me')
  getMyTransactions(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.transactionsService
      .getMyTransactions(
        request.user.sub,
      );
  }
}