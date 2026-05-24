import type { RoleCode } from "@/auth/roles";

/**
 * Successful `POST /auth/resolve` payload (mirrors `ResolveResponseDto`
 * on the BE). The FE writes `userId` / `roleCode` / `permissionCodes`
 * into the session JWT so server components can read them without a
 * per-request backend round-trip.
 */
export interface ResolveSuccess {
  userId: string;
  roleCode: RoleCode | string;
  permissionCodes: string[];
}

export interface ResolveRequest {
  email: string;
  googleSub: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}
