/**
 * Client-side zod schema for the F09 walk-in patient registration form.
 *
 * The shape mirrors the BE `CreatePatientDto` 1:1 — every BE-required
 * field is required here, optional fields stay optional. Validation
 * messages reference a stable error code from
 * `PATIENT_REGISTRATION_FIELD_ERROR` so the form can resolve a localised
 * `helperText` via `next-intl` without baking i18n into the schema.
 *
 * `dateOfBirth` is the wire format (`YYYY-MM-DD`) — `<input type="date">`
 * already emits it. The schema rejects an empty string and a future date
 * (the BE doesn't enforce the future-date guard explicitly, but it'd be
 * weird UX to register a patient born tomorrow).
 */

import { z } from "zod";

import { dayjs } from "@/lib/dayjs";

import { PATIENT_REGISTRATION_FIELD_ERROR } from "./registration-schema.const";

const trimmed = z.string().transform((value) => value.trim());

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value === "" ? null : value.trim()));

export const patientRegistrationSchema = z.object({
  firstNameEn: trimmed.refine((value) => value.length > 0, {
    message: PATIENT_REGISTRATION_FIELD_ERROR.FIRST_NAME_EN_REQUIRED,
  }),
  lastNameEn: trimmed.refine((value) => value.length > 0, {
    message: PATIENT_REGISTRATION_FIELD_ERROR.LAST_NAME_EN_REQUIRED,
  }),
  firstNameTh: optionalString,
  lastNameTh: optionalString,
  email: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value.trim() === "" ? null : value.trim(),
    )
    .refine(
      (value) => value === null || z.string().email().safeParse(value).success,
      {
        message: PATIENT_REGISTRATION_FIELD_ERROR.EMAIL_INVALID,
      },
    ),
  dateOfBirth: z
    .string()
    .refine((value) => value.length > 0, {
      message: PATIENT_REGISTRATION_FIELD_ERROR.DATE_OF_BIRTH_REQUIRED,
    })
    .refine(
      (value) => {
        const parsed = dayjs(value, "YYYY-MM-DD", true);

        if (!parsed.isValid()) {
          return false;
        }

        return true;
      },
      {
        message: PATIENT_REGISTRATION_FIELD_ERROR.DATE_OF_BIRTH_REQUIRED,
      },
    )
    .refine(
      (value) => {
        const parsed = dayjs(value, "YYYY-MM-DD", true);

        return parsed.isValid() && parsed.isSameOrBefore(dayjs(), "day");
      },
      {
        message: PATIENT_REGISTRATION_FIELD_ERROR.DATE_OF_BIRTH_FUTURE,
      },
    ),
  gender: z.enum(["MALE", "FEMALE"], {
    errorMap: () => ({
      message: PATIENT_REGISTRATION_FIELD_ERROR.GENDER_REQUIRED,
    }),
  }),
  bloodGroup: z
    .enum([
      "A_POSITIVE",
      "A_NEGATIVE",
      "B_POSITIVE",
      "B_NEGATIVE",
      "AB_POSITIVE",
      "AB_NEGATIVE",
      "O_POSITIVE",
      "O_NEGATIVE",
      "UNKNOWN",
    ])
    .optional(),
  identificationNo: trimmed.refine((value) => value.length > 0, {
    message: PATIENT_REGISTRATION_FIELD_ERROR.IDENTIFICATION_NO_REQUIRED,
  }),
  phone: trimmed.refine((value) => value.length > 0, {
    message: PATIENT_REGISTRATION_FIELD_ERROR.PHONE_REQUIRED,
  }),
  emergencyPersonName: trimmed.refine((value) => value.length > 0, {
    message: PATIENT_REGISTRATION_FIELD_ERROR.EMERGENCY_NAME_REQUIRED,
  }),
  emergencyPersonRelation: trimmed.refine((value) => value.length > 0, {
    message: PATIENT_REGISTRATION_FIELD_ERROR.EMERGENCY_RELATION_REQUIRED,
  }),
  emergencyPersonPhone: trimmed.refine((value) => value.length > 0, {
    message: PATIENT_REGISTRATION_FIELD_ERROR.EMERGENCY_PHONE_REQUIRED,
  }),
  address: trimmed.refine((value) => value.length > 0, {
    message: PATIENT_REGISTRATION_FIELD_ERROR.ADDRESS_REQUIRED,
  }),
});

export type PatientRegistrationValues = z.infer<typeof patientRegistrationSchema>;

/**
 * Initial values for the registration form. `gender` / `bloodGroup` start
 * empty so the user makes an explicit choice (the schema rejects an empty
 * gender; `bloodGroup` defaults to `UNKNOWN` server-side when omitted).
 */
export const PATIENT_REGISTRATION_DEFAULTS = {
  firstNameEn: "",
  lastNameEn: "",
  firstNameTh: "",
  lastNameTh: "",
  email: "",
  dateOfBirth: "",
  gender: "" as unknown as PatientRegistrationValues["gender"],
  bloodGroup: undefined as PatientRegistrationValues["bloodGroup"],
  identificationNo: "",
  phone: "",
  emergencyPersonName: "",
  emergencyPersonRelation: "",
  emergencyPersonPhone: "",
  address: "",
} as const;
