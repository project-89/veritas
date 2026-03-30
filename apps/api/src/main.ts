// Load environment variables
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { GlobalExceptionFilter } from './filters/global-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // Enable validation pipes globally
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Use global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Configure Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Veritas API')
    .setDescription('Truth Analysis System API')
    .setVersion('1.0')
    .addTag('content')
    .addTag('analysis')
    .addTag('ingestion')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Enable CORS for development
  app.enableCors({
    origin: process.env['CORS_ORIGIN'] || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const port = process.env['PORT'] || 3000;
  const host = process.env['HOST'] || '0.0.0.0';
  await app.listen(port, host);
  logger.log(`Veritas API running on http://${host}:${port}`);
  logger.log(`Swagger docs at http://${host}:${port}/api`);
}

bootstrap();
