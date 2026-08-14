import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Request } from 'express';

import { AuthGuard } from '../auth/auth.guard';
import { BeneficiariesService } from './beneficiaries.service';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';

interface AuthenticatedRequest extends Request {
  user: {
    sub: number;
    email: string;
    role: string;
  };
}

@Controller('beneficiaries')
@UseGuards(AuthGuard)
export class BeneficiariesController {
  constructor(
    private readonly beneficiariesService:
      BeneficiariesService,
  ) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateBeneficiaryDto,
  ) {
    return this.beneficiariesService.create(
      request.user.sub,
      dto,
    );
  }

  @Get()
  findMine(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.beneficiariesService.findMine(
      request.user.sub,
    );
  }

  @Delete(':id')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.beneficiariesService.remove(
      request.user.sub,
      id,
    );
  }
}