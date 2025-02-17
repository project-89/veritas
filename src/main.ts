import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "@/app.module";
import { ValidationPipe } from "@nestjs/common";
import { GlobalExceptionFilter } from "./filters/global-exception.filter";
import { LoggingService } from "./services/logging.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(LoggingService);
  app.useLogger(logger);

  // Enable validation pipes globally
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  );

  // Use global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Configure Swagger documentation
  const config = new DocumentBuilder()
    .setTitle("Veritas API")
    .setDescription("Truth Analysis System API")
    .setVersion("1.0")
    .addTag("content")
    .addTag("analysis")
    .addTag("sources")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);

  // Enable CORS for development
  app.enableCors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.info(`Application is running on: http://localhost:${port}`);
}

bootstrap();
