import { SignJWT, jwtVerify } from "jose";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import {
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "@/auth/auth.const";
import { OAUTH_PROVIDER } from "@/auth/oauth";
import { FE_PATH } from "@/auth/routes";
import {
  SIGN_IN_ERROR,
  signInErrorFromBackendCode,
  type SignInErrorKey,
} from "@/auth/sign-in-errors";
import { resolveOnBackend as resolveOnBackendApi } from "@/lib/api/auth.api";
import type {
  ResolveRequest,
  ResolveSuccess,
} from "@/types/auth.types";
import { isApiError } from "@/lib/api/errors";

const JWT_ALG = "HS256";

/**
 * Coerce NextAuth's `secret` parameter (`string | string[]`) into the bytes
 * jose expects. The first element wins on rotation so encode + decode pick
 * the same key.
 */
function encodeSecret(secret: string | string[] | undefined): Uint8Array {
  const raw = Array.isArray(secret) ? secret[0] : secret;

  if (!raw) {
    throw new Error("NEXTAUTH_SECRET is not configured.");
  }

  return new TextEncoder().encode(raw);
}

/**
 * NextAuth v5 configuration.
 *
 * Session strategy is JWT (HS256) so the cookie travels straight through
 * the `/api/be/*` rewrite to the NestJS API, where `JwtGuard` verifies the
 * same `NEXTAUTH_SECRET`. There is no DB adapter on the FE — the BE owns
 * the User table.
 *
 * Sliding-window renewal: `maxAge` is the hard ceiling; `updateAge` is
 * how often an active session re-issues the cookie. See US-2.6 + the
 * Session renewal model convention in `docs/user-stories.md`. There is
 * no custom refresh-token table — NextAuth handles renewal natively.
 */
export const { auth, handlers, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  /**
   * Override Auth.js v5's default JWE (encrypted) session token with a
   * standard HS256-signed JWT. The Nest API's `JwtGuard` verifies the
   * cookie with `jose.jwtVerify(..., { algorithms: ['HS256'] })` — it has
   * always been built for signed tokens. Keeping NextAuth on its JWE
   * default produced `AUTH_INVALID_TOKEN` the first time a real cookie
   * reached the BE (F05 directory endpoints).
   *
   * The `secret` here is whatever NextAuth passes in — accept the broader
   * `string | string[]` shape (rotation list) and pick the first key.
   *
   * TODO(FU-01, see docs/follow-ups.md): drop this override and migrate
   * the BE to decrypt JWE so cookie claims are no longer plaintext.
   */
  jwt: {
    async encode({ token, secret, maxAge }) {
      const key = encodeSecret(secret);
      const now = Math.floor(Date.now() / 1000);
      const ttl = maxAge ?? SESSION_MAX_AGE_SECONDS;

      return await new SignJWT({ ...(token ?? {}) })
        .setProtectedHeader({ alg: JWT_ALG })
        .setIssuedAt(now)
        .setExpirationTime(now + ttl)
        .sign(key);
    },
    async decode({ token, secret }) {
      if (!token) {
        return null;
      }

      const key = encodeSecret(secret);

      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: [JWT_ALG],
        });

        return payload;
      } catch {
        return null;
      }
    },
  },
  pages: {
    // NextAuth uses this for built-in redirects (e.g. when no session is
    // present at an explicit `signIn()` call). The middleware adds the
    // locale prefix to redirects it produces itself.
    signIn: FE_PATH.SIGNIN,
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // Surface `email_verified` so the signIn callback can inspect it.
      profile(profile) {
        return {
          id: profile.sub,
          email: profile.email,
          name: profile.name,
          image: profile.picture ?? null,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * Runs after Google returns the OAuth profile. Verifies the email is
     * Google-verified and calls `POST /auth/resolve` on the API to map the
     * profile to an internal user + permission set. On success, mutates
     * `user` so the `jwt` callback (next in the chain) can copy fields
     * into the token. On failure, returns a redirect URL of the form
     * `/signin?error=<key>` — the middleware adds the locale prefix.
     */
    async signIn({ user, account, profile }) {
      if (account?.provider !== OAUTH_PROVIDER.GOOGLE || !profile?.email) {
        return errorRedirect(SIGN_IN_ERROR.INTERNAL);
      }

      if (profile.email_verified === false) {
        return errorRedirect(SIGN_IN_ERROR.EMAIL_UNVERIFIED);
      }

      const sub = (profile.sub ?? account.providerAccountId) as string | undefined;

      if (!sub) {
        return errorRedirect(SIGN_IN_ERROR.INTERNAL);
      }

      const resolved = await resolveOnBackend({
        email: profile.email,
        googleSub: sub,
        emailVerified: profile.email_verified ?? false,
        name: profile.name ?? user.name ?? "",
        picture: (profile.picture as string | null | undefined) ?? null,
      });

      if (resolved.kind === "error") {
        return errorRedirect(resolved.errorKey);
      }

      // Mutate the in-flight user so the `jwt` callback picks up the
      // resolved data. NextAuth normally treats `user.id` as the JWT
      // `sub` claim; overriding it with our internal user id keeps the
      // FE / BE JWT shapes aligned.
      user.id = resolved.payload.userId;
      user.userId = resolved.payload.userId;
      user.roleCode = resolved.payload.roleCode;
      user.permissionCodes = resolved.payload.permissionCodes;

      return true;
    },

    /**
     * Copy the resolved identity + permission codes onto the token on
     * first sign-in. On subsequent calls (refresh / silent renewal) the
     * `user` parameter is undefined and the existing token is returned
     * verbatim — permissions are NOT re-fetched here; the BE re-reads
     * them per request via `PermissionsGuard`.
     */
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.userId;
        token.roleCode = user.roleCode;
        token.permissionCodes = user.permissionCodes;
      }

      return token;
    },

    /**
     * Surface the BE-issued identity on the session object so server
     * components can read it without parsing the JWT.
     */
    async session({ session, token }) {
      if (token.userId && token.roleCode) {
        session.user.userId = token.userId;
        session.user.roleCode = token.roleCode;
        session.user.permissionCodes = token.permissionCodes ?? [];
      }

      return session;
    },
  },
});

function errorRedirect(key: SignInErrorKey): string {
  return `${FE_PATH.SIGNIN}?error=${key}`;
}

type ResolveResult =
  | { kind: "ok"; payload: ResolveSuccess }
  | { kind: "error"; errorKey: SignInErrorKey };

/**
 * Thin wrapper around `resolveOnBackend` that converts `ApiError` (thrown
 * by the shared `userFetch` / `internalFetch` helpers) into a tagged
 * union the `signIn` callback can branch on. Network / non-API errors
 * fall through to `INTERNAL` so the user sees the generic sign-in error.
 */
async function resolveOnBackend(request: ResolveRequest): Promise<ResolveResult> {
  try {
    const payload = await resolveOnBackendApi(request);

    return { kind: "ok", payload };
  } catch (err) {
    if (isApiError(err)) {
      return { kind: "error", errorKey: signInErrorFromBackendCode(err.code) };
    }

    return { kind: "error", errorKey: SIGN_IN_ERROR.INTERNAL };
  }
}
