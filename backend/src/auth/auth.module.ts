import { Module } from '@nestjs/common';

import { JwtModule } from '@nestjs/jwt';

import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';

import { UsersModule } from '../users/users.module';
import { DevicesModule } from '../devices/devices.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [
    UsersModule,
    DevicesModule,

    JwtModule.registerAsync({
      imports: [
        ConfigModule,
      ],

      inject: [
        ConfigService,
      ],

      useFactory: (
        configService: ConfigService,
      ) => ({
        secret:
          configService.getOrThrow<string>(
            'JWT_SECRET',
          ),

        signOptions: {
          expiresIn: 900,
        },
      }),
    }),
  ],

  controllers: [
    AuthController,
  ],

  providers: [
    AuthService,
    AuthGuard,
  ],

  exports: [
    AuthService,
    AuthGuard,
    JwtModule,
  ],
})
export class AuthModule {}