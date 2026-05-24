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

  constructor(status: number, code: string, message: string, body: string, details?: Record<string, unknown>) {
    super(`[${status} ${code}] ${message}`);
    this.status = status;
    this.code = code;
    this.body = body;
    this.details = details;
  }
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
