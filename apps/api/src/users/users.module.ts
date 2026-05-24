import { Module } from '@nestjs/common';

import { UsersService } from './users.service';

/**
 * Owns lookup + minimal mutation of `User` rows used by the auth flow.
 * Exposes `UsersService` so AuthModule and (later) AdminModule can inject it
 * without needing direct Prisma access.
 */
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
