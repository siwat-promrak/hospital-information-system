import { jwtVerify } from 'jose';

import { SESSION_COOKIE_NAMES } from './auth.const';
import type { SessionTokenPayload } from './auth.types';

/**
 * Read the first defined session cookie from the raw `Cookie` header. Returns
 * `null` when no recognised cookie is present.
 *
 * Manual parsing keeps `cookie-parser` out of the dependency tree — the
 * header format we accept is the standard `name=value; name=value` joined by
 * `; `.
 */
export function readSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(';');

  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');

    if (eq === -1) {
      continue;
    }

    const name = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);

    if (SESSION_COOKIE_NAMES.includes(name)) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

/**
 * Read a `Bearer <token>` value from the Authorization header. Mirrors the
 * convention used by the API's e2e test helper and any non-browser callers.
 */
export function readBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

/**
 * Verify a session JWT against the shared NextAuth HS256 secret and return
 * the typed payload. Throws if the token is malformed, expired, has the
 * wrong algorithm, or is missing the required `userId` / `roleCode` claims.
 */
export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<SessionTokenPayload> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });

  if (typeof payload.userId !== 'string' || typeof payload.roleCode !== 'string') {
    throw new Error('Session token is missing userId / roleCode claims.');
  }

  if (typeof payload.sub !== 'string') {
    throw new Error('Session token is missing sub claim.');
  }

  return payload as SessionTokenPayload;
}
