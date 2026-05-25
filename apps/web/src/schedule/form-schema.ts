/**
 * Zod schema for the schedule create / edit form. Drives per-field error
 * messages inside `ScheduleFormDialog` via react-hook-form's
 * `zodResolver` so blank-out / mis-typed inputs surface red helper text
 * under the matching `<TextField>` instead of a single top-of-form alert.
 *
 * The schema returns **i18n error KEYS** (e.g. `"endBeforeStart"`),
 * not localised copy — the form component looks each key up in the
 * `K.Schedules.Form.fieldErrors.*` catalog via `useTranslations`. This keeps
 * `messages/{en,th}.json` as the single source of truth for visible copy
 * while letting the schema participate in next-intl's typed key surface.
 *
 * Wire-shape note: the schema validates the **form fields** the dialog
 * binds to its inputs (`doctorId`, `departmentId`, `date` ISO date string,
 * `startTime` / `endTime` HH:mm strings, optional break pair, booking
 * flag). The schedule action expects ISO datetimes — the dialog combines
 * `date + startTime` into `startAt` via `combineDateAndTime` AFTER
 * validation passes, so the schema only verifies the parts the user
 * directly edits.
 */

import { z } from "zod";

import { dayjs } from "@/lib/dayjs";
import { combineDateAndTime } from "@/lib/utils/date";

import { SCHEDULE_FORM_ERROR_KEY } from "./form-schema.const";

/** `HH:mm` 24-hour pattern, matches the value `<input type="time">` emits. */
const HHMM_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
/** `YYYY-MM-DD` ISO date, matches `<input type="date">`. */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Schema factory parameter set. The form sometimes needs to bypass the
 * past-start guard — edit mode disables the date input anyway, and the BE
 * still re-validates on save, so the FE check is purely a UX optimisation.
 */
export interface ScheduleFormSchemaOptions {
  /**
   * When `true`, the schema skips the "start in the past" refinement —
   * used in edit mode where the date is locked and an existing schedule's
   * `startAt` may legitimately be in the past (e.g. the user opens an
   * earlier-today schedule to flip `acceptsBooking`).
   */
  skipPastStartGuard?: boolean;
}

/**
 * Build the schedule form Zod schema. A factory rather than a static
 * `const` because edit vs create modes diverge on the past-start guard —
 * baking that into the schema avoids a second control-flow branch inside
 * the form component.
 */
export function scheduleFormSchema(options: ScheduleFormSchemaOptions = {}) {
  const { skipPastStartGuard = false } = options;

  const baseShape = z.object({
    doctorId: z
      .string({ message: SCHEDULE_FORM_ERROR_KEY.DOCTOR_REQUIRED })
      .min(1, { message: SCHEDULE_FORM_ERROR_KEY.DOCTOR_REQUIRED })
      .uuid({ message: SCHEDULE_FORM_ERROR_KEY.DOCTOR_INVALID }),
    departmentId: z
      .string({ message: SCHEDULE_FORM_ERROR_KEY.DEPARTMENT_REQUIRED })
      .min(1, { message: SCHEDULE_FORM_ERROR_KEY.DEPARTMENT_REQUIRED })
      .uuid({ message: SCHEDULE_FORM_ERROR_KEY.DEPARTMENT_INVALID }),
    date: z
      .string({ message: SCHEDULE_FORM_ERROR_KEY.DATE_REQUIRED })
      .min(1, { message: SCHEDULE_FORM_ERROR_KEY.DATE_REQUIRED })
      .regex(ISO_DATE_REGEX, {
        message: SCHEDULE_FORM_ERROR_KEY.DATE_INVALID,
      }),
    startTime: z
      .string({ message: SCHEDULE_FORM_ERROR_KEY.START_TIME_REQUIRED })
      .min(1, { message: SCHEDULE_FORM_ERROR_KEY.START_TIME_REQUIRED })
      .regex(HHMM_REGEX, {
        message: SCHEDULE_FORM_ERROR_KEY.START_TIME_INVALID,
      }),
    endTime: z
      .string({ message: SCHEDULE_FORM_ERROR_KEY.END_TIME_REQUIRED })
      .min(1, { message: SCHEDULE_FORM_ERROR_KEY.END_TIME_REQUIRED })
      .regex(HHMM_REGEX, {
        message: SCHEDULE_FORM_ERROR_KEY.END_TIME_INVALID,
      }),
    hasBreak: z.boolean(),
    breakStartTime: z.string(),
    breakEndTime: z.string(),
    acceptsBooking: z.boolean(),
  });

  return baseShape.superRefine((value, ctx) => {
    // end > start guard — only meaningful once both times are HH:mm-shaped,
    // so skip when the upstream `regex` already flagged either field.
    if (
      HHMM_REGEX.test(value.startTime) &&
      HHMM_REGEX.test(value.endTime)
    ) {
      const startAt = combineDateAndTime(value.date, value.startTime);
      const endAt = combineDateAndTime(value.date, value.endTime);

      if (startAt && endAt) {
        if (dayjs(endAt).isSameOrBefore(dayjs(startAt))) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["endTime"],
            message: SCHEDULE_FORM_ERROR_KEY.END_BEFORE_START,
          });
        }

        if (!skipPastStartGuard && dayjs(startAt).isBefore(dayjs())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["startTime"],
            message: SCHEDULE_FORM_ERROR_KEY.START_IN_PAST,
          });
        }
      }
    }

    if (!value.hasBreak) {
      return;
    }

    // Break pair — both fields required when the toggle is on; the existing
    // form keeps the inputs hidden when off so we don't enforce the regex
    // unless the user explicitly opted into the break window.
    const breakStartOk = HHMM_REGEX.test(value.breakStartTime);
    const breakEndOk = HHMM_REGEX.test(value.breakEndTime);

    if (value.breakStartTime.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["breakStartTime"],
        message: SCHEDULE_FORM_ERROR_KEY.BREAK_START_REQUIRED,
      });
    } else if (!breakStartOk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["breakStartTime"],
        message: SCHEDULE_FORM_ERROR_KEY.BREAK_START_INVALID,
      });
    }

    if (value.breakEndTime.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["breakEndTime"],
        message: SCHEDULE_FORM_ERROR_KEY.BREAK_END_REQUIRED,
      });
    } else if (!breakEndOk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["breakEndTime"],
        message: SCHEDULE_FORM_ERROR_KEY.BREAK_END_INVALID,
      });
    }

    if (!breakStartOk || !breakEndOk) {
      return;
    }

    const breakStartAt = combineDateAndTime(value.date, value.breakStartTime);
    const breakEndAt = combineDateAndTime(value.date, value.breakEndTime);
    const startAt = combineDateAndTime(value.date, value.startTime);
    const endAt = combineDateAndTime(value.date, value.endTime);

    if (!breakStartAt || !breakEndAt || !startAt || !endAt) {
      return;
    }

    if (dayjs(breakEndAt).isSameOrBefore(dayjs(breakStartAt))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["breakEndTime"],
        message: SCHEDULE_FORM_ERROR_KEY.BREAK_END_BEFORE_START,
      });

      return;
    }

    if (
      dayjs(breakStartAt).isBefore(dayjs(startAt)) ||
      dayjs(breakEndAt).isAfter(dayjs(endAt))
    ) {
      // Attach to both endpoints of the break pair so the user sees the
      // outside-window message under whichever field they touched last.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["breakStartTime"],
        message: SCHEDULE_FORM_ERROR_KEY.BREAK_OUTSIDE_WINDOW,
      });
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["breakEndTime"],
        message: SCHEDULE_FORM_ERROR_KEY.BREAK_OUTSIDE_WINDOW,
      });
    }
  });
}

/**
 * Inferred form-values shape. `z.infer<typeof scheduleFormSchema>` won't
 * resolve directly because the factory returns a fresh schema instance —
 * we infer from the base object shape instead so the type stays stable.
 */
export type ScheduleFormValues = z.infer<
  ReturnType<typeof scheduleFormSchema>
>;
