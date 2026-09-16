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

import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsersService } from '../users/users.service';

import { UpdateUserRoleDto } from './dto/update-user-role.dto';

import { UpdateUserStatusDto } from './dto/update-user-status.dto';

type AuthenticatedRequest = {
  user: {
    sub: number;
    email: string;
    role: string;
  };
};

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  getUsers() {
    return this.usersService.findAll();
  }

  @Get('users/:id')
  getUser(
    @Param('id', ParseIntPipe)
    userId: number,
  ) {
    return this.usersService.findById(userId);
  }

  @Patch('users/:id/role')
  updateUserRole(
    @Req()
    request: AuthenticatedRequest,

    @Param('id', ParseIntPipe)
    userId: number,

    @Body()
    dto: UpdateUserRoleDto,
  ) {
    return this.usersService.updateRole(request.user.sub, userId, dto.role);
  }

  @Patch('users/:id/status')
  updateUserStatus(
    @Req()
    request: AuthenticatedRequest,

    @Param('id', ParseIntPipe)
    userId: number,

    @Body()
    dto: UpdateUserStatusDto,
  ) {
    return this.usersService.updateStatus(request.user.sub, userId, dto.status);
  }
}
