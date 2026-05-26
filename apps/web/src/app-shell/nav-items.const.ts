import { FE_PATH } from "@/auth/routes";
import { PERMISSION_CODE } from "@/auth/permissions";
import { K } from "@/i18n/keys.generated";

import type { NavItem } from "./nav-items.types";

/**
 * Icon registry — keys are stable string codes, values are looked up at
 * render time in `AppSidebar`'s icon map. Kept as plain strings so this
 * module stays free of `@mui/icons-material` imports.
 */
export const NAV_ICON = {
  DASHBOARD: "dashboard",
  DEPARTMENTS: "departments",
  DOCTORS: "doctors",
  SCHEDULES: "schedules",
  MEDICAL_RECORDS: "medical_records",
  APPOINTMENTS: "appointments",
  APPOINTMENTS_NEW: "appointments_new",
  PATIENTS_NEW: "patients_new",
} as const;

/**
 * Canonical sidebar navigation catalog. Adding a new menu item is a
 * single-edit change here — the sidebar reads this catalog rather than
 * hand-listing items in JSX.
 *
 * Items use `permission` (any-of semantics) to control visibility:
 *   - `permission` is an array — at least one held code shows the item.
 *
 * `requireRoles` is also supported but currently unused — permission codes
 * are the canonical gate post-consolidation.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: "dashboard",
    href: FE_PATH.HOME,
    iconName: NAV_ICON.DASHBOARD,
    i18nKey: K.Nav.items.dashboard,
  },
  {
    id: "departments",
    href: FE_PATH.DEPARTMENTS,
    iconName: NAV_ICON.DEPARTMENTS,
    i18nKey: K.Nav.items.departments,
    // Departments is a catalog-like directory view — gated on the same
    // doctor-read capability that powers the rest of the directory pages.
    permission: [PERMISSION_CODE.DOCTOR_READ],
  },
  {
    id: "doctors",
    href: FE_PATH.DOCTORS,
    iconName: NAV_ICON.DOCTORS,
    i18nKey: K.Nav.items.doctors,
    permission: [PERMISSION_CODE.DOCTOR_READ],
  },
  {
    id: "schedules",
    href: FE_PATH.SCHEDULES,
    iconName: NAV_ICON.SCHEDULES,
    i18nKey: K.Nav.items.schedules,
    // Unified permission-aware page — DOCTOR / NURSE / MRO all land here.
    // The page itself adapts its UI (legend, filters, "Show mine" toggle)
    // based on which scope permission(s) the caller holds.
    permission: [
      PERMISSION_CODE.SCHEDULE_READ_OWN,
      PERMISSION_CODE.SCHEDULE_READ_OWN_DEPARTMENT,
      PERMISSION_CODE.SCHEDULE_READ_ALL,
    ],
  },
  {
    id: "medical-records",
    href: FE_PATH.MEDICAL_RECORDS,
    iconName: NAV_ICON.MEDICAL_RECORDS,
    i18nKey: K.Nav.items.medicalRecords,
    // DOCTOR / NURSE / MRO / PHARMACY all see this entry once their role
    // includes the read-all permission. ADMIN never holds it, so the entry
    // stays out of the admin sidebar.
    permission: [PERMISSION_CODE.MEDICAL_RECORDS_READ_ALL],
  },
  {
    id: "appointments",
    href: FE_PATH.APPOINTMENTS,
    iconName: NAV_ICON.APPOINTMENTS,
    i18nKey: K.Nav.items.appointments,
    // DOCTOR / NURSE / MRO all hold an `appointment.read.*` scope —
    // PHARMACY does not in the seeded baseline so the entry stays out
    // of their sidebar.
    permission: [
      PERMISSION_CODE.APPOINTMENT_READ_OWN,
      PERMISSION_CODE.APPOINTMENT_READ_OWN_DEPARTMENT,
      PERMISSION_CODE.APPOINTMENT_READ_ALL,
    ],
  },
  {
    id: "appointments-new",
    href: FE_PATH.APPOINTMENTS_NEW,
    iconName: NAV_ICON.APPOINTMENTS_NEW,
    i18nKey: K.Nav.items.appointmentsNew,
    // DOCTOR (`.own`) + NURSE (`.own-department`) can book. MRO and
    // PHARMACY don't hold a create code in the seeded baseline.
    permission: [
      PERMISSION_CODE.APPOINTMENT_CREATE_OWN,
      PERMISSION_CODE.APPOINTMENT_CREATE_OWN_DEPARTMENT,
    ],
  },
  {
    id: "patients-new",
    href: FE_PATH.PATIENTS_NEW,
    iconName: NAV_ICON.PATIENTS_NEW,
    i18nKey: K.Nav.items.patientsNew,
    // NURSE + MRO hold `patient.create` in the seeded baseline.
    permission: [PERMISSION_CODE.PATIENT_CREATE],
  },
];
