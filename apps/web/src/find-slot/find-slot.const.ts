/**
 * URL contract for the F15 `/find-slot` page. Query-param names live here
 * (CLAUDE.md rule 2b — no magic strings) so the page server-component,
 * the filter card, the scope toggle, and the "Book this slot" CTA all
 * reach for the same catalog.
 *
 * Mirrors the read-only side of `BookingWizardPage`'s deep-link surface —
 * the CTA navigates to `/appointments/new?doctorScheduleId=…&startAt=…
 * &appointmentType=…&departmentId=…`, so those four query-param names
 * also live here (a rename surfaces on both producers and consumers).
 */

/**
 * Filter / scope params owned by the `/find-slot` page itself.
 */
export const FIND_SLOT_QUERY_PARAM = {
  /** OWN_PLUS_DEPT-only scope toggle. Values are `FIND_SLOT_SCOPE.*`. */
  SCOPE: "scope",
  /** Effective department filter (ALL mode only — pinned otherwise). */
  DEPARTMENT_ID: "departmentId",
  /**
   * Doctor filter. Visible in ALL, DEPT, and OWN_PLUS_DEPT + dept;
   * omitted from the BE call to trigger the multi-doctor merge.
   */
  DOCTOR_ID: "doctorId",
  /** Required — `AppointmentType` code. Search stays disabled until set. */
  TYPE: "type",
  /** Required — `YYYY-MM-DD` local date (defaults to today). */
  DATE: "date",
} as const;

export type FindSlotQueryParam =
  (typeof FIND_SLOT_QUERY_PARAM)[keyof typeof FIND_SLOT_QUERY_PARAM];

/**
 * Values for the OWN_PLUS_DEPT scope toggle. Mirrors `SCHEDULE_SCOPE` from
 * the F06 schedule page so a DOCTOR's "show mine" preference reads the
 * same way on both pages.
 */
export const FIND_SLOT_SCOPE = {
  MINE: "mine",
  DEPT: "dept",
} as const;

export type FindSlotScope =
  (typeof FIND_SLOT_SCOPE)[keyof typeof FIND_SLOT_SCOPE];

/**
 * Query-param catalog for the deep-link the "Book this slot" CTA produces
 * (target: `/appointments/new`). The booking page server-component reads
 * these params verbatim and threads them into `BookingWizard` as the
 * `prefilledSlot` prop, locking each input to the picked tuple.
 *
 * `previousAppointmentId` already exists on the booking page (F14
 * referrals queue deep-link) — it lives next to these so a single grep of
 * the file shows every accepted query param on `/appointments/new`.
 */
export const BOOKING_DEEP_LINK_PARAM = {
  /** Provenance — the schedule the slot belongs to. Threaded into the
   * BE's `POST /appointments` payload so `Appointment.scheduleId` is
   * populated and the transactional re-check loads the row by id. */
  DOCTOR_SCHEDULE_ID: "doctorScheduleId",
  /** Picked slot's `startAt` (ISO 8601 UTC). */
  START_AT: "startAt",
  /** Picked slot's appointment type (`AppointmentType` code). */
  APPOINTMENT_TYPE: "appointmentType",
  /** Picked slot's department id. */
  DEPARTMENT_ID: "departmentId",
} as const;

export type BookingDeepLinkParam =
  (typeof BOOKING_DEEP_LINK_PARAM)[keyof typeof BOOKING_DEEP_LINK_PARAM];
