import type { AppointmentType } from '@prisma/client';

/**
 * Service-layer arguments for `SlotsService#findSlots`. The controller
 * maps `FindSlotsQueryDto` into this shape so the service never has to
 * know about Express request plumbing.
 *
 * - `doctorId` — query param, uuid. OPTIONAL — when omitted, the service
 *   fans out across every doctor with an active schedule in
 *   `departmentId` on `date` and merges the resulting slot grids (F15).
 *   A caller whose write scope is `.own`-only MUST supply it; the scope
 *   guard rejects `.own` + omitted-doctor as `INSUFFICIENT_PERMISSION_SCOPE`.
 * - `departmentId` — query param, uuid. REQUIRED per US-6.2 (a doctor may
 *   span multiple departments and each schedule pins exactly one).
 * - `date` — query param, ISO calendar date `YYYY-MM-DD`. Interpreted as a
 *   UTC calendar day for the slot grid.
 * - `type` — query param, `AppointmentType`. Drives the step size of the
 *   slot grid (via the per-pair `durationMinutes`) and is also gated on
 *   `(departmentId, type)` membership in `department_appointment_types`.
 */
export interface FindSlotsArgs {
  doctorId: string | undefined;
  departmentId: string;
  date: string;
  type: AppointmentType;
}

/**
 * Shape of one slot returned by `SlotsService#findSlots`. Identical to
 * `SlotResponseDto` (the wire-facing class with Swagger decorators); kept
 * here as a plain TS interface so internal callers (other services in F09)
 * can consume the value without importing the DTO module just for typing.
 *
 * `scheduleId` is the owning `DoctorSchedule.id` — F09 booking takes it
 * back as the provenance link for `Appointment.scheduleId`.
 *
 * F15 — every emitted slot carries the owning doctor's `id`, `doctorCode`,
 * and display name so the multi-doctor fan-out response can render
 * "Dr. X — 09:00" without a second lookup on the FE.
 */
export interface SlotResult {
  startAt: string;
  endAt: string;
  departmentId: string;
  scheduleId: string;
  doctorId: string;
  doctorCode: string;
  doctorName: string;
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
 * Half-open free interval inside a schedule. Produced by
 * `computeFreeIntervals` (slots.service.ts) and consumed by both the slot
 * finder (one re-anchored grid per interval) and the booking-side grid
 * alignment check (`SLOT_NOT_ON_GRID`).
 */
export interface FreeInterval {
  startAt: Date;
  endAt: Date;
}

/**
 * Subset of `DoctorSchedule` consumed by `computeSchedulesSlots`. Mirrors
 * the columns selected by `findSlots`; declared narrowly so the pure
 * computation function never depends on the full Prisma model.
 *
 * `id` is the owning `DoctorSchedule.id` — surfaced on every emitted
 * `SlotResult.scheduleId` so the F09 booker can post it back into
 * `POST /appointments` (populates the `Appointment.scheduleId` FK).
 *
 * F15 — `doctor` is the owning doctor's identity triplet (id + code +
 * display name). The pure slot-grid step echoes these onto every emitted
 * `SlotResult` so the FE can group multi-doctor fan-out responses by
 * doctor without a second lookup.
 */
export interface ScheduleWindow {
  id: string;
  departmentId: string;
  startAt: Date;
  endAt: Date;
  breakStartAt: Date | null;
  breakEndAt: Date | null;
  doctor: SlotDoctorRef;
}

/**
 * Owning-doctor reference threaded onto every `ScheduleWindow` +
 * propagated to every emitted `SlotResult`. Kept narrow on purpose —
 * the slot grid never needs more than these three fields.
 *
 * `name` is the concatenated display name (`firstNameEn lastNameEn`)
 * built at the data-fetch boundary in `SlotsService#findSlots`; the
 * pure grid step never touches the underlying `User` row.
 */
export interface SlotDoctorRef {
  id: string;
  doctorCode: string;
  name: string;
}

/**
 * Per-(department, type) booking rule loaded from
 * `department_appointment_types` (F13). Returned by
 * `SlotsService#loadDepartmentTypeRule` and consumed by
 * `computeSchedulesSlots` for the slot-grid step + booking-window filter.
 *
 *  - `durationMinutes` — slot step (and slot length). Replaces the
 *    pre-F13 global `APPOINTMENT_TYPE_DURATION_MINUTES` map.
 *  - `bookingWindowStartMinute` / `bookingWindowEndMinute` — nullable
 *    wall-clock minutes-of-day in `CLINIC_TIMEZONE`. Either side may be
 *    null = open-ended on that side; both null = always inside.
 */
export interface DepartmentTypeRule {
  durationMinutes: number;
  bookingWindowStartMinute: number | null;
  bookingWindowEndMinute: number | null;
}

/**
 * Arguments for `computeSchedulesSlots` — the pure slot-grid step.
 *
 *  - `schedule` — half-open working window + optional break window.
 *  - `durationMinutes` — slot step (and slot length).
 *  - `bookingWindowStartMinute` / `bookingWindowEndMinute` — per-pair
 *    booking window (F13). Slots whose local wall-clock minute-of-day
 *    falls outside `[start, end)` are dropped. Either side may be null
 *    (open-ended on that side); both null = no window filter.
 *  - `blockingAppointments` — every BOOKED + COMPLETED appointment on the
 *    same doctor that day. A slot is dropped if any blocker overlaps.
 *  - `now` — wall-clock cutoff. Slots whose `startAt <= now` are dropped.
 */
export interface ComputeScheduleSlotsArgs {
  schedule: ScheduleWindow;
  durationMinutes: number;
  bookingWindowStartMinute: number | null;
  bookingWindowEndMinute: number | null;
  blockingAppointments: ReadonlyArray<{ startAt: Date; endAt: Date }>;
  now: Date;
}
