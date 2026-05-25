import type { RoleCode } from "@/auth/roles";

/**
 * Successful `POST /auth/resolve` payload (mirrors `ResolveResponseDto`
 * on the BE). The FE writes `userId` / `roleCode` / `permissionCodes` /
 * `departmentId` into the session JWT so server components can read them
 * without a per-request backend round-trip.
 *
 * `departmentId` is `null` for org-wide roles (ADMIN, MEDICAL_RECORDS_OFFICER,
 * PHARMACY) and a valid uuid for department-scoped roles (DOCTOR, NURSE).
 */
export interface ResolveSuccess {
  userId: string;
  roleCode: RoleCode | string;
  permissionCodes: string[];
  departmentId: string | null;
}

export interface ResolveRequest {
  email: string;
  googleSub: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

/**
 * Thin clinical-record reference returned by `GET /me`. Mirrors
 * `MeDoctorRefDto` on the BE. Only DOCTOR users carry a non-null `doctor`
 * field — every other role returns `null`.
 *
 * The FE consumes this on the unified `/schedules` page to discover the
 * caller's `Doctor.id` so the "Show mine" toggle (mode `own+dept`) can
 * filter the calendar to the caller's own rows. The session JWT does NOT
 * carry `doctorId` today — derive it from `GET /me` instead of stuffing it
 * into the JWT (the JWT is forwarded to the BE on every request, and we
 * want to keep its surface area minimal).
 */
export interface MeDoctorRef {
  id: string;
  departmentId: string;
}

/**
 * `GET /me` response. Mirrors `MeResponseDto` on the BE (which itself
 * mirrors `AuthenticatedUser`). FE consumers care about a subset of fields
 * today; the type lists everything the BE emits so a future surface can
 * use it without re-typing.
 */
export interface MeResponse {
  id: string;
  email: string;
  roleId: string;
  roleCode: RoleCode | string;
  firstNameEn: string;
  lastNameEn: string;
  firstNameTh: string | null;
  lastNameTh: string | null;
  picture: string | null;
  departmentId: string | null;
  permissionCodes: string[];
  doctor: MeDoctorRef | null;
}
