/**
 * Centralised path catalogs so route strings live in exactly one place:
 *
 *  - `FE_PATH` — FE routes under `/[locale]` (the leading slash is the
 *    path WITHIN the locale segment — combine with `/${locale}` for full
 *    URLs).
 *  - `BE_PATH` — paths on the NestJS API (relative to the `/api/v1`
 *    version prefix in `api-internal.ts`). Mirrors the controller routes
 *    declared in `apps/api/src/auth/auth.controller.ts`.
 *
 * Routes referenced from multiple files (middleware, NextAuth pages
 * config, sign-out button, role dispatcher) MUST come from this catalog
 * — never duplicate the literal at the call site.
 */

export const FE_PATH = {
  HOME: "/",
  SIGNIN: "/signin",
  ADMIN: "/admin",
  STAFF: "/staff",
  DOCTOR_SCHEDULE: "/me/schedule",
} as const;

export type FePath = (typeof FE_PATH)[keyof typeof FE_PATH];

export const BE_PATH = {
  AUTH_RESOLVE: "/auth/resolve",
  AUTH_SIGN_OUT: "/auth/signout",
} as const;

export type BePath = (typeof BE_PATH)[keyof typeof BE_PATH];
