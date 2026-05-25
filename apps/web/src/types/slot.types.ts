/**
 * Slot response shapes (F07). Mirrors the BE types in
 * `apps/api/src/slots/slots.types.ts`. Hand-mirrored — a future
 * `packages/shared` workspace will dedupe.
 *
 * One row per open, bookable slot returned by
 * `GET /doctors/:id/slots?departmentId=&date=&type=`. The slot grid is
 * dimension-locked on a single `(doctor, department, date, type)` tuple; the
 * BE returns slots in chronological order (`startAt ASC`).
 *
 * `startAt` / `endAt` are ISO 8601 UTC datetime strings — the FE consumes
 * them via dayjs (CLAUDE.md rule 9) and never instantiates `Date` math by
 * hand. The pair is half-open: `endAt - startAt === durationMinutes[type]`
 * in milliseconds, but `endAt` itself is exclusive.
 *
 * `departmentId` is echoed verbatim from the schedule that produced the
 * slot. The F08 booker MUST pass it back when calling `POST /appointments`
 * — the appointment inherits its `departmentId` from the chosen schedule,
 * NOT from the doctor's primary affiliation.
 */
export interface SlotResponse {
  startAt: string;
  endAt: string;
  departmentId: string;
}
