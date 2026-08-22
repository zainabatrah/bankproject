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

import {
  Throttle,
} from '@nestjs/throttler';

import type {
  Request,
} from 'express';

import {
  AuthService,
} from './auth.service';

import {
  AuthGuard,
} from './auth.guard';

import {
  MfaService,
} from './mfa.service';

import {
  RegisterDto,
} from './dto/register.dto';

import {
  LoginDto,
} from './dto/login.dto';

import {
  RefreshTokenDto,
} from './dto/refresh-token.dto';

import {
  VerifyMfaDto,
} from './dto/verify-mfa.dto';

import {
  MfaLoginDto,
} from './dto/mfa-login.dto';

import {
  DisableMfaDto,
} from './dto/disable-mfa.dto';

import {
  MfaRecoveryLoginDto,
} from './dto/mfa-recovery-login.dto';

import {
  RegenerateRecoveryCodesDto,
} from './dto/regenerate-recovery-codes.dto';

import {
  UsersService,
} from '../users/users.service';

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

    private readonly mfaService:
      MfaService,
  ) {}

  // =========================================================
  // REGISTER
  // =========================================================

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

  // =========================================================
  // LOGIN
  // =========================================================

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit:
        5,

      ttl:
        60000,
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

  // =========================================================
  // NORMAL MFA LOGIN
  // =========================================================

  @Post('mfa/login-verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit:
        5,

      ttl:
        60000,
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

  // =========================================================
  // MFA RECOVERY CODE LOGIN
  // =========================================================

  @Post('mfa/recovery-login')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit:
        5,

      ttl:
        60000,
    },
  })
  recoveryLogin(
    @Body()
    dto: MfaRecoveryLoginDto,

    @Req()
    request: Request,
  ) {
    return this.authService
      .verifyMfaRecoveryLogin(
        dto.mfaToken,
        dto.recoveryCode,
        request.ip,
      );
  }

  // =========================================================
  // REFRESH
  // =========================================================

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({
    default: {
      limit:
        10,

      ttl:
        60000,
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

  // =========================================================
  // LOGOUT
  // =========================================================

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

  // =========================================================
  // CURRENT USER
  // =========================================================

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

  // =========================================================
  // MFA SETUP
  // =========================================================

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

  // =========================================================
  // VERIFY MFA SETUP
  // =========================================================

  @Post('mfa/verify-setup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @Throttle({
    default: {
      limit:
        5,

      ttl:
        60000,
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

  // =========================================================
  // REGENERATE RECOVERY CODES
  // =========================================================

  @Post(
    'mfa/recovery-codes/regenerate',
  )
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @Throttle({
    default: {
      limit:
        3,

      ttl:
        60000,
    },
  })
  regenerateRecoveryCodes(
    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: RegenerateRecoveryCodesDto,
  ) {
    return this.mfaService
      .regenerateRecoveryCodes(
        request.user.sub,
        dto.currentPassword,
        dto.code,
      );
  }

  // =========================================================
  // DISABLE MFA
  // =========================================================

  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @Throttle({
    default: {
      limit:
        3,

      ttl:
        60000,
    },
  })
  disableMfa(
    @Req()
    request: AuthenticatedRequest,

    @Body()
    dto: DisableMfaDto,
  ) {
    return this.mfaService.disable(
      request.user.sub,
      dto.currentPassword,
      dto.code,
    );
  }
}