import { applyDecorators } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';

const HEALTHY_EXAMPLE = {
  status: 'ok',
  info: { service: { status: 'up' } },
  error: {},
  details: { service: { status: 'up' } },
} as const;

const UNHEALTHY_EXAMPLE = {
  status: 'error',
  info: {},
  error: { service: { status: 'down' } },
  details: { service: { status: 'down' } },
} as const;

/**
 * Composite OpenAPI decorator for the health-check endpoint. Aggregates the
 * operation summary plus the 200 / 503 response schemas (with example payloads)
 * so the controller method itself only carries HTTP + Terminus decorators.
 */
export function ApiHealthCheck(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiOperation({ summary: 'Liveness/readiness health check' }),
    ApiOkResponse({
      description: 'Service is healthy',
      schema: { example: HEALTHY_EXAMPLE },
    }),
    ApiServiceUnavailableResponse({
      description: 'One or more health indicators reported failure',
      schema: { example: UNHEALTHY_EXAMPLE },
    }),
  );
}
