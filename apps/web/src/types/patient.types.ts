/**
 * Patient response shapes (F09). Mirrors the BE wire DTO in
 * `apps/api/src/patients/dto/patient.response.dto.ts`. Hand-mirrored — a
 * future `packages/shared` workspace will dedupe.
 *
 * One row per `patients` table entry. `hn` (Hospital Number) is generated
 * server-side (`<YY><sequence>`, zero-padded to 8 chars). Audit columns
 * (`createdBy`, `updatedBy`, `deletedAt`, …) are intentionally NOT on the
 * wire — patients are operator-managed and the FE never needs to render
 * the audit trail.
 *
 * `dateOfBirth` is an ISO calendar-date string (`YYYY-MM-DD`) — the DB
 * column is `Date` (no time-of-day) and the BE never invents one.
 *
 * `createdAt` / `updatedAt` are ISO 8601 UTC datetime strings — the FE
 * consumes them via dayjs (CLAUDE.md rule 9) and never instantiates
 * `Date` math by hand.
 */

/**
 * Mirrors Prisma `Gender` enum. Patients carry MALE or FEMALE today; the
 * RBAC P0 scope does not include non-binary / unspecified options.
 */
export type PatientGender = "MALE" | "FEMALE";

/**
 * Mirrors Prisma `BloodGroup` enum. `UNKNOWN` is the server-side default
 * when the walk-in form omits it.
 */
export type PatientBloodGroup =
  | "A_POSITIVE"
  | "A_NEGATIVE"
  | "B_POSITIVE"
  | "B_NEGATIVE"
  | "AB_POSITIVE"
  | "AB_NEGATIVE"
  | "O_POSITIVE"
  | "O_NEGATIVE"
  | "UNKNOWN";

/**
 * Full patient row returned by `POST /patients` (201) and rows in
 * `GET /patients` (200, paginated).
 */
export interface PatientResponse {
  id: string;
  hn: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameTh: string | null;
  lastNameTh: string | null;
  email: string | null;
  dateOfBirth: string;
  gender: PatientGender;
  bloodGroup: PatientBloodGroup;
  identificationNo: string;
  phone: string;
  emergencyPersonName: string;
  emergencyPersonRelation: string;
  emergencyPersonPhone: string;
  address: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for `POST /patients` — front-desk walk-in registration.
 *
 * - `hn` is NOT on the wire — the service mints it.
 * - `email` is optional; the service lowercases + trims; duplicate
 *   addresses are rejected with `409 PATIENT_EMAIL_EXISTS`.
 * - `bloodGroup` defaults to `UNKNOWN` server-side when omitted.
 */
export interface CreatePatientBody {
  firstNameEn: string;
  lastNameEn: string;
  firstNameTh?: string | null;
  lastNameTh?: string | null;
  email?: string | null;
  dateOfBirth: string;
  gender: PatientGender;
  bloodGroup?: PatientBloodGroup;
  identificationNo: string;
  phone: string;
  emergencyPersonName: string;
  emergencyPersonRelation: string;
  emergencyPersonPhone: string;
  address: string;
}
