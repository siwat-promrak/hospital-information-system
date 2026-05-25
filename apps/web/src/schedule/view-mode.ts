/**
 * View-mode resolver for the unified `/schedules` page.
 *
 * The page adapts its UI shape (legend / filter combo / "Show mine" toggle)
 * based on which scope-aware schedule-READ permission(s) the caller holds.
 * The precedence rule mirrors the BE's `resolveScheduleReadScope` — the
 * WIDEST scope wins (`.all` > `.own-department` > `.own`) — with one
 * additional discriminator: a caller who holds BOTH `.own-department` AND
 * `.own` (the seeded DOCTOR role) gets a dedicated `OWN_PLUS_DEPT` mode so
 * the UI can render a "Show mine" toggle alongside the department view.
 *
 * Returns `null` when the caller holds no schedule READ permission — the
 * page short-circuits to a forbidden card in that case (it should never
 * happen in practice because the sidebar already gates the entry on the
 * same any-of permission list).
 */
import { PERMISSION_CODE } from "@/auth/permissions";

/**
 * Discriminator catalog for the four UI variants of `/schedules`:
 *
 *  - `ALL`           — MRO: department legend + department filter + every
 *                       schedule across every department.
 *  - `OWN_PLUS_DEPT` — DOCTOR: toggle ("Show mine" / "Show department").
 *                       When on "department", a doctor filter appears.
 *  - `DEPT`          — NURSE: doctor filter only; BE auto-narrows to the
 *                       caller's department.
 *  - `OWN`           — theoretical role with only `.own` (no seeded role
 *                       today): no filter, BE auto-narrows to caller's
 *                       doctor.
 *
 * Stored as named constants (CLAUDE.md rule 2b — no magic discriminator
 * strings) so a rename of any variant surfaces as a build error at every
 * call site.
 */
export const SCHEDULE_VIEW_MODE = {
  ALL: "all",
  OWN_PLUS_DEPT: "own+dept",
  DEPT: "dept",
  OWN: "own",
} as const;

export type ScheduleViewMode =
  (typeof SCHEDULE_VIEW_MODE)[keyof typeof SCHEDULE_VIEW_MODE];

/**
 * Resolve the view mode from the caller's permission codes. Returns `null`
 * when the caller holds no schedule READ permission at all.
 *
 * Precedence (matches the BE's `resolveScheduleReadScope` widest-wins
 * rule, with `OWN_PLUS_DEPT` as a dedicated DOCTOR-only fork inserted
 * between `ALL` and `DEPT`):
 *   `ALL` > `OWN_PLUS_DEPT` > `DEPT` > `OWN`
 */
export function resolveScheduleViewMode(
  permissionCodes: readonly string[],
): ScheduleViewMode | null {
  if (permissionCodes.includes(PERMISSION_CODE.SCHEDULE_READ_ALL)) {
    return SCHEDULE_VIEW_MODE.ALL;
  }

  const hasOwnDept = permissionCodes.includes(
    PERMISSION_CODE.SCHEDULE_READ_OWN_DEPARTMENT,
  );
  const hasOwn = permissionCodes.includes(PERMISSION_CODE.SCHEDULE_READ_OWN);

  if (hasOwnDept && hasOwn) {
    return SCHEDULE_VIEW_MODE.OWN_PLUS_DEPT;
  }

  if (hasOwnDept) {
    return SCHEDULE_VIEW_MODE.DEPT;
  }

  if (hasOwn) {
    return SCHEDULE_VIEW_MODE.OWN;
  }

  return null;
}
