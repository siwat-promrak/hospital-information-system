/**
 * Catch-all route handler exposing NextAuth's HTTP endpoints
 * (`/api/auth/signin`, `/api/auth/callback/google`, `/api/auth/session`,
 * `/api/auth/signout`, …). All actual logic lives in `src/auth.ts`.
 */
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
