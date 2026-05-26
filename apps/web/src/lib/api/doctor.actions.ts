"use server";

import type { PaginatedListInitial } from "@/lib/hooks/use-paginated-list";
import type { DoctorListRow } from "@/types/doctor.types";
import type { Paginated } from "@/types/pagination.types";

import { listDoctors } from "./doctor.api";
import { DOCTOR_INFINITE_SCROLL_PAGE_SIZE } from "./doctor.const";
import { DEFAULT_PAGE } from "./pagination.const";

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

interface FetchDoctorPickerSeedArgs {
  departmentId?: string;
}

/**
 * SSR helper that pages 1 of doctors in the shape the `<DoctorSelect>`
 * entity wrapper consumes (`PaginatedListInitial<DoctorListRow>` — the
 * `data` / `page` / `total` triplet that seeds `usePaginatedList`).
 *
 * Pages can fetch this once at the top of their server component and
 * pass the result through as a single `doctorSeed` prop, instead of
 * threading `doctors` + `doctorsTotal` + `initialDoctorPage` separately
 * through every consumer. Optional — call sites that don't pass a seed
 * (modals opened below the fold, picker call sites where SSR doesn't
 * help) let `<DoctorSelect>` populate via its `autoFetchFirstPage` opt-in
 * on mount.
 */
export async function fetchDoctorPickerSeed(
  args: FetchDoctorPickerSeedArgs,
): Promise<PaginatedListInitial<DoctorListRow>> {
  const result = await listDoctors({
    page: DEFAULT_PAGE,
    pageSize: DOCTOR_INFINITE_SCROLL_PAGE_SIZE,
    departmentId: args.departmentId,
  });

  return {
    data: result.data,
    page: result.page,
    total: result.total,
  };
}
