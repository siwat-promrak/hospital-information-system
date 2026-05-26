/**
 * Appointment-group + referral response shapes (F14). Mirrors the BE
 * wire DTOs in `apps/api/src/appointment-groups/dto/`. Hand-mirrored
 * until a future `packages/shared` workspace dedupes.
 *
 * Vocabulary note: the feature is "referrals" (renamed from "transfers"
 * in commit 2b05fa7). Column names, error codes, endpoint paths, and
 * route names all carry the `refer` / `referral` / `referredTo` shape.
 *
 * Timestamps are ISO 8601 UTC datetime strings — consume via dayjs
 * (CLAUDE.md rule 9) and never instantiate `Date` math by hand.
 */

import type { AppointmentStatus } from "@/types/appointment.types";

/**
 * `GET /appointment-groups?status=` accepts three values:
 *   - `open`   — groups whose latest visit is `BOOKED` (no close action yet).
 *   - `closed` — groups whose `closedAt` is non-null.
 *   - `all`    — both, mixed by `openedAt DESC`.
 *
 * Mirrored verbatim from `APPOINTMENT_GROUP_STATUS` in
 * `apps/web/src/lib/api/appointment-group.const.ts` so the wire string and the
 * type alias never drift.
 */
export type AppointmentGroupStatus = "open" | "closed" | "all";

/**
 * Thin "latest visit" reference embedded in every list row. The list page
 * uses this to render "Most recent: {date} · {dept} · {doctor}" without a
 * follow-up fetch per row.
 */
export interface AppointmentGroupLatestVisit {
  /** ISO 8601 UTC. */
  startAt: string;
  departmentName: string;
  doctorName: string;
}

/**
 * One row in `GET /appointment-groups` (paginated). The detail page
 * fleshes this out with the full ordered `appointments` array.
 */
export interface AppointmentGroupRow {
  id: string;
  patientId: string;
  /** ISO 8601 UTC. */
  openedAt: string;
  /** ISO 8601 UTC; `null` when the group is still open. */
  closedAt: string | null;
  /**
   * Number of appointments in the group (cancelled + active). The chip
   * copy on the list row reads "{memberCount} visits".
   */
  memberCount: number;
  /**
   * Most-recent visit summary — the BE picks the row with the latest
   * `startAt` and embeds the trio of fields the list row renders.
   */
  latestVisit: AppointmentGroupLatestVisit;
}

/**
 * Per-appointment reference embedded in `GET /appointment-groups/:id`.
 * Each row carries enough context to render a timeline item without an
 * extra `GET /appointments/:id` per row.
 *
 *  - `visitNumber` — 1-indexed position within the group, in `startAt` order.
 *  - `referredToDepartmentId` — non-null when this visit triggered a
 *    referral to another department. The detail page badges these rows
 *    so the case lineage reads visually.
 *  - `referralFulfilledByAppointmentId` — non-null when a downstream
 *    visit in the group fulfilled the referral. Lets the page link the
 *    referral row to its follow-up.
 */
export interface AppointmentGroupMemberRow {
  id: string;
  visitNumber: number;
  /** ISO 8601 UTC. */
  startAt: string;
  /** ISO 8601 UTC. */
  endAt: string;
  status: AppointmentStatus;
  department: {
    id: string;
    name: string;
  };
  doctor: {
    id: string;
    firstNameEn: string;
    lastNameEn: string;
  };
  referredToDepartmentId: string | null;
  referralFulfilledByAppointmentId: string | null;
}

/**
 * Response of `GET /appointment-groups/:id`. List row fields + the
 * chronological `appointments` array.
 */
export interface AppointmentGroupDetailRow extends AppointmentGroupRow {
  appointments: AppointmentGroupMemberRow[];
}

/**
 * Request body for `POST /appointments/:id/refer`. The BE re-validates
 * the target department against the appointment's group invariants and
 * the caller's update scope.
 */
export interface ReferAppointmentBody {
  toDepartmentId: string;
}
