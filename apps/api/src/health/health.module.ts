import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { ServiceHealthIndicator } from './indicators/service.health-indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [ServiceHealthIndicator],
})
export class HealthModule {}
