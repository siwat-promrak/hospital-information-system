import {
  Controller,
  Get,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
} from '@nestjs/terminus';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';

import { ApiHealthCheck } from './health.swagger';
import { ServiceHealthIndicator } from './indicators/service.health-indicator';

@ApiTags('health')
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly serviceIndicator: ServiceHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiHealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.serviceIndicator.isHealthy('service'),
    ]);
  }
}
