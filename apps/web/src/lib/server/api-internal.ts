import "server-only";

import { API_VERSION_PREFIX, INTERNAL_SECRET_HEADER } from "@/auth/auth.const";
import type { BackendErrorEnvelope } from "@/auth/auth.types";

/**
 * Server-side fetch helper for internal calls from the Next.js server to
 * the NestJS API (currently only `POST /auth/resolve` from the NextAuth
 * `signIn` callback).
 *
 * Adds the shared `X-Internal-Secret` header so the BE's
 * `InternalSecretGuard` accepts the call. The browser MUST NOT use this
 * helper — `server-only` guards against accidental client imports.
 */
export async function internalFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = process.env.BACKEND_INTERNAL_URL;
  const secret = process.env.INTERNAL_API_SECRET;

  if (!base) {
    throw new Error("BACKEND_INTERNAL_URL is not configured.");
  }

  if (!secret) {
    throw new Error("INTERNAL_API_SECRET is not configured.");
  }

  return fetch(`${base}${API_VERSION_PREFIX}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      [INTERNAL_SECRET_HEADER]: secret,
    },
    // Internal calls never need cookies (server-to-server).
    cache: "no-store",
  });
}

/**
 * Best-effort parse of a non-2xx response body into the shared envelope.
 * Returns `null` if the body is not JSON or doesn't match the shape.
 */
export async function readErrorEnvelope(
  response: Response,
): Promise<BackendErrorEnvelope | null> {
  try {
    const body = (await response.json()) as Partial<BackendErrorEnvelope>;

    if (
      typeof body.statusCode === "number" &&
      typeof body.code === "string" &&
      typeof body.message === "string"
    ) {
      return body as BackendErrorEnvelope;
    }

    return null;
  } catch {
    return null;
  }
}
