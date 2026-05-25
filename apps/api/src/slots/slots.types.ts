import type { AppointmentType } from '@prisma/client';

/**
 * Service-layer arguments for `SlotsService#findSlots`. The controller
 * maps `FindSlotsQueryDto` into this shape so the service never has to
 * know about Express request plumbing.
 *
 * - `doctorId` — query param, uuid.
 * - `departmentId` — query param, uuid. REQUIRED per US-6.2 (a doctor may
 *   span multiple departments and each schedule pins exactly one).
 * - `date` — query param, ISO calendar date `YYYY-MM-DD`. Interpreted as a
 *   UTC calendar day for the slot grid.
 * - `type` — query param, `AppointmentType`. Drives the step size of the
 *   slot grid and is also gated on `(departmentId, type)` membership in
 *   `department_appointment_types`.
 */
export interface FindSlotsArgs {
  doctorId: string;
  departmentId: string;
  date: string;
  type: AppointmentType;
}

/**
 * Shape of one slot returned by `SlotsService#findSlots`. Identical to
 * `SlotResponseDto` (the wire-facing class with Swagger decorators); kept
 * here as a plain TS interface so internal callers (other services in F08)
 * can consume the value without importing the DTO module just for typing.
 */
export interface SlotResult {
  startAt: string;
  endAt: string;
  departmentId: string;
}

/**
 * Half-open UTC bounds for an ISO calendar date — `[dayStart, dayEnd)`.
 * Returned by `resolveDayBounds` and consumed by the schedule + appointment
 * Prisma filters in `SlotsService#findSlots`.
 */
export interface ResolvedDayBounds {
  dayStart: Date;
  dayEnd: Date;
}

/**
 * Subset of `DoctorSchedule` consumed by `computeSchedulesSlots`. Mirrors
 * the columns selected by `findSlots`; declared narrowly so the pure
 * computation function never depends on the full Prisma model.
 */
export interface ScheduleWindow {
  departmentId: string;
  startAt: Date;
  endAt: Date;
  breakStartAt: Date | null;
  breakEndAt: Date | null;
}

/**
 * Arguments for `computeSchedulesSlots` — the pure slot-grid step.
 *
 *  - `schedule` — half-open working window + optional break window.
 *  - `durationMinutes` — slot step (and slot length).
 *  - `blockingAppointments` — every BOOKED + COMPLETED appointment on the
 *    same doctor that day. A slot is dropped if any blocker overlaps.
 *  - `now` — wall-clock cutoff. Slots whose `startAt <= now` are dropped.
 */
export interface ComputeScheduleSlotsArgs {
  schedule: ScheduleWindow;
  durationMinutes: number;
  blockingAppointments: ReadonlyArray<{ startAt: Date; endAt: Date }>;
  now: Date;
}
