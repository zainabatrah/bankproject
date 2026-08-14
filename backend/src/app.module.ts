import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AccountsModule } from './accounts/accounts.module';
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module';
import { TransactionsModule } from './transactions/transactions.module';
import { FraudModule } from './fraud/fraud.module';
import { DevicesModule } from './devices/devices.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    AccountsModule,
    BeneficiariesModule,
    TransactionsModule,
    FraudModule,
    DevicesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}