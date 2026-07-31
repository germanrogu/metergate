import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupBodyParsers } from './setup-body-parsers';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  setupBodyParsers(app);

  const port = process.env['PORT'] ? Number(process.env['PORT']) : 3000;
  await app.listen(port);
}

bootstrap();
