import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UpdateFraudAlertStatusDto } from '../fraud-alerts/dto/update-fraud-alert-status.dto';
import { CreateSocCaseDto } from './dto/create-soc-case.dto';
import { CreateSocNoteDto } from './dto/create-soc-note.dto';
import { SocService } from './soc.service';

type AuthenticatedRequest = Request & {
  user: { sub: number };
};

@Controller('soc')
@UseGuards(AuthGuard, RolesGuard)
@Roles('FRAUD_ANALYST', 'SECURITY_ANALYST', 'ADMIN')
export class SocController {
  constructor(private readonly socService: SocService) {}

  @Get('summary')
  summary() {
    return this.socService.getSummary();
  }

  @Get('alerts')
  alerts() {
    return this.socService.getAlerts();
  }

  @Get('analytics/risk-distribution')
  riskDistribution() {
    return this.socService.getRiskDistribution();
  }

  @Get('analytics/alerts-per-day')
  alertsPerDay() {
    return this.socService.getAlertsPerDay();
  }

  @Get('analytics/cases-by-status')
  casesByStatus() {
    return this.socService.getCasesByStatus();
  }

  @Get('analytics/security-events-by-type')
  securityEventsByType() {
    return this.socService.getSecurityEventsByType();
  }

  @Get('security-events')
  securityEvents() {
    return this.socService.getSecurityEvents();
  }

  @Get('audit-logs')
  auditLogs() {
    return this.socService.getAuditLogs();
  }

  @Get('cases')
  cases() {
    return this.socService.getCases();
  }

  @Patch('alerts/:id/status')
  updateAlertStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFraudAlertStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.socService.updateAlertStatus(id, dto.status, request.user.sub);
  }

  @Post('alerts/:id/notes')
  addNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateSocNoteDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.socService.addNote(id, dto.note, request.user.sub);
  }

  @Post('cases')
  createCase(
    @Body() dto: CreateSocCaseDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.socService.createCase(
      dto.alert_id,
      dto.assigned_analyst,
      dto.summary,
      request.user.sub,
    );
  }

  @Patch('cases/:id/status')
  updateCaseStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFraudAlertStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.socService.updateCaseStatus(id, dto.status, request.user.sub);
  }

  @Get('reports/alerts.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="bankshield-alerts.csv"')
  alertsCsv() {
    return this.socService.getAlertsCsv();
  }

  @Get('reports/security-report.json')
  securityReport() {
    return this.socService.getSecurityReport();
  }
}
