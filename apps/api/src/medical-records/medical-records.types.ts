import type { PaginationParams } from '../common/pagination';

/**
 * Service-layer arguments for `listMedicalRecords`. Pagination + optional
 * narrowing axes (patient, doctor, appointment) so the patient-detail and
 * doctor-detail views can scope the query.
 *
 * The row shape returned to the wire is `MedicalRecordResponseDto`
 * (`./dto/medical-record.response.dto.ts`). The DTO class IS the response
 * type — no parallel TS interface is maintained (Item 6 / Pattern A).
 */
export interface ListMedicalRecordsArgs extends PaginationParams {
  patientId?: string;
  doctorId?: string;
  appointmentId?: string;
}
