import type { AppointmentStatus } from '@prisma/client';

import type { PaginationParams } from '../common/pagination';

import type { AppointmentListOrder } from './appointments.const';

/**
 * Service-layer arguments for `AppointmentsService#list`. Filters are
 * AND-combined; missing filters mean no constraint. `from` / `to` are
 * ISO calendar dates (`YYYY-MM-DD`) — the service expands them to
 * `[startOfDay, endOfDay]` UTC and matches `startAt` in range. `status`
 * is validated upstream against the Prisma `AppointmentStatus` enum.
 */
export interface ListAppointmentsArgs extends PaginationParams {
  doctorId?: string;
  patientId?: string;
  departmentId?: string;
  from?: string;
  to?: string;
  status?: AppointmentStatus;
  order?: AppointmentListOrder;
  /**
   * F14 pending-referral filter. When set, the service narrows to rows
   * where `referredToDepartmentId = <param>` AND
   * `referralFulfilledByAppointmentId IS NULL` — i.e. the still-open
   * pickup queue at the destination department.
   */
  pendingReferralToDepartmentId?: string;
}
