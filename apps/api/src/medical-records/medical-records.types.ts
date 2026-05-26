import type { PaginationParams } from '../common/pagination';

/**
 * Service-layer arguments for `listMedicalRecords`. Pagination + optional
 * narrowing axes (patient, doctor, appointment, appointmentGroup) so the
 * patient-detail, doctor-detail, and F17 visit-thread views can scope the
 * query.
 *
 * The row shape returned to the wire is `MedicalRecordResponseDto`
 * (`./dto/medical-record.response.dto.ts`). The DTO class IS the response
 * type — no parallel TS interface is maintained (Item 6 / Pattern A).
 */
export interface ListMedicalRecordsArgs extends PaginationParams {
  patientId?: string;
  doctorId?: string;
  appointmentId?: string;
  /** F17 — filter by appointment group (visit-thread view). */
  appointmentGroupId?: string;
}

/**
 * Arguments for creating a medical record inside an existing Prisma
 * transaction. Used by `MedicalRecordsService.createInsideTx` so
 * appointment-action endpoints can author a record atomically without
 * going through the now-removed standalone POST route.
 */
export interface CreateMedicalRecordInsideTxArgs {
  appointmentId: string;
  doctorId: string;
  patientId: string;
  departmentId: string;
  note: string;
  drug?: string | null;
  /** User id of the caller — written to `createdBy`. */
  createdBy: string;
}
