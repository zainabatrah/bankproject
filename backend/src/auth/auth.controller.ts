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

import { Throttle } from '@nestjs/throttler';

import type { Request } from 'express';

import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { MfaService } from './mfa.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyMfaDto } from './dto/verify-mfa.dto';
import { MfaLoginDto } from './dto/mfa-login.dto';

import { UsersService } from '../users/users.service';

interface AuthenticatedRequest extends Request {
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

    private readonly mfaService:
      MfaService,
  ) {}

  // ==========================================
  // REGISTER
  // POST /auth/register
  // ==========================================

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

  // ==========================================
  // LOGIN
  // POST /auth/login
  // ==========================================

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 5,
      ttl: 60000,
    },
  })
  login(
    @Body()
    loginDto: LoginDto,

    @Req()
    request: Request,

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
      request.ip,
    );
  }

  // ==========================================
  // MFA LOGIN VERIFY
  // POST /auth/mfa/login-verify
  // ==========================================

  @Post('mfa/login-verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 5,
      ttl: 60000,
    },
  })
  verifyMfaLogin(
    @Body()
    dto: MfaLoginDto,

    @Req()
    request: Request,
  ) {
    return this.authService.verifyMfaLogin(
      dto.mfaToken,
      dto.code,
      request.ip,
    );
  }

  // ==========================================
  // REFRESH ACCESS TOKEN
  // POST /auth/refresh
  // ==========================================

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit: 10,
      ttl: 60000,
    },
  })
  refresh(
    @Body()
    dto: RefreshTokenDto,
  ) {
    return this.authService.refresh(
      dto.refreshToken,
    );
  }

  // ==========================================
  // LOGOUT
  // POST /auth/logout
  // ==========================================

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @Body()
    dto: RefreshTokenDto,
  ) {
    return this.authService.logout(
      dto.refreshToken,
    );
  }

  // ==========================================
  // CURRENT USER
  // GET /auth/me
  // ==========================================

  @Get('me')
  @UseGuards(AuthGuard)
  async me(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.usersService.findById(
      request.user.sub,
    );
  }

  // ==========================================
  // START MFA SETUP
  // POST /auth/mfa/setup
  // ==========================================

  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  setupMfa(
    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.mfaService.setup(
      request.user.sub,
    );
  }

  // ==========================================
  // VERIFY MFA SETUP
  // POST /auth/mfa/verify-setup
  // ==========================================

  @Post('mfa/verify-setup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @Throttle({
    default: {
      limit: 5,
      ttl: 60000,
    },
  })
  verifyMfaSetup(
    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: VerifyMfaDto,
  ) {
    return this.mfaService.verifySetup(
      request.user.sub,
      dto.code,
    );
  }
}