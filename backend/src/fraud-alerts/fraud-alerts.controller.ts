import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';

import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

import { FraudAlertsService } from './fraud-alerts.service';

import { UpdateFraudAlertStatusDto } from './dto/update-fraud-alert-status.dto';

interface AuthenticatedRequest
  extends Request {
  user: {
    sub: number;
    email: string;
    role: string;
  };
}

@Controller('fraud-alerts')
@UseGuards(
  AuthGuard,
  RolesGuard,
)
@Roles(
  'FRAUD_ANALYST',
  'SECURITY_ANALYST',
  'ADMIN',
)
export class FraudAlertsController {
  constructor(
    private readonly fraudAlertsService:
      FraudAlertsService,
  ) {}

  // ==========================================
  // GET ALL ALERTS
  // ==========================================

  @Get()
  findAll() {
    return this.fraudAlertsService.findAll();
  }

  // ==========================================
  // GET ONE ALERT
  // ==========================================

  @Get(':id')
  findOne(
    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,
  ) {
    return this.fraudAlertsService.findOne(
      id,
    );
  }

  // ==========================================
  // UPDATE STATUS
  // ==========================================

  @Patch(':id/status')
  updateStatus(
    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,

    @Body()
    dto: UpdateFraudAlertStatusDto,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.fraudAlertsService.updateStatus(
      id,
      dto,
      request.user.sub,
    );
  }
}