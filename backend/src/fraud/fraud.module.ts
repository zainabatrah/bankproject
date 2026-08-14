import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { FraudService } from './fraud.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 0,
    }),
  ],

  providers: [
    FraudService,
  ],

  exports: [
    FraudService,
  ],
})
export class FraudModule {}
