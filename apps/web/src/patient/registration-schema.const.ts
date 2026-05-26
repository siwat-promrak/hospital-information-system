/**
 * Form-side enums + error-key catalog for the F09 walk-in patient
 * registration form. Lives in a dedicated `.const.ts` so the schema +
 * form component can import from one place without re-declaring the
 * option lists (CLAUDE.md rule 2a / 2b).
 */

import type { K } from "@/i18n/keys.generated";
import type {
  PatientBloodGroup,
  PatientGender,
} from "@/types/patient.types";

/**
 * Ordered list of gender options shown in the `<Select>` — the form
 * iterates this so a new enum value (e.g. a future `NON_BINARY`) lights
 * up the picker once the BE catalog adds the same code.
 */
export const PATIENT_GENDER_OPTIONS: readonly PatientGender[] = [
  "MALE",
  "FEMALE",
];

/**
 * Ordered list of blood-group options shown in the `<Select>`. `UNKNOWN`
 * sits at the top because it's the most-common front-desk pick (patients
 * often don't know their type at registration time).
 */
export const PATIENT_BLOOD_GROUP_OPTIONS: readonly PatientBloodGroup[] = [
  "UNKNOWN",
  "A_POSITIVE",
  "A_NEGATIVE",
  "B_POSITIVE",
  "B_NEGATIVE",
  "AB_POSITIVE",
  "AB_NEGATIVE",
  "O_POSITIVE",
  "O_NEGATIVE",
];

/**
 * Stable error-key codes emitted by the zod schema's `params`. The form
 * maps these to the matching `K.Patients.Register.fieldErrors.*` leaf
 * via the catalog below — keeps the schema free of i18n imports and the
 * form free of magic-string code-to-key wiring.
 */
export const PATIENT_REGISTRATION_FIELD_ERROR = {
  FIRST_NAME_EN_REQUIRED: "firstNameEnRequired",
  LAST_NAME_EN_REQUIRED: "lastNameEnRequired",
  DATE_OF_BIRTH_REQUIRED: "dateOfBirthRequired",
  DATE_OF_BIRTH_FUTURE: "dateOfBirthFuture",
  GENDER_REQUIRED: "genderRequired",
  IDENTIFICATION_NO_REQUIRED: "identificationNoRequired",
  PHONE_REQUIRED: "phoneRequired",
  EMERGENCY_NAME_REQUIRED: "emergencyNameRequired",
  EMERGENCY_RELATION_REQUIRED: "emergencyRelationRequired",
  EMERGENCY_PHONE_REQUIRED: "emergencyPhoneRequired",
  ADDRESS_REQUIRED: "addressRequired",
  EMAIL_INVALID: "emailInvalid",
} as const;

export type PatientRegistrationFieldErrorCode =
  (typeof PATIENT_REGISTRATION_FIELD_ERROR)[keyof typeof PATIENT_REGISTRATION_FIELD_ERROR];

/**
 * Mapping from schema error code to the matching i18n leaf under
 * `K.Patients.Register.fieldErrors`. Keeps the form's `helperText`
 * resolver a single `tFieldErrors(map[code])` lookup.
 */
export const PATIENT_REGISTRATION_FIELD_ERROR_KEY: Readonly<
  Record<
    PatientRegistrationFieldErrorCode,
    keyof typeof K.Patients.Register.fieldErrors
  >
> = {
  [PATIENT_REGISTRATION_FIELD_ERROR.FIRST_NAME_EN_REQUIRED]:
    "firstNameEnRequired",
  [PATIENT_REGISTRATION_FIELD_ERROR.LAST_NAME_EN_REQUIRED]:
    "lastNameEnRequired",
  [PATIENT_REGISTRATION_FIELD_ERROR.DATE_OF_BIRTH_REQUIRED]:
    "dateOfBirthRequired",
  [PATIENT_REGISTRATION_FIELD_ERROR.DATE_OF_BIRTH_FUTURE]:
    "dateOfBirthFuture",
  [PATIENT_REGISTRATION_FIELD_ERROR.GENDER_REQUIRED]: "genderRequired",
  [PATIENT_REGISTRATION_FIELD_ERROR.IDENTIFICATION_NO_REQUIRED]:
    "identificationNoRequired",
  [PATIENT_REGISTRATION_FIELD_ERROR.PHONE_REQUIRED]: "phoneRequired",
  [PATIENT_REGISTRATION_FIELD_ERROR.EMERGENCY_NAME_REQUIRED]:
    "emergencyNameRequired",
  [PATIENT_REGISTRATION_FIELD_ERROR.EMERGENCY_RELATION_REQUIRED]:
    "emergencyRelationRequired",
  [PATIENT_REGISTRATION_FIELD_ERROR.EMERGENCY_PHONE_REQUIRED]:
    "emergencyPhoneRequired",
  [PATIENT_REGISTRATION_FIELD_ERROR.ADDRESS_REQUIRED]: "addressRequired",
  [PATIENT_REGISTRATION_FIELD_ERROR.EMAIL_INVALID]: "emailInvalid",
};
