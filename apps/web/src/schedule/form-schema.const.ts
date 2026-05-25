/**
 * Schedule-form validation error keys. Each value is a leaf in the
 * `K.Schedules.Form.fieldErrors.*` i18n catalog so the Zod schema can
 * emit i18n keys as `message` (rather than English copy) and the form
 * component resolves them via `useTranslations`.
 *
 * The Zod schema does NOT pull `K.Schedules.Form.fieldErrors.*` directly
 * because the generated `K` catalog stores the LEAF key (e.g.
 * `"endBeforeStart"`) — that's what next-intl wants when paired with
 * `useTranslations(NS.SchedulesFormFieldErrors)`. Mirroring those leaf
 * keys here as a `const` map keeps both sides in lockstep AND lets the
 * Zod schema reference them by name (`SCHEDULE_FORM_ERROR_KEY.END_BEFORE_START`)
 * instead of the bare string literal — per CLAUDE.md rule 2b.
 *
 * Drift between this catalog and `messages/en.json` shows up at build
 * time: the form component uses `K.Schedules.Form.fieldErrors[...]` to
 * resolve the message, and an extra / missing key here without a matching
 * en.json entry produces a TypeScript error on the lookup.
 */

export const SCHEDULE_FORM_ERROR_KEY = {
  DOCTOR_REQUIRED: "doctorRequired",
  DOCTOR_INVALID: "doctorInvalid",
  DEPARTMENT_REQUIRED: "departmentRequired",
  DEPARTMENT_INVALID: "departmentInvalid",
  DATE_REQUIRED: "dateRequired",
  DATE_INVALID: "dateInvalid",
  START_TIME_REQUIRED: "startTimeRequired",
  START_TIME_INVALID: "startTimeInvalid",
  END_TIME_REQUIRED: "endTimeRequired",
  END_TIME_INVALID: "endTimeInvalid",
  END_BEFORE_START: "endBeforeStart",
  START_IN_PAST: "startInPast",
  BREAK_START_REQUIRED: "breakStartRequired",
  BREAK_START_INVALID: "breakStartInvalid",
  BREAK_END_REQUIRED: "breakEndRequired",
  BREAK_END_INVALID: "breakEndInvalid",
  BREAK_END_BEFORE_START: "breakEndBeforeStart",
  BREAK_OUTSIDE_WINDOW: "breakOutsideWindow",
} as const;

export type ScheduleFormErrorKey =
  (typeof SCHEDULE_FORM_ERROR_KEY)[keyof typeof SCHEDULE_FORM_ERROR_KEY];
