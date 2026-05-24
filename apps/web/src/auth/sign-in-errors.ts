/**
 * Stable error keys appended to `/[locale]/signin?error=<key>` when sign-in
 * fails. Each maps to a localised message via the `SignIn.errors.<key>`
 * message namespace.
 *
 * Keys are intentionally lowercase + snake-friendly so they look natural
 * in the URL.
 */

export const SIGN_IN_ERROR = {
  EMAIL_UNVERIFIED: "email_unverified",
  NOT_INVITED: "not_invited",
  USER_DISABLED: "user_disabled",
  INTERNAL: "internal",
} as const;

export type SignInErrorKey = (typeof SIGN_IN_ERROR)[keyof typeof SIGN_IN_ERROR];

/**
 * Map the BE `ErrorCode` returned by `POST /auth/resolve` to the
 * URL-friendly key consumed by the signin page. Anything unknown collapses
 * to `INTERNAL` so users never see a raw backend code.
 */
export function signInErrorFromBackendCode(code: string | undefined): SignInErrorKey {
  switch (code) {
    case "EMAIL_UNVERIFIED":
      return SIGN_IN_ERROR.EMAIL_UNVERIFIED;
    case "NOT_INVITED":
      return SIGN_IN_ERROR.NOT_INVITED;
    case "USER_DISABLED":
      return SIGN_IN_ERROR.USER_DISABLED;
    default:
      return SIGN_IN_ERROR.INTERNAL;
  }
}

/**
 * Guard for parsing the `?error=...` query-string value coming back from
 * NextAuth's signIn redirect.
 */
export function isSignInErrorKey(value: unknown): value is SignInErrorKey {
  return (
    typeof value === "string" &&
    (Object.values(SIGN_IN_ERROR) as string[]).includes(value)
  );
}
