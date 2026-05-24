import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Global Prisma module.
 *
 * Marked `@Global()` so feature modules can inject `PrismaService` without
 * re-importing this module. There is exactly one `PrismaService` provider
 * for the whole app, which keeps the underlying connection pool singular.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
