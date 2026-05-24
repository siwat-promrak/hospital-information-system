import type { AuthLogEventValue } from './auth-log.const';

/**
 * Forensic context attached to every auth-log write. Captured at the
 * controller / guard boundary (the layer that owns the Express request).
 */
export interface AuthLogContext {
  ip: string | null;
  userAgent: string | null;
  path: string | null;
  method: string | null;
}

/**
 * Full row payload accepted by `AuthLogService.record()`. Convenience
 * wrappers (logSignInSuccess / logSignInFailure / logPermissionDenied /
 * logSignOut) fill the type-specific fields for callers.
 */
export interface AuthLogPayload extends AuthLogContext {
  event: AuthLogEventValue;
  userId: string | null;
  email: string | null;
  reason: string | null;
  requiredPermissions: string[];
  heldPermissions: string[];
}
