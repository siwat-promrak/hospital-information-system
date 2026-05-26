import type { PaginationParams } from '../common/pagination';

import type { AppointmentGroupStatusFilter } from './appointment-groups.const';

/**
 * Service-layer arguments for `AppointmentGroupsService#list`.
 *
 * `patientId` is REQUIRED on the wire — groups are always scoped to a
 * single patient (the case-timeline view never lists across patients).
 * `status` is a tri-state sentinel (see `APPOINTMENT_GROUP_STATUS`).
 */
export interface ListAppointmentGroupsArgs extends PaginationParams {
  patientId: string;
  status?: AppointmentGroupStatusFilter;
}
