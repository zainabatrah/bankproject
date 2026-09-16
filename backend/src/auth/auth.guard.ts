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
  tokenVersion: number;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    let payload: AccessTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // MFA challenge tokens cannot access protected endpoints.
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }

    if (
      !Number.isInteger(payload.sub) ||
      payload.sub <= 0 ||
      !Number.isInteger(payload.tokenVersion)
    ) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        tokenVersion: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }

    if (user.status === 'LOCKED') {
      throw new UnauthorizedException('Account is locked');
    }

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Account is suspended');
    }

    if (user.role !== payload.role) {
      throw new UnauthorizedException(
        'User permissions changed. Please log in again',
      );
    }

    if (
      !Number.isInteger(payload.tokenVersion) ||
      payload.tokenVersion !== user.tokenVersion
    ) {
      throw new UnauthorizedException('Session has been revoked');
    }

    request['user'] = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authorization = request.headers.authorization;
    if (typeof authorization !== 'string') return undefined;

    const parts = authorization.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return undefined;
    }

    return parts[1] || undefined;
  }
}
