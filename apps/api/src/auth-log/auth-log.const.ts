import { AuthLogEvent as PrismaAuthLogEvent } from '@prisma/client';

/**
 * TypeScript-side handle for the `AuthLogEvent` Prisma enum. Imported by
 * services so call sites read as `AUTH_LOG_EVENT.SIGN_IN_SUCCESS` instead
 * of the raw Prisma enum name (CLAUDE.md §2a).
 */
export const AUTH_LOG_EVENT = {
  SIGN_IN_SUCCESS: PrismaAuthLogEvent.SIGN_IN_SUCCESS,
  SIGN_IN_FAILED: PrismaAuthLogEvent.SIGN_IN_FAILED,
  PERMISSION_DENIED: PrismaAuthLogEvent.PERMISSION_DENIED,
  SIGN_OUT: PrismaAuthLogEvent.SIGN_OUT,
} as const;

export type AuthLogEventValue = (typeof AUTH_LOG_EVENT)[keyof typeof AUTH_LOG_EVENT];

/**
 * Hard ceilings for the optional forensic columns. Values longer than the
 * limit are truncated before insert — auth-log writes are fire-and-forget
 * and must not fail an otherwise-successful response.
 */
export const AUTH_LOG_MAX = {
  PATH: 512,
  METHOD: 16,
  IP: 45, // longest IPv6 incl. zone id is ~45 chars
  USER_AGENT: 512,
} as const;
