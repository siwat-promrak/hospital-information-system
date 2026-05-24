import "server-only";

import { headers as nextHeaders } from "next/headers";

import {
  API_VERSION_PREFIX,
  INTERNAL_SECRET_HEADER,
} from "@/auth/auth.const";

import { ApiError, readErrorEnvelope } from "./errors";

/**
 * Two fetch helpers for server-side calls to the NestJS API. Both prepend
 * `${BACKEND_INTERNAL_URL}${API_VERSION_PREFIX}` to the path and convert
 * any non-2xx response into an `ApiError` so callers can do flat,
 * promise-style code instead of branching on `response.ok` themselves.
 *
 * Use the one that matches the route's authorization model:
 *
 *  - `internalFetch` — server-to-server with the shared
 *    `X-Internal-Secret` header, NO user cookie. For routes decorated
 *    with `@InternalRoute()` (currently only `POST /auth/resolve`).
 *  - `userFetch` — server-to-server on behalf of the signed-in user.
 *    Forwards the incoming request's `cookie` + `authorization` headers
 *    so `JwtGuard` + `PermissionsGuard` can authorise the call as the
 *    caller. For every cookie-authenticated endpoint (departments,
 *    doctors, schedules, …).
 *
 * Both throw `ApiError` (with a typed `status` + `code`) on non-2xx —
 * callers narrow with `isApiError` / `hasCode` from `./errors`.
 */

const FORWARDABLE_HEADERS = ["cookie", "authorization"] as const;

interface FetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /**
   * Override the default cache policy. Auth + directory calls pass
   * `"no-store"` because they're per-request and per-user. Catalog-style
   * lookups that are safe to dedupe across a render can override.
   */
  cache?: RequestCache;
}

export async function internalFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const secret = process.env.INTERNAL_API_SECRET;

  if (!secret) {
    throw new Error("INTERNAL_API_SECRET is not configured.");
  }

  const headers = new Headers({
    "Content-Type": "application/json",
    [INTERNAL_SECRET_HEADER]: secret,
  });

  return request<T>(path, headers, options);
}

export async function userFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const incoming = await nextHeaders();
  const headers = new Headers({ "Content-Type": "application/json" });

  for (const name of FORWARDABLE_HEADERS) {
    const value = incoming.get(name);

    if (value) {
      headers.set(name, value);
    }
  }

  return request<T>(path, headers, options);
}

async function request<T>(
  path: string,
  headers: Headers,
  options: FetchOptions,
): Promise<T> {
  const base = process.env.BACKEND_INTERNAL_URL;

  if (!base) {
    throw new Error("BACKEND_INTERNAL_URL is not configured.");
  }

  const response = await fetch(`${base}${API_VERSION_PREFIX}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: options.cache ?? "no-store",
  });

  if (!response.ok) {
    const envelope = await readErrorEnvelope(response);
    const body = envelope ? JSON.stringify(envelope) : await response.text();

    throw new ApiError(
      response.status,
      envelope?.code ?? "UNKNOWN_ERROR",
      envelope?.message ?? `Request failed with status ${response.status}`,
      body,
      envelope?.details,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
