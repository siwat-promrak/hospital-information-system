/**
 * Snackbar message catalogs.
 *
 * Two responsibilities:
 *
 *  - `SNACKBAR_SUCCESS_KEY` — semantic names for every success-toast site.
 *    Each value matches an entry under `Snackbar.Success.*` in
 *    `messages/en.json` so the hook can resolve a typed key into a
 *    locale-aware string via the generated `K` catalog.
 *
 *  - `ERROR_CODE_TO_KEY` — maps an `ApiError.code` (BE wire code, e.g.
 *    `SCHEDULE_OVERLAP`) to the matching `Snackbar.Errors.*` key.
 *    Unmapped codes fall back to `Snackbar.Errors.generic` so the user
 *    always sees *something* — silent failures are worse than a generic
 *    message.
 *
 * Both maps live here (and NOT inline in the consuming hook) per
 * CLAUDE.md rule 2a / 2b — every domain-carrying string literal goes
 * through a named constant.
 */

import { K } from "@/i18n/keys.generated";
import { SCHEDULE_ERROR_CODE } from "@/lib/api/schedule.const";

/**
 * Canonical names for every success-toast site. Each value must exist
 * under `Snackbar.Success.*` in the i18n catalog.
 */
export const SNACKBAR_SUCCESS_KEY = {
  SCHEDULE_CREATED: "scheduleCreated",
  SCHEDULE_UPDATED: "scheduleUpdated",
  SCHEDULE_DELETED: "scheduleDeleted",
  SIGNED_OUT: "signedOut",
} as const;

export type SnackbarSuccessKey =
  (typeof SNACKBAR_SUCCESS_KEY)[keyof typeof SNACKBAR_SUCCESS_KEY];

type SnackbarErrorMessageKey = keyof typeof K.Snackbar.Errors;

/**
 * Wire-code → message-key map. Unmapped codes fall through to the generic
 * fallback so the user always sees *something* — silent failures are
 * worse than a generic message. The hook handles the fallback so adding a
 * new mapping is a single entry here.
 *
 * Values are typed against the generated `K.Snackbar.Errors` catalog so a
 * typo here surfaces as a TS error instead of a runtime missing-key warning.
 */
export const ERROR_CODE_TO_KEY: Readonly<
  Record<string, SnackbarErrorMessageKey>
> = {
  [SCHEDULE_ERROR_CODE.OVERLAP]: K.Snackbar.Errors.overlap,
  [SCHEDULE_ERROR_CODE.DOCTOR_NOT_IN_DEPARTMENT]:
    K.Snackbar.Errors.doctorNotInDepartment,
  [SCHEDULE_ERROR_CODE.INSUFFICIENT_PERMISSION_SCOPE]:
    K.Snackbar.Errors.scopeViolation,
  [SCHEDULE_ERROR_CODE.INSUFFICIENT_PERMISSION]: K.Snackbar.Errors.forbidden,
  [SCHEDULE_ERROR_CODE.START_IN_PAST]: K.Snackbar.Errors.startInPast,
};

/** Single key for the generic-error path — defined once so the hook + tests share it. */
export const SNACKBAR_GENERIC_ERROR_KEY: SnackbarErrorMessageKey =
  K.Snackbar.Errors.generic;
