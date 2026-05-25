/**
 * Appointment-type response shapes (F07). Mirrors the BE types in
 * `apps/api/src/appointment-types/appointment-types.types.ts`. Hand-mirrored —
 * a future `packages/shared` workspace will dedupe.
 *
 * The catalog is static per-deploy: four entries, one per Prisma
 * `AppointmentType` enum member, paired with an English label and the
 * canonical slot-duration in minutes (also the F07 slot-grid step).
 */

/**
 * The four appointment categories. UPPER_SNAKE wire codes mirroring the
 * Prisma `AppointmentType` enum.
 *
 * IMPORTANT: this union MUST stay in sync with
 * `apps/api/prisma/schema.prisma` `enum AppointmentType { ... }`. Adding a
 * new member is a coordinated BE + FE change — extend the Prisma enum, the
 * BE duration / label maps, this union, and the F12 i18n catalog.
 */
export type AppointmentType =
  | "NEW_PATIENT_VISIT"
  | "FOLLOW_UP"
  | "CONSULTATION"
  | "PROCEDURE";

/**
 * Returned by `GET /appointment-types`. The BE-emitted English `label` is
 * the i18n fallback; F12 re-keys these through `Common.AppointmentType.<code>`
 * for Thai parity.
 */
export interface AppointmentTypeResponse {
  code: AppointmentType;
  label: string;
  durationMinutes: number;
}
