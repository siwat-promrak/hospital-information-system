/**
 * Schedule response shapes (F06). Mirrors the BE types in
 * `apps/api/src/schedules/schedules.types.ts`. Hand-mirrored — a future
 * `packages/shared` workspace will dedupe.
 *
 * v2 contract: schedules are **concrete dated time windows** with
 * `startAt` / `endAt` ISO datetimes. Weekly recurrence is gone — each row
 * is exactly one working window on one calendar date for one doctor in
 * one department. The list endpoint filters by a `from` / `to` date range
 * (server-side bounds), not by `dayOfWeek`.
 */

/**
 * Thin doctor reference embedded in every `ScheduleResponse`. Mirrors a
 * subset of `DoctorListRow` — enough to render the doctor's full name on a
 * calendar chip without a second round-trip.
 */
export interface ScheduleDoctorRef {
  id: string;
  doctorCode: string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameTh: string | null;
  lastNameTh: string | null;
}

/**
 * Thin department reference embedded in every `ScheduleResponse`. The BE
 * `Department` model only carries a single English `name` + optional
 * `description` in P0; F12 ships Thai labels via i18n. Mirrors the BE
 * exactly to avoid drift.
 */
export interface ScheduleDepartmentRef {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Returned by `GET /schedules`, `GET /schedules/:id`, `POST /schedules`,
 * and `PATCH /schedules/:id`.
 *
 * `startAt` / `endAt` are ISO 8601 datetimes (zoned). `breakStartAt` /
 * `breakEndAt`, when set, MUST satisfy
 * `startAt <= breakStartAt < breakEndAt <= endAt`.
 */
export interface ScheduleResponse {
  id: string;
  doctorId: string;
  doctor: ScheduleDoctorRef;
  departmentId: string;
  department: ScheduleDepartmentRef;
  startAt: string;
  endAt: string;
  breakStartAt: string | null;
  breakEndAt: string | null;
  acceptsBooking: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for `POST /schedules`. Optional fields fall back to BE
 * defaults (`acceptsBooking = true`).
 */
export interface CreateScheduleBody {
  doctorId: string;
  departmentId: string;
  startAt: string;
  endAt: string;
  breakStartAt?: string;
  breakEndAt?: string;
  acceptsBooking?: boolean;
}

/**
 * Request body for `PATCH /schedules/:id`. Partial — every field optional;
 * `doctorId` is NOT mutable post-create (delete + re-create to move a
 * schedule between doctors).
 */
export type UpdateScheduleBody = Partial<Omit<CreateScheduleBody, "doctorId">>;
