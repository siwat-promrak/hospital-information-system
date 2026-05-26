/**
 * Shared error infrastructure for every `lib/api/*.api.ts` module.
 *
 *   - `BackendErrorEnvelope` is the wire shape returned by the Nest API
 *     for every non-2xx response (`{ statusCode, code, message, details? }`).
 *   - `ApiError` is the typed exception thrown by `server-fetch.ts` when
 *     the BE returns a non-2xx response. Carries `status` + `code` so
 *     callers can branch (e.g. treat 404 as null without rethrowing).
 *   - `isApiError` / `hasCode` are narrowing helpers callers use instead
 *     of duck-typing `err.status`.
 */

export interface BackendErrorEnvelope {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly body: string;
  /**
   * Next.js `error.tsx` receives `{ error: { message, digest } }` across
   * the server→client boundary; custom Error properties (`status`,
   * `code`, …) DO NOT survive the bridge. We piggy-back on the `digest`
   * field — which IS preserved — so the global error boundary can
   * recover the HTTP status and render the right card (403 → forbidden,
   * 404 → not found, otherwise → generic error). The prefix
   * `API_ERROR_` makes the digest greppable in server logs.
   */
  readonly digest: string;

  constructor(status: number, code: string, message: string, body: string, details?: Record<string, unknown>) {
    super(`[${status} ${code}] ${message}`);
    // `Error.name` survives serialization, so callers (incl. `error.tsx`)
    // can detect an `ApiError` even without the prototype chain.
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
    this.details = details;
    this.digest = `API_ERROR_${status}_${code}`;
  }
}

/**
 * Parse a Next.js `error.digest` produced by the `ApiError` constructor
 * above. Returns `null` for digests that don't match the prefix (real
 * Next-generated digests, plain errors, etc.).
 *
 * Used by `(app)/error.tsx` — the digest is the only `ApiError` field
 * guaranteed to survive the server-component → client-boundary
 * serialization, so the boundary recovers `status` + `code` from it
 * instead of doing an `instanceof ApiError` check (which would fail
 * because the prototype is lost crossing the bridge).
 */
const API_ERROR_DIGEST_PREFIX = 'API_ERROR_';
const API_ERROR_DIGEST_PATTERN = /^API_ERROR_(\d+)_(.+)$/;

export interface ParsedApiErrorDigest {
  status: number;
  code: string;
}

export function parseApiErrorDigest(
  digest: string | undefined,
): ParsedApiErrorDigest | null {
  if (!digest || !digest.startsWith(API_ERROR_DIGEST_PREFIX)) {
    return null;
  }

  const match = API_ERROR_DIGEST_PATTERN.exec(digest);

  if (!match || match[1] === undefined || match[2] === undefined) {
    return null;
  }

  const status = Number.parseInt(match[1], 10);

  if (!Number.isFinite(status)) {
    return null;
  }

  return { status, code: match[2] };
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function hasCode(err: unknown, code: string): boolean {
  return isApiError(err) && err.code === code;
}

/**
 * Best-effort parse of a non-2xx response body into the shared envelope.
 * Returns `null` if the body is not JSON or doesn't match the shape.
 */
export async function readErrorEnvelope(
  response: Response,
): Promise<BackendErrorEnvelope | null> {
  try {
    const body = (await response.clone().json()) as Partial<BackendErrorEnvelope>;

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
