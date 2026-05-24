import type { Request } from 'express';

import type { AuthLogContext } from './auth-log.types';

/**
 * Extract the forensic context (ip, user-agent, path, method) from an
 * Express request. Used by the controller and the PermissionsGuard so every
 * auth-log write carries the same shape of context.
 *
 * `X-Forwarded-For` is consulted first when present (the API runs behind
 * Next.js's rewrite proxy in dev / behind whatever LB in prod). The header
 * may carry a comma-separated chain — we take the left-most entry which is
 * the original client.
 */
export function buildAuthLogContext(request: Request): AuthLogContext {
  return {
    ip: readClientIp(request),
    userAgent: request.header('user-agent') ?? null,
    path: request.originalUrl ?? request.url ?? null,
    method: request.method ?? null,
  };
}

function readClientIp(request: Request): string | null {
  const forwarded = request.header('x-forwarded-for');

  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();

    if (first) {
      return first;
    }
  }

  return request.ip ?? null;
}
