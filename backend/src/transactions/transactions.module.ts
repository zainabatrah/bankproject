import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { FraudModule } from '../fraud/fraud.module';
import { DevicesModule } from '../devices/devices.module';

import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [
    AuthModule,
    FraudModule,
    DevicesModule,
  ],

  controllers: [
    TransactionsController,
  ],

  providers: [
    TransactionsService,
  ],

  exports: [
    TransactionsService,
  ],
})
export class TransactionsModule {}