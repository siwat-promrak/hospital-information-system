import "server-only";

import { BE_PATH } from "@/auth/routes";

import type {
  MeResponse,
  ResolveRequest,
  ResolveSuccess,
} from "@/types/auth.types";

import { internalFetch, userFetch } from "./server-fetch";

/**
 * `POST /auth/resolve` — server-to-server resolve used by NextAuth's
 * `signIn` callback. Returns the typed `ResolveSuccess` payload and
 * throws `ApiError` on any non-2xx so the callback can map the BE error
 * code into a sign-in error key.
 */
export function resolveOnBackend(
  request: ResolveRequest,
): Promise<ResolveSuccess> {
  return internalFetch<ResolveSuccess>(BE_PATH.AUTH_RESOLVE, {
    method: "POST",
    body: request,
  });
}

/**
 * `GET /me` — fetches the caller's authenticated identity, including the
 * thin `doctor` reference for DOCTOR users (used by the unified
 * `/schedules` page to drive the "Show mine" toggle).
 *
 * Server-side only — forwards the session cookie via `userFetch` so the
 * BE's `JwtGuard` resolves the same identity the FE already trusted.
 */
export function getMe(): Promise<MeResponse> {
  return userFetch<MeResponse>(BE_PATH.ME);
}
