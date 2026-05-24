/**
 * Mapping from URL path segments (after the locale prefix is stripped) to
 * i18n leaf keys under `NS.Breadcrumb`. Static segments resolve here; for
 * dynamic segments (`[id]`), the page passes a `labelOverrides` map keyed
 * by position-index when rendering the breadcrumb so the runtime label
 * (e.g. a doctor's name) replaces the raw uuid.
 */

import { K } from "@/i18n/keys.generated";

export const BREADCRUMB_SEGMENT_LABEL = {
  admin: K.Breadcrumb.admin,
  staff: K.Breadcrumb.staff,
  me: K.Breadcrumb.me,
  schedule: K.Breadcrumb.schedule,
  departments: K.Breadcrumb.departments,
  doctors: K.Breadcrumb.doctors,
} as const;

export type BreadcrumbSegment = keyof typeof BREADCRUMB_SEGMENT_LABEL;
export type BreadcrumbKey =
  (typeof BREADCRUMB_SEGMENT_LABEL)[BreadcrumbSegment];

export function isBreadcrumbSegment(value: string): value is BreadcrumbSegment {
  return value in BREADCRUMB_SEGMENT_LABEL;
}
