/**
 * Service-layer scope resolver for scope-aware permission codes.
 *
 * The PERMISSION catalog encodes scope as a suffix on each code:
 *   - `.own`            — restrict to the caller's own resource (e.g. `Doctor.id`).
 *   - `.own-department` — restrict to `user.departmentId`.
 *   - `.all`            — no narrowing.
 *
 * A user normally holds AT MOST one variant per family (NURSE holds the
 * `.own-department` flavour, MEDICAL_RECORDS_OFFICER holds `.all`, etc.).
 * If a user has been granted both via runtime `role.update`, the
 * resolver prefers the WIDER scope (`.all` > `.own-department` > `.own`)
 * so admins who self-grant cumulative permissions never accidentally
 * narrow their reads.
 *
 * Each `resolve<Family>Scope` returns the effective scope OR `null` when
 * the caller holds none of the family's permissions — the caller should
 * already be gated by `@RequirePermission(...)` at the route level, so
 * `null` here is a programmer error (or a runtime catalog gap) and the
 * service should reject with `403 INSUFFICIENT_PERMISSION`.
 */

import type { AuthenticatedUser } from '../users/users.types';

import { PERMISSION, type PermissionCode } from './permissions';

export const SCOPE = {
  OWN: 'own',
  OWN_DEPARTMENT: 'own-department',
  ALL: 'all',
} as const;

export type Scope = (typeof SCOPE)[keyof typeof SCOPE];

/**
 * Holds at least one of the given permission codes? Used by every scope
 * resolver — the `.all` branch is checked first because broader scopes win.
 */
function holds(user: AuthenticatedUser, code: PermissionCode): boolean {
  return user.permissionCodes.includes(code);
}

/**
 * Resolve the effective appointment-READ scope for the caller. The catalog
 * separates CRUD verbs after the F11-prep refactor, so READ and WRITE
 * scopes are resolved independently.
 */
export function resolveAppointmentReadScope(user: AuthenticatedUser): Scope | null {
  if (holds(user, PERMISSION.APPOINTMENT_READ_ALL)) {
    return SCOPE.ALL;
  }

  if (holds(user, PERMISSION.APPOINTMENT_READ_OWN_DEPARTMENT)) {
    return SCOPE.OWN_DEPARTMENT;
  }

  if (holds(user, PERMISSION.APPOINTMENT_READ_OWN)) {
    return SCOPE.OWN;
  }

  return null;
}

/**
 * Scope for appointment CREATE — `.own` for DOCTOR (self-assigned) and
 * `.own-department` for NURSE. There is no `.all` variant for create.
 */
export function resolveAppointmentCreateScope(user: AuthenticatedUser): Scope | null {
  if (holds(user, PERMISSION.APPOINTMENT_CREATE_OWN_DEPARTMENT)) {
    return SCOPE.OWN_DEPARTMENT;
  }

  if (holds(user, PERMISSION.APPOINTMENT_CREATE_OWN)) {
    return SCOPE.OWN;
  }

  return null;
}

/**
 * Scope for appointment UPDATE — `.own` for DOCTOR, `.own-department` for
 * NURSE. No `.all` variant.
 */
export function resolveAppointmentUpdateScope(user: AuthenticatedUser): Scope | null {
  if (holds(user, PERMISSION.APPOINTMENT_UPDATE_OWN_DEPARTMENT)) {
    return SCOPE.OWN_DEPARTMENT;
  }

  if (holds(user, PERMISSION.APPOINTMENT_UPDATE_OWN)) {
    return SCOPE.OWN;
  }

  return null;
}

/**
 * Scope for appointment DELETE — `.own` for DOCTOR, `.own-department` for
 * NURSE. No `.all` variant.
 */
export function resolveAppointmentDeleteScope(user: AuthenticatedUser): Scope | null {
  if (holds(user, PERMISSION.APPOINTMENT_DELETE_OWN_DEPARTMENT)) {
    return SCOPE.OWN_DEPARTMENT;
  }

  if (holds(user, PERMISSION.APPOINTMENT_DELETE_OWN)) {
    return SCOPE.OWN;
  }

  return null;
}

/**
 * Compat wrapper used by F07 slot finder — slot-finder gating mirrors
 * the CREATE permission, so it delegates to `resolveAppointmentCreateScope`.
 */
export function resolveAppointmentWriteScope(user: AuthenticatedUser): Scope | null {
  return resolveAppointmentCreateScope(user);
}

/**
 * Scope for schedule READ — DOCTOR holds `.own` (and `.own-department`
 * for cross-coverage context), NURSE holds `.own-department`,
 * MEDICAL_RECORDS_OFFICER holds `.all`. Returns the widest scope.
 */
export function resolveScheduleReadScope(user: AuthenticatedUser): Scope | null {
  if (holds(user, PERMISSION.SCHEDULE_READ_ALL)) {
    return SCOPE.ALL;
  }

  if (holds(user, PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT)) {
    return SCOPE.OWN_DEPARTMENT;
  }

  if (holds(user, PERMISSION.SCHEDULE_READ_OWN)) {
    return SCOPE.OWN;
  }

  return null;
}

/**
 * Scope for schedule CREATE — DOCTOR holds `.own`, NURSE holds
 * `.own-department`. No `.all` variant.
 */
export function resolveScheduleCreateScope(user: AuthenticatedUser): Scope | null {
  if (holds(user, PERMISSION.SCHEDULE_CREATE_OWN_DEPARTMENT)) {
    return SCOPE.OWN_DEPARTMENT;
  }

  if (holds(user, PERMISSION.SCHEDULE_CREATE_OWN)) {
    return SCOPE.OWN;
  }

  return null;
}

/**
 * Scope for schedule UPDATE — DOCTOR holds `.own`, NURSE holds
 * `.own-department`. No `.all` variant.
 */
export function resolveScheduleUpdateScope(user: AuthenticatedUser): Scope | null {
  if (holds(user, PERMISSION.SCHEDULE_UPDATE_OWN_DEPARTMENT)) {
    return SCOPE.OWN_DEPARTMENT;
  }

  if (holds(user, PERMISSION.SCHEDULE_UPDATE_OWN)) {
    return SCOPE.OWN;
  }

  return null;
}

/**
 * Scope for schedule DELETE — DOCTOR holds `.own`, NURSE holds
 * `.own-department`. No `.all` variant.
 */
export function resolveScheduleDeleteScope(user: AuthenticatedUser): Scope | null {
  if (holds(user, PERMISSION.SCHEDULE_DELETE_OWN_DEPARTMENT)) {
    return SCOPE.OWN_DEPARTMENT;
  }

  if (holds(user, PERMISSION.SCHEDULE_DELETE_OWN)) {
    return SCOPE.OWN;
  }

  return null;
}

/**
 * Resolve the effective schedule scope for the caller — convenience helper
 * that picks the widest scope across READ / CREATE / UPDATE / DELETE.
 *
 * Used by the schedule scope guard (`schedule.scope.ts`) which gates both
 * list / detail and mutation paths. For per-operation precision the
 * resolver-per-verb helpers above should be preferred.
 */
export function resolveScheduleScope(user: AuthenticatedUser): Scope | null {
  const candidates: ReadonlyArray<Scope | null> = [
    resolveScheduleReadScope(user),
    resolveScheduleCreateScope(user),
    resolveScheduleUpdateScope(user),
    resolveScheduleDeleteScope(user),
  ];

  if (candidates.includes(SCOPE.ALL)) {
    return SCOPE.ALL;
  }

  if (candidates.includes(SCOPE.OWN_DEPARTMENT)) {
    return SCOPE.OWN_DEPARTMENT;
  }

  if (candidates.includes(SCOPE.OWN)) {
    return SCOPE.OWN;
  }

  return null;
}

