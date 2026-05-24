import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Global Prisma client.
 *
 * - Connects eagerly in `onModuleInit` so the first request never pays the
 *   handshake cost.
 * - Disconnection on shutdown is handled by Nest's `enableShutdownHooks()`
 *   in `main.ts` (via `PrismaClient`'s built-in `process.beforeExit` hook),
 *   so we do NOT implement `OnModuleDestroy` here — that pattern is
 *   discouraged in Prisma 5+ because it interferes with Nest's own shutdown
 *   sequencing.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();

    this.logger.log('Prisma connected');
  }
}
