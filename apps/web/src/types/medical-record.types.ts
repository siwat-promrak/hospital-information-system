/**
 * Nested doctor ref on `MedicalRecordResponse`. Mirrors
 * `MedicalRecordDoctorRefDto` in the BE response DTO. Only English names
 * are available — the medical-record ref intentionally omits Thai names.
 */
export interface MedicalRecordDoctorRef {
  id: string;
  doctorCode: string;
  firstNameEn: string;
  lastNameEn: string;
}

/**
 * Nested department ref on `MedicalRecordResponse`. Mirrors
 * `MedicalRecordDepartmentRefDto` in the BE response DTO.
 */
export interface MedicalRecordDepartmentRef {
  id: string;
  name: string;
}

/**
 * Medical-record response shape. Mirrors `MedicalRecordResponseDto` in
 * `apps/api/src/medical-records/dto/medical-record.response.dto.ts`.
 * Hand-mirrored — a future `packages/shared` workspace will dedupe.
 *
 * One row per `medical_records` entry: a free-text note + an optional drug
 * list authored by the treating doctor against a specific appointment.
 * `doctorId` / `departmentId` are denormalised scalar FKs; `doctor` and
 * `department` are the nested ref objects the BE always populates via
 * `medicalRecordInclude`.
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
  doctor: MedicalRecordDoctorRef;
  department: MedicalRecordDepartmentRef;
}
