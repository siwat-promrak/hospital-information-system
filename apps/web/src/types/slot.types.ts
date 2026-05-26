/**
 * Slot response shapes (F07 + F09 + F15 extensions). Mirrors the BE wire
 * DTO in `apps/api/src/slots/dto/slot.response.dto.ts`. Hand-mirrored — a
 * future `packages/shared` workspace will dedupe.
 *
 * One row per open, bookable slot returned by
 * `GET /slots?doctorId?=&departmentId=&date=&type=`. The slot grid is
 * dimension-locked on `(department, date, type)` plus an optional
 * `doctorId`; the BE returns slots in chronological order (`startAt ASC`).
 *
 * `startAt` / `endAt` are ISO 8601 UTC datetime strings — the FE consumes
 * them via dayjs (CLAUDE.md rule 9) and never instantiates `Date` math by
 * hand. The pair is half-open: `endAt - startAt === durationMinutes[type]`
 * in milliseconds, but `endAt` itself is exclusive.
 *
 * `departmentId` is echoed verbatim from the schedule that produced the
 * slot. The F09 booker MUST pass it back when calling `POST /appointments`
 * — the appointment inherits its `departmentId` from the chosen schedule,
 * NOT from the doctor's primary affiliation.
 *
 * `scheduleId` (F09) is the owning `DoctorSchedule.id`. The booker MUST
 * pass it back into `POST /appointments` so the new `Appointment.scheduleId`
 * FK is populated and the BE transactional re-check loads the row by id.
 *
 * `doctorId` / `doctorCode` / `doctorName` (F15) — the doctor whose
 * schedule produced this slot. F15 widened `/slots` to accept an OMITTED
 * `doctorId` (multi-doctor merge across the department), so a slot finder
 * caller may receive rows from many doctors in one response. The trio is
 * the wire shape that lets the FE render a "grouped by doctor" results
 * list without a second round-trip.
 */
export interface SlotResponse {
  startAt: string;
  endAt: string;
  departmentId: string;
  scheduleId: string;
  doctorId: string;
  doctorCode: string;
  doctorName: string;
}
