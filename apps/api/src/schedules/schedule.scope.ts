import { AppException } from '../common/app-exception';
import { ErrorCode } from '../common/errors';
import {
  resolveScheduleCreateScope,
  resolveScheduleDeleteScope,
  resolveScheduleReadScope,
  resolveScheduleUpdateScope,
  SCOPE,
  type Scope,
} from '../auth/scope';
import { PERMISSION, type PermissionCode } from '../auth/permissions';
import type { AuthenticatedUser } from '../users/users.types';

import { SCHEDULE_VERB, type ScheduleVerb } from './schedule.scope.const';

/**
 * Service-layer scope guard for F06 doctor schedules.
 *
 * Scope semantics are driven by the caller's permission code (post the
 * CRUD-verb catalog refactor):
 *  - `schedule.{read,create,update,delete}.own`             (DOCTOR)
 *    → restrict to own `Doctor.id`.
 *  - `schedule.{read,create,update,delete}.own-department`  (NURSE)
 *    → restrict to schedules whose `User.departmentId === caller.departmentId`.
 *  - `schedule.read.all`                                    (MEDICAL_RECORDS_OFFICER)
 *    → no narrowing on reads; the only `.all` variant in the family.
 *
 * Failure throws `403 INSUFFICIENT_PERMISSION_SCOPE` — different error
 * code from the route-permission rejection (`INSUFFICIENT_PERMISSION`) so
 * the FE can distinguish "you don't have this permission at all" from "you
 * have it but only for your own data".
 *
 * IMPORTANT: scope resolution MUST be per-verb. A DOCTOR holds BOTH
 * `schedule.read.own` AND `schedule.read.own-department` (for cross-coverage
 * visibility) but only `schedule.create.own` / `schedule.update.own` /
 * `schedule.delete.own` on writes. A combined "widest scope across all
 * verbs" resolver would let a DOCTOR create schedules for ANY doctor in
 * their department, which violates the catalog. The list endpoint reads
 * the read-scope explicitly; the mutation endpoints (create / update /
 * delete) pass the verb so the write-side scope is used.
 *
 * A DOCTOR user without a linked `Doctor` row is a data-integrity bug
 * (see F02 invariants) — we still reject with the same code so the API
 * fails closed.
 */

/**
 * Map from a write verb to the matching scope resolver. Defined as a
 * frozen lookup so the `assertCanActOnDoctor` callsite reads as a single
 * dispatch rather than a `switch`.
 */
const WRITE_VERB_RESOLVERS: Readonly<
  Record<ScheduleVerb, (user: AuthenticatedUser) => Scope | null>
> = {
  [SCHEDULE_VERB.READ]: resolveScheduleReadScope,
  [SCHEDULE_VERB.CREATE]: resolveScheduleCreateScope,
  [SCHEDULE_VERB.UPDATE]: resolveScheduleUpdateScope,
  [SCHEDULE_VERB.DELETE]: resolveScheduleDeleteScope,
};

/**
 * Map from a write verb to the `own-department` permission code that the
 * caller WOULD need in order to broaden their scope past `.own`. Used to
 * populate the `details.required` array on `INSUFFICIENT_PERMISSION_SCOPE`
 * responses so the FE can render a precise hint.
 */
const OWN_DEPARTMENT_PERMISSION_BY_VERB: Readonly<Record<ScheduleVerb, PermissionCode>> = {
  [SCHEDULE_VERB.READ]: PERMISSION.SCHEDULE_READ_OWN_DEPARTMENT,
  [SCHEDULE_VERB.CREATE]: PERMISSION.SCHEDULE_CREATE_OWN_DEPARTMENT,
  [SCHEDULE_VERB.UPDATE]: PERMISSION.SCHEDULE_UPDATE_OWN_DEPARTMENT,
  [SCHEDULE_VERB.DELETE]: PERMISSION.SCHEDULE_DELETE_OWN_DEPARTMENT,
};

/**
 * `true` iff the caller's effective READ scope is restricted to a single
 * doctor (i.e. holds `schedule.read.own` and NOT the wider variants).
 * Used by `list` / `getById` which gate on READ permissions.
 */
export function isDoctorScoped(user: AuthenticatedUser): boolean {
  return resolveScheduleReadScope(user) === SCOPE.OWN;
}

/**
 * Returns the `doctorId` a `.own`-scoped READER is restricted to, or
 * `null` for `.own-department` / `.all` callers. Throws if the caller is
 * `.own`-scoped but somehow lacks a linked `Doctor` row.
 */
export function getScopedDoctorId(user: AuthenticatedUser): string | null {
  if (!isDoctorScoped(user)) {
    return null;
  }

  if (!user.doctor) {
    throw AppException.forbidden(
      ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
      'DOCTOR user is missing a linked Doctor record.',
    );
  }

  return user.doctor.id;
}

/**
 * Returns the `departmentId` a `.own-department`-scoped READER is
 * restricted to, or `null` if the caller does not hold the
 * `.own-department` scope (either narrower `.own` or wider `.all`).
 * Throws when the caller holds the scope but has no `User.departmentId`
 * (data-integrity bug).
 */
export function getScopedDepartmentId(user: AuthenticatedUser): string | null {
  const scope: Scope | null = resolveScheduleReadScope(user);

  if (scope !== SCOPE.OWN_DEPARTMENT) {
    return null;
  }

  if (user.departmentId === null) {
    throw AppException.forbidden(
      ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
      'Caller has no department assigned and cannot use own-department scope.',
    );
  }

  return user.departmentId;
}

/**
 * Assert the caller is allowed to act on a row owned by `targetDoctorId`
 * for the given write `verb` (CREATE / UPDATE / DELETE — not READ; reads
 * are gated by `getScopedDoctorId` / `getScopedDepartmentId` directly).
 *
 * Scope resolution is per-verb so a caller holding `schedule.read.own-department`
 * (which DOCTOR does for cross-coverage visibility) does NOT accidentally
 * grant department-wide write authority.
 *
 *  - `.own` scope: the target doctor's id must equal `caller.doctor.id`.
 *  - `.own-department` scope: the target doctor's department must equal
 *    the caller's `User.departmentId`. The caller MUST pass
 *    `targetDepartmentId` (the schedule row already carries it, and the
 *    create DTO supplies it explicitly).
 *
 * Failures throw `403 INSUFFICIENT_PERMISSION_SCOPE` with details that
 * encode the hint code the FE should surface
 * (`schedule.<verb>.own-department`), the resolved caller scope, and the
 * conflicting ids.
 */
export function assertCanActOnDoctor(
  user: AuthenticatedUser,
  verb: ScheduleVerb,
  targetDoctorId: string,
  targetDepartmentId: string,
): void {
  const resolver = WRITE_VERB_RESOLVERS[verb];
  const scope = resolver(user);
  const ownDepartmentPermission = OWN_DEPARTMENT_PERMISSION_BY_VERB[verb];

  if (scope === SCOPE.ALL) {
    return;
  }

  if (scope === SCOPE.OWN_DEPARTMENT) {
    if (user.departmentId === null) {
      throw AppException.forbidden(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
        'Caller has no department assigned and cannot use own-department scope.',
      );
    }

    if (user.departmentId !== targetDepartmentId) {
      throw AppException.forbidden(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
        'Caller may only manage schedules within their own department.',
        {
          required: [ownDepartmentPermission],
          scope: SCOPE.OWN_DEPARTMENT,
          callerDepartmentId: user.departmentId,
          requestedDepartmentId: targetDepartmentId,
        },
      );
    }

    return;
  }

  if (scope === SCOPE.OWN) {
    if (!user.doctor) {
      throw AppException.forbidden(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
        'DOCTOR user is missing a linked Doctor record.',
      );
    }

    if (user.doctor.id !== targetDoctorId) {
      throw AppException.forbidden(
        ErrorCode.INSUFFICIENT_PERMISSION_SCOPE,
        'DOCTOR users may only manage their own schedules.',
        {
          required: [ownDepartmentPermission],
          scope: SCOPE.OWN,
          requestedDoctorId: targetDoctorId,
          ownDoctorId: user.doctor.id,
        },
      );
    }

    return;
  }

  // Route guard already required at least one verb permission — defensive
  // fail-closed for an unexpected catalog gap.
  throw AppException.forbidden(
    ErrorCode.INSUFFICIENT_PERMISSION,
    'Caller is missing the required permission(s).',
  );
}
