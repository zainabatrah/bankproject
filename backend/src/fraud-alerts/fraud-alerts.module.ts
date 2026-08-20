import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

import { FraudAlertsController } from './fraud-alerts.controller';
import { FraudAlertsService } from './fraud-alerts.service';

@Module({
  imports: [
    AuthModule,
    AuditLogsModule,
  ],

  controllers: [
    FraudAlertsController,
  ],

  providers: [
    FraudAlertsService,
  ],

  exports: [
    FraudAlertsService,
  ],
})
export class FraudAlertsModule {}