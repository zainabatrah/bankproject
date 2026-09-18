import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateSecurityEventDto } from './dto/create-security-event.dto';
import { ListSecurityEventsDto } from './dto/list-security-events.dto';
import { SecurityEventsService } from './security-events.service';

type AuthenticatedRequest = Request & { user: { sub: number } };

@Controller('security-events')
@UseGuards(AuthGuard, RolesGuard)
@Roles('SECURITY_ANALYST', 'ADMIN')
export class SecurityEventsController {
  constructor(private readonly securityEventsService: SecurityEventsService) {}

  @Get('summary')
  summary(@Query() query: ListSecurityEventsDto) {
    return this.securityEventsService.getSummary(query);
  }

  @Get('types')
  types(@Query() query: ListSecurityEventsDto) {
    return this.securityEventsService.getTypeCounts(query);
  }

  @Get()
  findAll(@Query() query: ListSecurityEventsDto) {
    return this.securityEventsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.securityEventsService.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateSecurityEventDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.securityEventsService.create(dto, request.user.sub);
  }
}
