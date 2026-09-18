import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { FraudAlertsModule } from '../fraud-alerts/fraud-alerts.module';
import { SocController } from './soc.controller';
import { SocService } from './soc.service';

@Module({
  imports: [HttpModule, AuthModule, AuditLogsModule, FraudAlertsModule],
  controllers: [SocController],
  providers: [SocService],
})
export class SocModule {}
