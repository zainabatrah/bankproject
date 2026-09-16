import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './app-setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  configureApp(app);

  const configService = app.get(ConfigService);
  await app.listen(configService.get<number>('PORT', 3000));
}

bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error('Failed to start BankShield backend', error);
  process.exitCode = 1;
});
