import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { DevicesService } from './devices.service';

type AuthenticatedRequest = Request & {
  user: { sub: number };
};

@Controller('devices')
@UseGuards(AuthGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.devicesService.getMyDevices(request.user.sub);
  }

  @Patch(':id/trust')
  trust(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.devicesService.setTrust(request.user.sub, id, true);
  }

  @Patch(':id/untrust')
  untrust(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.devicesService.setTrust(request.user.sub, id, false);
  }

  @Delete(':id/sessions')
  revokeSessions(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.devicesService.revokeDeviceSessions(request.user.sub, id);
  }
}
