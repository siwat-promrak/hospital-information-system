"use server";

import { revalidatePath } from "next/cache";

import { FE_PATH, FE_PATH_BUILDER } from "@/auth/routes";
import type {
  AppointmentListOrder,
  AppointmentResponse,
  AppointmentStatus,
  CancelAppointmentBody,
  CompleteAppointmentBody,
  CreateAppointmentBody,
  FollowUpAppointmentBody,
  ReferAppointmentWithNoteBody,
} from "@/types/appointment.types";
import type { Paginated } from "@/types/pagination.types";

import {
  cancelAppointment,
  completeAppointment,
  createAppointment,
  followUpAppointment,
  listAppointments,
  referAppointment,
} from "./appointment.api";
import { isApiError } from "./errors";

/**
 * Server actions for the F09 booking wizard + cancel dialog. Wraps the
 * typed `userFetch`-backed API so the client components can call mutations
 * without pulling `server-only` code into the client bundle.
 *
 * Each action revalidates the pages that may render the touched row so
 * the fresh state appears without a full reload. Errors are returned as a
 * discriminated `AppointmentActionResult` because the `ApiError` class
 * loses its prototype crossing the server/client boundary — preserving the
 * `code` / `status` / `details` payload as plain data keeps the consumer's
 * branching logic intact.
 */

export interface AppointmentActionError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type AppointmentActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppointmentActionError };

function toActionError(err: unknown): AppointmentActionError {
  if (isApiError(err)) {
    return {
      status: err.status,
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }

  return {
    status: 0,
    code: "UNKNOWN_ERROR",
    message: err instanceof Error ? err.message : "Unknown error",
  };
}

export async function createAppointmentAction(
  body: CreateAppointmentBody,
): Promise<AppointmentActionResult<AppointmentResponse>> {
  try {
    const created = await createAppointment(body);

    revalidatePath(FE_PATH.APPOINTMENTS);
    revalidatePath(FE_PATH_BUILDER.appointmentDetail(created.id));

    return { ok: true, data: created };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function cancelAppointmentAction(
  id: string,
  body: CancelAppointmentBody,
): Promise<AppointmentActionResult<AppointmentResponse>> {
  try {
    const cancelled = await cancelAppointment(id, body);

    revalidatePath(FE_PATH.APPOINTMENTS);
    revalidatePath(FE_PATH_BUILDER.appointmentDetail(id));

    return { ok: true, data: cancelled };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

/**
 * F18 — mark an appointment as `COMPLETED` with a mandatory clinical note.
 * Surfaces inside `WorkspaceNotePanel` as the doctor's "Complete visit" action.
 * The BE creates the medical-records row in the same transaction.
 */
export async function completeAppointmentAction(
  id: string,
  body: CompleteAppointmentBody,
): Promise<AppointmentActionResult<AppointmentResponse>> {
  try {
    const completed = await completeAppointment(id, body);

    revalidatePath(FE_PATH.APPOINTMENTS);
    revalidatePath(FE_PATH.WORKSPACE);
    revalidatePath(FE_PATH_BUILDER.appointmentDetail(id));

    if (completed.appointmentGroupId) {
      revalidatePath(
        FE_PATH_BUILDER.appointmentGroupDetail(completed.appointmentGroupId),
      );
    }

    return { ok: true, data: completed };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

/**
 * F18 — stamp a referral to another department, including the mandatory
 * clinical note. Surfaces inside `WorkspaceNotePanel` as the doctor's
 * "Refer" action + modal. The BE creates the medical-records row in the
 * same transaction.
 */
export async function referAppointmentAction(
  id: string,
  body: ReferAppointmentWithNoteBody,
): Promise<AppointmentActionResult<AppointmentResponse>> {
  try {
    const referred = await referAppointment(id, body);

    revalidatePath(FE_PATH.APPOINTMENTS);
    revalidatePath(FE_PATH.WORKSPACE);
    revalidatePath(FE_PATH_BUILDER.appointmentDetail(id));
    revalidatePath(FE_PATH.REFERRALS);

    if (referred.appointmentGroupId) {
      revalidatePath(
        FE_PATH_BUILDER.appointmentGroupDetail(referred.appointmentGroupId),
      );
    }

    return { ok: true, data: referred };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

/**
 * F18 — atomically complete the current visit and create a new FOLLOW_UP
 * appointment. Surfaces inside `WorkspaceNotePanel` → `FollowUpDialog`.
 * The BE creates the medical-records row in the same transaction.
 */
export async function followUpAppointmentAction(
  id: string,
  body: FollowUpAppointmentBody,
): Promise<AppointmentActionResult<AppointmentResponse>> {
  try {
    const followed = await followUpAppointment(id, body);

    revalidatePath(FE_PATH.APPOINTMENTS);
    revalidatePath(FE_PATH.WORKSPACE);
    revalidatePath(FE_PATH_BUILDER.appointmentDetail(id));

    if (followed.appointmentGroupId) {
      revalidatePath(
        FE_PATH_BUILDER.appointmentGroupDetail(followed.appointmentGroupId),
      );
    }

    return { ok: true, data: followed };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

interface ListAppointmentsActionArgs {
  page?: number;
  pageSize?: number;
  patientId?: string;
  doctorId?: string;
  departmentId?: string;
  from?: string;
  to?: string;
  status?: AppointmentStatus;
  order?: AppointmentListOrder;
  pendingReferralOnly?: boolean;
  includeReferralsToOwnDepartment?: boolean;
}

/**
 * Server-action wrapper around `listAppointments`. Used by the
 * booking-wizard continuation step (paginated patient-history picker)
 * and any future client surface that needs to drive the appointments
 * list from a `useTransition`. Mirrors the surface area of the API
 * client one-to-one — errors propagate so the consumer can branch on
 * `ApiError.digest` via the global boundary.
 */
export async function listAppointmentsAction(
  args: ListAppointmentsActionArgs,
): Promise<Paginated<AppointmentResponse>> {
  return await listAppointments(args);
}
