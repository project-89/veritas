// Load environment variables
import * as dotenv from 'dotenv';

dotenv.config();

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { parseCorsOrigins, validateEnv } from './app/config/validate-env';
import { GlobalExceptionFilter } from './filters/global-exception.filter';

// Catch unhandled errors so we can see what's killing the process
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Fail fast on unsafe configuration before any service spins up
  validateEnv();

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
    bodyParser: false, // Disable built-in (100KB limit) — we register our own below with 50MB limit
  });

  // Enable validation pipes globally
  // biome-ignore lint/correctness/useHookAtTopLevel: Nest application bootstrap API, not a React hook.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Use global exception filter
  // biome-ignore lint/correctness/useHookAtTopLevel: Nest application bootstrap API, not a React hook.
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Register body parser with generous limit — analysis cache payloads can be large
  const expressApp = app.getHttpAdapter().getInstance();
  const bodyParser = require('body-parser');
  expressApp.use(bodyParser.json({ limit: '50mb' }));
  expressApp.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

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

  // CORS: explicit origin list only. validateEnv() guarantees CORS_ORIGIN is
  // set in production; in dev we default to the local client + API origins.
  // (Wildcard + credentials is both invalid per the fetch spec and unsafe.)
  const corsOrigins = parseCorsOrigins();
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : ['http://localhost:4200', 'http://localhost:3000'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  logger.log(`Veritas API running on http://${host}:${port}`);
  logger.log(`Swagger docs at http://${host}:${port}/api`);
}

bootstrap();
