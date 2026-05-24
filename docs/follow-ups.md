# Hospital Information System — Follow-ups

Known technical debt and deferred work. Each entry explains **what**, **why
it was deferred**, and **what landing it actually requires**, so a future
session can pick the work up cold.

---

## FU-01 — Migrate session token from HS256 → JWE (Auth.js v5 default)

**Status:** open. Tracked from the F05 work on `feat/directory`.

**What:** Today `apps/web/src/auth.ts` overrides Auth.js's `jwt.encode` /
`jwt.decode` to mint and verify **HS256-signed JWTs** (JWS). Auth.js v5's
own default is **encrypted JWE** (`alg: dir`, `enc: A256CBC-HS512`). We
should drop the override and align the Nest BE on JWE so cookie claims
(userId, roleCode, permissionCodes) are no longer plaintext.

**Why it was deferred:**

- The Nest BE was originally built around HS256. `JwtGuard` uses
  `jose.jwtVerify(token, key, { algorithms: ['HS256'] })`, the e2e helper
  (`apps/api/test/utils/sign-jwt.ts`) mints HS256, and
  `apps/api/src/auth/session-token.spec.ts` asserts HS256 behaviour. The
  mismatch with Auth.js's JWE default went undetected because no real
  cookie-based protected endpoint had ever been called (resolve is
  internal-route, signout's BE failure was swallowed FE-side, /me was only
  ever called by tests via Bearer HS256). F05 was the first FE → BE
  protected call and surfaced it as `AUTH_INVALID_TOKEN`.
- Fastest unblock for F05 was option B (force the FE to HS256) — one file
  change, no BE/test rewrites. The proper alignment with Auth.js's default
  (option A) is this follow-up.

**Trade-off being accepted right now:**

- Cookie tokens are signed but not encrypted. Anyone who exfiltrates the
  cookie can decode the payload and read identity + permission codes.
  Acceptable for the take-home review surface; not acceptable for prod.

**What landing this requires:**

1. **BE:** swap `verifySessionToken` to use `jose.jwtDecrypt` with the
   HKDF-derived key Auth.js uses:
   - `info = "Auth.js Generated Encryption Key (${salt})"`
   - `length = 64` bytes (A256CBC-HS512)
   - `salt = <cookie-name>` (e.g. `authjs.session-token` in dev,
     `__Secure-authjs.session-token` in prod)
   - Implement HKDF via `node:crypto`'s `hkdfSync('sha256', secret,
     salt, info, 64)`.
2. **BE:** `readSessionCookie` must return both the token **and** the
   matched cookie name (so the caller can derive the right key). Today it
   returns only the token.
3. **BE tests:**
   - `session-token.spec.ts`: replace the HS256 mint helper with a JWE
     mint helper (same HKDF derivation).
   - `apps/api/test/utils/sign-jwt.ts` → rename to `mint-session-jwe.ts`
     and produce JWE; e2e tests pick it up automatically.
4. **FE:** remove the `jwt: { encode, decode }` override from
   `apps/web/src/auth.ts`. Drop the `jose` dependency from
   `apps/web/package.json` if nothing else needs it.
5. **Manual smoke test:** sign out + sign in, click Departments, confirm
   200. Decode the cookie with `jwt.io` or `jose decrypt` and verify it
   is NOT a 3-part JWS.

**Files in scope:**

- `apps/api/src/auth/session-token.ts` — verifier + cookie reader
- `apps/api/src/auth/session-token.spec.ts` — unit coverage
- `apps/api/test/utils/sign-jwt.ts` — e2e helper
- `apps/api/test/auth.e2e-spec.ts` — uses the helper
- `apps/web/src/auth.ts` — remove HS256 override
- `apps/web/package.json` — drop `jose` if unused

**Linked artefacts:**

- Bug that surfaced this: F05 first request to `GET /departments`
  returned `401 AUTH_INVALID_TOKEN`.
- Workaround commit: F05 branch `feat/directory` (override added to
  `apps/web/src/auth.ts`).
