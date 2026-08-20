import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import {
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module';
import { TransactionsModule } from './transactions/transactions.module';
import { FraudModule } from './fraud/fraud.module';
import { DevicesModule } from './devices/devices.module';
import { AdminModule } from './admin/admin.module';
import { FraudAlertsModule } from './fraud-alerts/fraud-alerts.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';


@Module({
  imports: [
    // Environment variables
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Global rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Database
    PrismaModule,

    // Application modules
    UsersModule,
    AuthModule,
    AccountsModule,
    BeneficiariesModule,
    TransactionsModule,
    FraudModule,
    DevicesModule,

    // Admin / RBAC module
    AdminModule,

    FraudAlertsModule,

    AuditLogsModule,
  ],

  controllers: [
    AppController,
  ],

  providers: [
    AppService,

    // Global rate-limit guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}