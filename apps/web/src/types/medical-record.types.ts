/**
 * Medical-record response shape. Mirrors the BE type in
 * `apps/api/src/medical-records/medical-records.types.ts`. Hand-mirrored
 * — a future `packages/shared` workspace will dedupe.
 *
 * One row per `medical_records` entry: a free-text note + an optional drug
 * list authored by the treating doctor against a specific appointment.
 * `departmentId` is denormalised onto the record so the F08+ list views
 * can filter without re-joining through the appointment.
 *
 * `createdAt` / `updatedAt` are ISO 8601 UTC datetime strings — the FE
 * consumes them via dayjs (CLAUDE.md rule 9) and never instantiates
 * `Date` math by hand.
 */
export interface MedicalRecordResponse {
  id: string;
  doctorId: string;
  patientId: string;
  departmentId: string;
  appointmentId: string;
  note: string;
  drug: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for `POST /medical-records`. Carries the foreign-key set
 * the BE service uses to attach the record to the right
 * appointment / patient / department triple.
 *
 * The doctor id is sourced server-side from the authed caller, so it is
 * NOT part of the wire body — the BE looks it up via `JwtGuard` and the
 * authed user's `doctor_id`.
 */
export interface CreateMedicalRecordBody {
  appointmentId: string;
  patientId: string;
  departmentId: string;
  note: string;
  drug?: string | null;
}

/**
 * Request body for `PATCH /medical-records/:id`. The relational keys are
 * locked once the record exists — only the editable narrative fields can
 * be updated. Any subset of the two fields may be omitted.
 */
export interface UpdateMedicalRecordBody {
  note?: string;
  drug?: string | null;
}
