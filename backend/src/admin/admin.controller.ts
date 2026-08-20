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

import { AdminService } from './admin.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

interface AuthenticatedRequest
  extends Request {
  user: {
    sub: number;
    email: string;
    role: string;
  };
}

@Controller('admin')
@UseGuards(
  AuthGuard,
  RolesGuard,
)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly adminService:
      AdminService,
  ) {}

  @Get('test')
  testAdminAccess() {
    return {
      message:
        'Admin authorization successful',
    };
  }

  // ==========================================
  // ALL USERS
  // ==========================================

  @Get('users')
  findAllUsers() {
    return this.adminService.findAllUsers();
  }

  // ==========================================
  // USER DETAILS
  // ==========================================

  @Get('users/:id')
  findUserById(
    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,
  ) {
    return this.adminService.findUserById(
      id,
    );
  }

  // ==========================================
  // CHANGE ACCOUNT STATUS
  // ==========================================

  @Patch('users/:id/status')
  updateUserStatus(
    @Param(
      'id',
      ParseIntPipe,
    )
    id: number,

    @Body()
    dto: UpdateUserStatusDto,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.adminService.updateUserStatus(
      id,
      dto,
      request.user.sub,
    );
  }
}