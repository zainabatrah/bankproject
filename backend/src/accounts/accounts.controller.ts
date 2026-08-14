import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Request } from 'express';

import { AuthGuard } from '../auth/auth.guard';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';

interface AuthenticatedRequest extends Request {
  user: {
    sub: number;
    email: string;
    role: string;
  };
}

@Controller('accounts')
@UseGuards(AuthGuard)
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
  ) {}

  @Post()
  createAccount(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAccountDto,
  ) {
    return this.accountsService.createAccount(
      request.user.sub,
      dto.currency,
    );
  }

  @Get('me')
  getMyAccounts(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.accountsService.getMyAccounts(
      request.user.sub,
    );
  }
}