import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { DevicesService } from '../devices/devices.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly devicesService: DevicesService,
  ) {}

  async register(
    registerDto: RegisterDto,
  ) {
    const email =
      registerDto.email.trim().toLowerCase();

    const existingUser =
      await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists',
      );
    }

    const passwordHash =
      await bcrypt.hash(
        registerDto.password,
        12,
      );

    const user =
      await this.usersService.create({
        email,

        firstName:
          registerDto.firstName.trim(),

        lastName:
          registerDto.lastName.trim(),

        passwordHash,
      });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  async login(
    loginDto: LoginDto,
    deviceId: string,
    userAgent?: string,
  ) {
    const email =
      loginDto.email.trim().toLowerCase();

    const user =
      await this.usersService.findByEmail(
        email,
      );

    if (!user) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    const passwordMatches =
      await bcrypt.compare(
        loginDto.password,
        user.passwordHash,
      );

    if (!passwordMatches) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        'Account is not active',
      );
    }

    // Register / update device
    const deviceResult =
      await this.devicesService.registerDevice(
        user.id,
        deviceId,
        userAgent,
      );

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken =
      await this.jwtService.signAsync(
        payload,
      );

    return {
      accessToken,

      newDevice:
        deviceResult.isNewDevice,

      device: {
        id:
          deviceResult.device.id,

        deviceId:
          deviceResult.device.deviceId,

        browser:
          deviceResult.device.browser,

        os:
          deviceResult.device.os,

        trusted:
          deviceResult.device.trusted,

        firstSeen:
          deviceResult.device.firstSeen,

        lastSeen:
          deviceResult.device.lastSeen,
      },

      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
    };
  }
}