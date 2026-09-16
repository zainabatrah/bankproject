import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

import { AuditLogsService } from './audit-logs.service';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

@Controller('audit-logs')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN', 'SECURITY_ANALYST')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  findAll(@Query() query: ListAuditLogsDto) {
    return this.auditLogsService.findAll(query);
  }

  @Get('summary')
  summary(@Query() query: ListAuditLogsDto) {
    return this.auditLogsService.getSummary(query);
  }

  @Get('user/:userId')
  findByUser(
    @Param('userId', ParseIntPipe)
    userId: number,
    @Query() query: ListAuditLogsDto,
  ) {
    return this.auditLogsService.findByUser(userId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.auditLogsService.findOne(id);
  }
}
