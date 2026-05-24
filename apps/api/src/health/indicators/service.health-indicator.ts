import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';

/**
 * Minimal placeholder indicator that always reports the API process itself
 * as "up". Future indicators (database, cache, message broker) should follow
 * the same shape and live alongside this file.
 */
@Injectable()
export class ServiceHealthIndicator extends HealthIndicator {
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const isHealthy = true;
    const result = this.getStatus(key, isHealthy);

    if (!isHealthy) {
      throw new HealthCheckError('Service check failed', result);
    }

    return result;
  }
}
