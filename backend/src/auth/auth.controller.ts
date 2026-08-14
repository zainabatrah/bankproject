import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { Request } from 'express';

import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

import { UsersService } from '../users/users.service';

interface AuthenticatedRequest
  extends Request {
  user: {
    sub: number;
    email: string;
    role: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService:
      AuthService,

    private readonly usersService:
      UsersService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(
    @Body()
    registerDto: RegisterDto,
  ) {
    return this.authService.register(
      registerDto,
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body()
    loginDto: LoginDto,

    @Headers('x-device-id')
    deviceId: string,

    @Headers('user-agent')
    userAgent?: string,
  ) {
    if (!deviceId) {
      throw new BadRequestException(
        'X-Device-ID header is required',
      );
    }

    return this.authService.login(
      loginDto,
      deviceId,
      userAgent,
    );
  }

  @UseGuards(AuthGuard)
  @Get('me')
  async me(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.usersService.findById(
      request.user.sub,
    );
  }
}