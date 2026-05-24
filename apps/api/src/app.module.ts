import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { AuthModule } from './auth/auth.module';
import { InternalSecretGuard } from './auth/guards/internal-secret.guard';
import { JwtGuard } from './auth/guards/jwt.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // Guard execution order is the registration order below: internal secret
    // first (so resolve never falls through to JWT), then JWT, then per-route
    // permission check.
    { provide: APP_GUARD, useClass: InternalSecretGuard },
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
