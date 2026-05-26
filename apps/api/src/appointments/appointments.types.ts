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
   * F14 pending-referral pickup queue. When `true`, the service narrows
   * to rows with `status = COMPLETED` AND `referredToDepartmentId IS NOT NULL`
   * AND `referralFulfilledByAppointmentId IS NULL`. Destination-dept
   * narrowing is driven by the caller's scope: `.own-department` callers
   * see referrals routed to their own department; `.all` callers (MRO)
   * see referrals to every department.
   */
  pendingReferralOnly?: boolean;
}
