/**
 * Module augmentation for NextAuth v5 so `session.user.userId` /
 * `session.user.roleCode` / `session.user.permissionCodes` are typed
 * everywhere (server components, client components, JWT callback).
 *
 * These fields are populated by the `signIn` callback in `src/auth.ts`
 * from the `POST /auth/resolve` response and persisted on the JWT.
 */
import type { DefaultSession, DefaultUser } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

import type { RoleCode } from "@/auth/roles";

declare module "next-auth" {
  interface User extends DefaultUser {
    userId?: string;
    roleCode?: RoleCode | string;
    permissionCodes?: string[];
  }

  interface Session {
    user: {
      userId: string;
      roleCode: RoleCode | string;
      permissionCodes: string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    userId?: string;
    roleCode?: RoleCode | string;
    permissionCodes?: string[];
  }
}
