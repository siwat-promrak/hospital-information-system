"use server";

import type { DoctorListRow } from "@/types/doctor.types";
import type { Paginated } from "@/types/pagination.types";

import { listDoctors } from "./doctor.api";

/**
 * Server-action wrapper around `listDoctors`. The schedule form dialog
 * runs in the client and cannot call `userFetch` directly — that helper is
 * `server-only` and forwards the session cookie via `next/headers`, which
 * isn't available in the browser. Exposing the same call as a server
 * action keeps cookie-authenticated paging inside the React server runtime
 * while letting the dialog drive it from a `useTransition`.
 *
 * Mirrors the limited subset the dialog needs — pagination + department
 * filter. Search-by-query is intentionally NOT in this surface: the BE
 * doesn't yet accept `?q=` on `/doctors`, so search remains client-side
 * over loaded rows. Adding `?q=` is the proper fix and a documented
 * follow-up.
 */

interface LoadDoctorsPageArgs {
  page: number;
  pageSize: number;
  departmentId?: string;
}

export async function loadDoctorsPageAction(
  args: LoadDoctorsPageArgs,
): Promise<Paginated<DoctorListRow>> {
  return await listDoctors(args);
}
