import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InternalSecretGuard } from './guards/internal-secret.guard';
import { JwtGuard } from './guards/jwt.guard';
import { PermissionsGuard } from './guards/permissions.guard';

/**
 * Owns the resolve endpoint, the `/me` probe, and the three guards
 * (`InternalSecretGuard`, `JwtGuard`, `PermissionsGuard`). The guards are
 * registered as APP_GUARD providers in `AppModule` so every endpoint is
 * protected by default; routes opt out via `@Public()` or `@InternalRoute()`.
 */
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, InternalSecretGuard, JwtGuard, PermissionsGuard],
  exports: [InternalSecretGuard, JwtGuard, PermissionsGuard],
})
export class AuthModule {}
