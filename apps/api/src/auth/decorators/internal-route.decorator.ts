import { SetMetadata } from '@nestjs/common';

/**
 * Marks an endpoint as internal — `JwtGuard` skips it (no session cookie is
 * expected) and `InternalSecretGuard` verifies the shared
 * `X-Internal-Secret` header instead.
 */
export const INTERNAL_ROUTE_KEY = 'auth:internal';

export const InternalRoute = (): MethodDecorator & ClassDecorator =>
  SetMetadata(INTERNAL_ROUTE_KEY, true);
