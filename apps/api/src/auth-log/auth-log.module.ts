import { Global, Module } from '@nestjs/common';

import { AuthLogService } from './auth-log.service';

/**
 * Global so any feature module (auth, future admin module) can inject
 * `AuthLogService` without re-importing this module. A single provider is
 * sufficient — the service is stateless.
 */
@Global()
@Module({
  providers: [AuthLogService],
  exports: [AuthLogService],
})
export class AuthLogModule {}
