import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import {
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "@/auth/auth.const";
import type { ResolveSuccess } from "@/auth/auth.types";
import { OAUTH_PROVIDER } from "@/auth/oauth";
import { BE_PATH, FE_PATH } from "@/auth/routes";
import {
  SIGN_IN_ERROR,
  signInErrorFromBackendCode,
  type SignInErrorKey,
} from "@/auth/sign-in-errors";
import { internalFetch, readErrorEnvelope } from "@/lib/server/api-internal";

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

interface ResolveRequest {
  email: string;
  googleSub: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

type ResolveResult =
  | { kind: "ok"; payload: ResolveSuccess }
  | { kind: "error"; errorKey: SignInErrorKey };

async function resolveOnBackend(request: ResolveRequest): Promise<ResolveResult> {
  try {
    const response = await internalFetch(BE_PATH.AUTH_RESOLVE, {
      method: "POST",
      body: JSON.stringify(request),
    });

    if (response.ok) {
      const payload = (await response.json()) as ResolveSuccess;

      return { kind: "ok", payload };
    }

    const envelope = await readErrorEnvelope(response);

    return {
      kind: "error",
      errorKey: signInErrorFromBackendCode(envelope?.code),
    };
  } catch {
    return { kind: "error", errorKey: SIGN_IN_ERROR.INTERNAL };
  }
}
