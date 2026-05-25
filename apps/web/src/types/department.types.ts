/**
 * Department response shapes. Mirrors the BE types in
 * `apps/api/src/departments/departments.types.ts`. Hand-mirrored — a
 * future `packages/shared` workspace will dedupe.
 */

/** Returned by `GET /departments`. */
export interface DepartmentRow {
  id: string;
  name: string;
  description: string | null;
}
