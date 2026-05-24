import {
  Logger,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Security & performance middleware
  app.use(helmet());
  app.use(compression());

  // CORS — configurable via env (comma-separated origins, or '*' for all)
  const corsOrigin = config.get<string>('CORS_ORIGIN', '*');
  const origin =
    corsOrigin === '*'
      ? true
      : corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);

  app.enableCors({
    origin,
    credentials: true,
  });

  // Global API prefix + URI versioning (default v1)
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Strict global validation — reject unknown properties, transform payloads
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Graceful shutdown — close DB connections, drain in-flight requests, etc.
  app.enableShutdownHooks();

  // OpenAPI / Swagger docs at /api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Hospital Information System API')
    .setDescription('HIS appointment booking — backend API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);

  logger.log(`API listening on http://localhost:${port}/api`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to bootstrap application', err);
  process.exit(1);
});
