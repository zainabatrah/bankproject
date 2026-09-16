import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SecurityEventsController } from './security-events.controller';
import { SecurityEventsService } from './security-events.service';

@Module({
  imports: [AuthModule],
  controllers: [SecurityEventsController],
  providers: [SecurityEventsService],
  exports: [SecurityEventsService],
})
export class SecurityEventsModule {}
