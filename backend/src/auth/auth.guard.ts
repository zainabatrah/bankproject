import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import type { Request } from 'express';

import { PrismaService } from '../prisma/prisma.service';

interface AccessTokenPayload {
  sub: number;
  email: string;
  role: string;
  type: string;
}

@Injectable()
export class AuthGuard
  implements CanActivate
{
  constructor(
    private readonly jwtService:
      JwtService,

    private readonly prisma:
      PrismaService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request =
      context
        .switchToHttp()
        .getRequest<Request>();

    const token =
      this.extractTokenFromHeader(
        request,
      );

    if (!token) {
      throw new UnauthorizedException(
        'Authentication required',
      );
    }

    let payload:
      AccessTokenPayload;

    try {
      payload =
        await this.jwtService
          .verifyAsync<AccessTokenPayload>(
            token,
          );
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired token',
      );
    }

    // ========================================
    // BLOCK MFA CHALLENGE TOKENS
    // ========================================

    if (
      payload.type !== 'access'
    ) {
      throw new UnauthorizedException(
        'Invalid access token',
      );
    }

    if (
      !payload.sub ||
      typeof payload.sub !==
        'number'
    ) {
      throw new UnauthorizedException(
        'Invalid token payload',
      );
    }

    const user =
      await this.prisma.user.findUnique({
        where: {
          id: payload.sub,
        },

        select: {
          id: true,
          email: true,
          role: true,
          status: true,
        },
      });

    if (!user) {
      throw new UnauthorizedException(
        'User account no longer exists',
      );
    }

    if (user.status === 'LOCKED') {
      throw new UnauthorizedException(
        'Account is locked',
      );
    }

    if (
      user.status === 'SUSPENDED'
    ) {
      throw new UnauthorizedException(
        'Account is suspended',
      );
    }

    if (
      user.role !== payload.role
    ) {
      throw new UnauthorizedException(
        'User permissions changed. Please log in again',
      );
    }

    request['user'] = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return true;
  }

  private extractTokenFromHeader(
    request: Request,
  ): string | undefined {
    const [type, token] =
      request.headers.authorization
        ?.split(' ') ?? [];

    return type === 'Bearer'
      ? token
      : undefined;
  }
}