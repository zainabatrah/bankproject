import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

import { AuditLogsService } from './audit-logs.service';

@Controller('audit-logs')
@UseGuards(
  AuthGuard,
  RolesGuard,
)
@Roles(
  'ADMIN',
  'SECURITY_ANALYST',
)
export class AuditLogsController {
  constructor(
    private readonly auditLogsService:
      AuditLogsService,
  ) {}

  @Get()
  findAll() {
    return this.auditLogsService.findAll();
  }

  @Get('user/:userId')
  findByUser(
    @Param(
      'userId',
      ParseIntPipe,
    )
    userId: number,
  ) {
    return this.auditLogsService.findByUser(
      userId,
    );
  }
}