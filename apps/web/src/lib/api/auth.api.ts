import "server-only";

import { BE_PATH } from "@/auth/routes";

import type { ResolveRequest, ResolveSuccess } from "@/types/auth.types";

import { internalFetch } from "./server-fetch";

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
