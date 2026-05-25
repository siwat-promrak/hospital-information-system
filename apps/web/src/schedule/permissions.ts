/**
 * Scope-aware schedule WRITE permission resolver for the unified
 * `/schedules` page. Pairs with `view-mode.ts` (the READ-side resolver) so
 * the UI surface a caller sees in a given `(viewMode, scope)` is consistent
 * with what the BE will accept on the WRITE side.
 *
 * The four view modes (see `view-mode.ts`) collapse to two effective WRITE
 * scopes per surface:
 *
 *  - `ALL` (MRO)                 — surfaces every department's schedules.
 *                                   No "own-department" / "own" affordance
 *                                   makes sense here because the user can
 *                                   see departments they don't belong to;
 *                                   the BE rejects writes via the scope
 *                                   guards. Effectively read-only on this
 *                                   page (a future admin surface may
 *                                   self-grant the codes).
 *  - `DEPT` (NURSE)              — every visible row is in the caller's
 *                                   department. Needs `*.own-department`.
 *  - `OWN` (no seeded role)      — every visible row is the caller's. Needs
 *                                   `*.own`.
 *  - `OWN_PLUS_DEPT` + "mine"    — calendar is pinned to the caller's
 *                                   doctor row. Needs `*.own`.
 *  - `OWN_PLUS_DEPT` + "dept"    — calendar shows every department row.
 *                                   The DOCTOR caller (only `.own`) still
 *                                   gets write affordances — pre-filled +
 *                                   locked to their own doctor row — so
 *                                   they can keep authoring their own
 *                                   schedule from the department surface.
 *                                   A future role with `.own-department`
 *                                   on this sub-mode unlocks the doctor
 *                                   picker (see `createsLockedToCaller`).
 *
 * Returns a granular `{ canCreate, canUpdate, canDelete, createsLockedToCaller }`
 * tuple so each affordance can be gated independently. `createsLockedToCaller`
 * is true when the caller's effective surface only grants `.own` writes —
 * the create dialog pre-fills the doctor field to the caller's own doctor
 * id and disables the picker so the BE never sees a write for a colleague.
 *
 * `canManage` is the legacy aggregate kept for components that take a
 * single boolean.
 */

import { PERMISSION_CODE } from "@/auth/permissions";

import {
  SCHEDULE_SCOPE,
  type ScheduleScope,
} from "@/lib/api/schedule.const";

import { SCHEDULE_VIEW_MODE, type ScheduleViewMode } from "./view-mode";

export interface ScheduleWriteCapabilities {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /**
   * `true` when the caller can only write rows for their own doctor row —
   * the create dialog pre-fills the doctor field and disables the picker.
   * Drives the "locked-to-caller" form mode used by DOCTOR in
   * `OWN_PLUS_DEPT` + "dept" view: they see the create button but the
   * dialog cannot drift off their own doctor / department.
   *
   * `false` when the caller holds wider scope (`.own-department` or `.all`)
   * on the active surface, in which case the doctor picker stays
   * interactive.
   */
  createsLockedToCaller: boolean;
  /** `canCreate || canUpdate || canDelete` — legacy single-flag aggregate. */
  canManage: boolean;
}

const NO_CAPABILITIES: ScheduleWriteCapabilities = {
  canCreate: false,
  canUpdate: false,
  canDelete: false,
  createsLockedToCaller: false,
  canManage: false,
};

interface SurfaceRequirements {
  create: string;
  update: string;
  delete: string;
  /**
   * Optional fallback CRUD verb codes that authorise writes on a NARROWER
   * scope than the surface's natural fit. Used for `OWN_PLUS_DEPT` + "dept"
   * — the surface naturally wants `*.own-department`, but a DOCTOR with
   * only `*.own` should still be able to author their own schedule from
   * this surface (the dialog will lock the doctor picker to the caller).
   *
   * When `fallback` codes are present AND the caller only holds the
   * fallback codes (not the primary codes), the resolver flips
   * `createsLockedToCaller = true`.
   */
  fallback?: {
    create: string;
    update: string;
    delete: string;
  };
}

/**
 * Map a `(viewMode, scope)` pair to the trio of permission codes that gate
 * CREATE / UPDATE / DELETE on the rows the page is currently showing. The
 * scope arg is ONLY consulted for `OWN_PLUS_DEPT` — every other mode has a
 * fixed surface and ignores the scope toggle.
 */
function requiredCodesForSurface(
  viewMode: ScheduleViewMode,
  scope: ScheduleScope,
): SurfaceRequirements | null {
  if (viewMode === SCHEDULE_VIEW_MODE.ALL) {
    // MRO surface — the page shows every department's rows. There is no
    // single scope code that authorises writes across "all" rows today, so
    // the page is effectively read-only here. Return `null` to gate every
    // affordance off.
    return null;
  }

  if (viewMode === SCHEDULE_VIEW_MODE.DEPT) {
    return {
      create: PERMISSION_CODE.SCHEDULE_CREATE_OWN_DEPARTMENT,
      update: PERMISSION_CODE.SCHEDULE_UPDATE_OWN_DEPARTMENT,
      delete: PERMISSION_CODE.SCHEDULE_DELETE_OWN_DEPARTMENT,
    };
  }

  if (viewMode === SCHEDULE_VIEW_MODE.OWN) {
    return {
      create: PERMISSION_CODE.SCHEDULE_CREATE_OWN,
      update: PERMISSION_CODE.SCHEDULE_UPDATE_OWN,
      delete: PERMISSION_CODE.SCHEDULE_DELETE_OWN,
    };
  }

  // `OWN_PLUS_DEPT` — the toggle decides which scope codes apply. "mine"
  // narrows to the caller's own rows (own scope); "dept" widens to every
  // row in the caller's department (own-department scope), with `.own` as
  // a fallback so a DOCTOR caller without `.own-department` can still
  // author their own schedule from the department surface.
  if (scope === SCHEDULE_SCOPE.MINE) {
    return {
      create: PERMISSION_CODE.SCHEDULE_CREATE_OWN,
      update: PERMISSION_CODE.SCHEDULE_UPDATE_OWN,
      delete: PERMISSION_CODE.SCHEDULE_DELETE_OWN,
    };
  }

  return {
    create: PERMISSION_CODE.SCHEDULE_CREATE_OWN_DEPARTMENT,
    update: PERMISSION_CODE.SCHEDULE_UPDATE_OWN_DEPARTMENT,
    delete: PERMISSION_CODE.SCHEDULE_DELETE_OWN_DEPARTMENT,
    fallback: {
      create: PERMISSION_CODE.SCHEDULE_CREATE_OWN,
      update: PERMISSION_CODE.SCHEDULE_UPDATE_OWN,
      delete: PERMISSION_CODE.SCHEDULE_DELETE_OWN,
    },
  };
}

/**
 * Resolve the granular write capability triple for the given
 * `(viewMode, scope)` surface, given the caller's permission codes.
 *
 * A `null` viewMode (caller has no schedule READ permission at all) yields
 * the all-false triple — the page should already short-circuit to a
 * forbidden card before reaching this branch, but the defensive default
 * keeps any future caller honest.
 */
export function resolveScheduleWriteCapabilities(
  viewMode: ScheduleViewMode | null,
  scope: ScheduleScope,
  permissionCodes: readonly string[],
): ScheduleWriteCapabilities {
  if (viewMode === null) {
    return NO_CAPABILITIES;
  }

  const required = requiredCodesForSurface(viewMode, scope);

  if (required === null) {
    return NO_CAPABILITIES;
  }

  const held = new Set(permissionCodes);
  const hasPrimaryCreate = held.has(required.create);
  const hasPrimaryUpdate = held.has(required.update);
  const hasPrimaryDelete = held.has(required.delete);

  const fallbackCreate = required.fallback
    ? held.has(required.fallback.create)
    : false;
  const fallbackUpdate = required.fallback
    ? held.has(required.fallback.update)
    : false;
  const fallbackDelete = required.fallback
    ? held.has(required.fallback.delete)
    : false;

  const canCreate = hasPrimaryCreate || fallbackCreate;
  const canUpdate = hasPrimaryUpdate || fallbackUpdate;
  const canDelete = hasPrimaryDelete || fallbackDelete;

  // The surface naturally wants the primary (wider) scope; the caller
  // only holds the fallback (own). Lock writes to the caller's own row.
  // When the primary code is held the picker stays free.
  const createsLockedToCaller =
    canCreate && !hasPrimaryCreate && fallbackCreate;

  return {
    canCreate,
    canUpdate,
    canDelete,
    createsLockedToCaller,
    canManage: canCreate || canUpdate || canDelete,
  };
}
