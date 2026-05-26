/**
 * Shared formatting helpers for `AppointmentResponse` rows. Centralises
 * the "doctor / patient full name" rendering so list / detail / wizard
 * surfaces agree on the same shape.
 *
 * The BE emits a structured ref (`firstNameEn`, `lastNameEn`, optional
 * `firstNameTh` / `lastNameTh`) — these helpers concatenate per the
 * conventions used elsewhere in the directory pages: English name is the
 * primary display, Thai name (when present) is appended in parentheses
 * for disambiguation.
 */

import type {
  AppointmentDoctorRef,
  AppointmentPatientRef,
} from "@/types/appointment.types";
import type { PatientResponse } from "@/types/patient.types";

export function formatPatientFullName(
  patient: Pick<
    PatientResponse | AppointmentPatientRef,
    "firstNameEn" | "lastNameEn" | "firstNameTh" | "lastNameTh"
  >,
): string {
  const en = `${patient.firstNameEn} ${patient.lastNameEn}`.trim();

  if (patient.firstNameTh || patient.lastNameTh) {
    const th = `${patient.firstNameTh ?? ""} ${patient.lastNameTh ?? ""}`
      .trim();

    if (th.length > 0) {
      return `${en} (${th})`;
    }
  }

  return en;
}

export function formatDoctorFullName(
  doctor: Pick<AppointmentDoctorRef, "firstNameEn" | "lastNameEn">,
): string {
  return `${doctor.firstNameEn} ${doctor.lastNameEn}`.trim();
}
