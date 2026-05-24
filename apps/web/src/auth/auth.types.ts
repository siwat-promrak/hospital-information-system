import type { RoleCode } from "./roles";

/**
 * Successful `POST /auth/resolve` payload (mirrors `ResolveResponseDto` on
 * the BE). The FE writes `userId` / `roleCode` / `permissionCodes` into the
 * session JWT so server components can read them without a per-request
 * backend round-trip.
 */
export interface ResolveSuccess {
  userId: string;
  roleCode: RoleCode | string;
  permissionCodes: string[];
}

/**
 * Error envelope returned by the BE for non-2xx responses
 * (`{ statusCode, code, message, details? }`). Captured here only to
 * extract the stable `code` for sign-in error mapping.
 */
export interface BackendErrorEnvelope {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
