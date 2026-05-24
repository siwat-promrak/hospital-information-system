import { SetMetadata } from '@nestjs/common';

/**
 * Key consumed by `JwtGuard` to skip session verification on a route.
 * Public routes are reserved for liveness checks and the auth-resolve
 * endpoint (which uses `InternalSecretGuard` instead).
 */
export const PUBLIC_ROUTE_KEY = 'auth:public';

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLIC_ROUTE_KEY, true);
