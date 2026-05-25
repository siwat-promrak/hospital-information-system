/**
 * Canonical error-code catalog for the shared error envelope
 * `{ statusCode, code, message, details? }`.
 *
 * Codes are stable strings consumed by the frontend (e.g. NextAuth signIn
 * callback maps `NOT_INVITED` → `/signin?error=not_invited`). Adding a new
 * code is a code change; removing one is a breaking contract change.
 *
 * Grouped by domain for readability — the runtime string is what callers
 * compare against.
 */
export const ErrorCode = {
  // Generic
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',

  // Auth / session
  AUTH_MISSING_TOKEN: 'AUTH_MISSING_TOKEN',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_INTERNAL_FORBIDDEN: 'AUTH_INTERNAL_FORBIDDEN',

  // Resolve flow
  EMAIL_UNVERIFIED: 'EMAIL_UNVERIFIED',
  NOT_INVITED: 'NOT_INVITED',
  USER_DISABLED: 'USER_DISABLED',

  // Authorization
  INSUFFICIENT_PERMISSION: 'INSUFFICIENT_PERMISSION',
  INSUFFICIENT_PERMISSION_SCOPE: 'INSUFFICIENT_PERMISSION_SCOPE',

  // Schedules (F06)
  SCHEDULE_NOT_FOUND: 'SCHEDULE_NOT_FOUND',
  SCHEDULE_OVERLAP: 'SCHEDULE_OVERLAP',
  SCHEDULE_START_IN_PAST: 'SCHEDULE_START_IN_PAST',
  DOCTOR_NOT_IN_DEPARTMENT: 'DOCTOR_NOT_IN_DEPARTMENT',
  DOCTOR_DEPARTMENT_MISMATCH: 'DOCTOR_DEPARTMENT_MISMATCH',

  // Slots (F07)
  DEPARTMENT_TYPE_NOT_ALLOWED: 'DEPARTMENT_TYPE_NOT_ALLOWED',

  // Medical records (F08)
  MEDICAL_RECORD_ALREADY_EXISTS: 'MEDICAL_RECORD_ALREADY_EXISTS',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Shape of every non-2xx response body. The global `HttpExceptionFilter`
 * coerces every thrown exception (including class-validator failures) into
 * this envelope.
 */
export interface ErrorEnvelope {
  statusCode: number;
  code: ErrorCodeValue | string;
  message: string;
  details?: Record<string, unknown>;
}
