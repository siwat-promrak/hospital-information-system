import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PERMISSION_CODE } from "@/auth/permissions";
import FindSlotFilterCard from "@/components/find-slot/FindSlotFilterCard";
import FindSlotResultsList from "@/components/find-slot/FindSlotResultsList";
import FindSlotScopeToggle from "@/components/find-slot/FindSlotScopeToggle";
import {
  FIND_SLOT_QUERY_PARAM,
  FIND_SLOT_SCOPE,
  type FindSlotScope,
} from "@/find-slot/find-slot.const";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { getMe } from "@/lib/api/auth.api";
import { listDepartments } from "@/lib/api/department.api";
import { fetchDoctorPickerSeed } from "@/lib/api/doctor.actions";
import { getDoctor } from "@/lib/api/doctor.api";
import { MAX_PAGE_SIZE } from "@/lib/api/pagination.const";
import { listSlots } from "@/lib/api/slot.api";
import { hasPermission, requireSession } from "@/lib/server/session";
import {
  resolveScheduleViewMode,
  SCHEDULE_VIEW_MODE,
} from "@/schedule/view-mode";
import type { AppointmentType } from "@/types/appointment-type.types";
import type { DoctorListRow } from "@/types/doctor.types";
import type { SlotResponse } from "@/types/slot.types";
import { todayLocalISODate } from "@/lib/utils/date";

interface FindSlotPageProps {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{
    scope?: string;
    departmentId?: string;
    doctorId?: string;
    type?: string;
    date?: string;
  }>;
}

const APPOINTMENT_TYPE_VALUES: readonly AppointmentType[] = [
  "NEW_PATIENT_VISIT",
  "FOLLOW_UP",
  "CONSULTATION",
  "PROCEDURE",
];

/**
 * Coerce a raw URL value to a known `AppointmentType` code. Returns
 * `null` when the value is missing or unknown so the page can default to
 * "no type picked yet" without trusting the URL.
 */
function resolveAppointmentType(raw: string | undefined): AppointmentType | null {
  if (!raw) {
    return null;
  }

  if (
    APPOINTMENT_TYPE_VALUES.includes(raw as AppointmentType)
  ) {
    return raw as AppointmentType;
  }

  return null;
}

/**
 * Coerce a raw URL value to a known scope. Defaults to `mine` on first
 * visit (mirrors the F06 schedule page's scope default).
 */
function resolveScope(raw: string | undefined): FindSlotScope {
  if (raw === FIND_SLOT_SCOPE.DEPT) {
    return FIND_SLOT_SCOPE.DEPT;
  }

  return FIND_SLOT_SCOPE.MINE;
}

/**
 * F15 — dedicated slot finder screen. Lets the caller compose a
 * `(department, doctor?, type, date)` filter and browse the matching
 * open slots across one or many doctors. Each row deep-links into the
 * booking wizard with the slot pre-locked.
 *
 * View-mode dispatch mirrors the F06 schedule page (lifts
 * `resolveScheduleViewMode()` verbatim):
 *
 *  - `ALL` (MRO)          : department picker visible, doctor picker
 *                            visible (un-scoped), no scope toggle.
 *  - `OWN_PLUS_DEPT`      : scope toggle ("Show mine" / "Show department").
 *                            On `mine`: doctor pinned to caller's row,
 *                            picker hidden. On `dept`: doctor picker
 *                            scoped to caller's department.
 *  - `DEPT` (NURSE)       : doctor picker scoped to caller's department.
 *  - `OWN`                : no filters — caller's doctor pinned.
 *  - `null`               : forbidden card (sidebar already hides the
 *                            entry, so this only fires on direct URL hits).
 */
export default async function FindSlotPage({
  params,
  searchParams,
}: FindSlotPageProps) {
  const { locale } = await params;
  const {
    scope: scopeParam,
    departmentId: departmentIdParam,
    doctorId: doctorIdParam,
    type: typeParam,
    date: dateParam,
  } = await searchParams;

  setRequestLocale(locale);

  const session = await requireSession();
  const tFindSlot = await getTranslations(NS.FindSlot);
  const tErrors = await getTranslations(NS.FindSlotErrors);

  const viewMode = resolveScheduleViewMode(session.user.permissionCodes);

  if (viewMode === null) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {tErrors(K.FindSlot.Errors.forbidden)}
        </Typography>
      </Card>
    );
  }

  const isOwnPlusDept = viewMode === SCHEDULE_VIEW_MODE.OWN_PLUS_DEPT;
  // `OWN_PLUS_DEPT` is the only mode that respects the scope toggle; the
  // other modes collapse to `mine` as a harmless default.
  const scope = isOwnPlusDept
    ? resolveScope(scopeParam)
    : FIND_SLOT_SCOPE.MINE;
  const isMineScope = scope === FIND_SLOT_SCOPE.MINE;

  const showScopeToggle = isOwnPlusDept;
  const showDepartmentFilter = viewMode === SCHEDULE_VIEW_MODE.ALL;
  const showDoctorFilter =
    viewMode === SCHEDULE_VIEW_MODE.ALL ||
    viewMode === SCHEDULE_VIEW_MODE.DEPT ||
    (isOwnPlusDept && !isMineScope);

  const date = dateParam || todayLocalISODate();
  const appointmentType = resolveAppointmentType(typeParam);

  // Effective department per mode. ALL takes the URL value; every other
  // mode pins to the caller's home department (the BE auto-narrows
  // anyway, but pinning here keeps the picker scoping consistent).
  const urlDepartmentId =
    viewMode === SCHEDULE_VIEW_MODE.ALL ? departmentIdParam : undefined;
  const effectiveDepartmentId =
    viewMode === SCHEDULE_VIEW_MODE.ALL
      ? departmentIdParam
      : (session.user.departmentId ?? undefined);

  // Effective doctor per mode + scope. `OWN_PLUS_DEPT` + mine pins to
  // caller's own row (resolved from `/me`); `OWN` also pins to caller's
  // row (the BE auto-narrows, but pinning gives the FE the id to thread
  // into the picker / results loader). Every other mode forwards the URL
  // value (or omits it entirely → multi-doctor merge).
  const needsCallerDoctorId =
    viewMode === SCHEDULE_VIEW_MODE.OWN ||
    (isOwnPlusDept && isMineScope);

  // Run /me ONLY when we actually need the caller's doctor id (saves a
  // round-trip for ALL / DEPT modes).
  const me = needsCallerDoctorId ? await getMe() : null;
  const callerDoctorId = me?.doctor?.id;

  const urlDoctorId = showDoctorFilter ? doctorIdParam : undefined;
  const effectiveDoctorId = needsCallerDoctorId
    ? callerDoctorId
    : urlDoctorId;

  // Resolve the picked doctor row (for the picker's initial selection)
  // alongside the department + doctor seed fetches. `effectiveDoctorId`
  // might point at a row that's already in `doctorSeed.data` (page 1) —
  // we still issue a per-id fetch when set, so a doctor on page 2+ also
  // surfaces correctly. For pinned-doctor modes (OWN / OWN_PLUS_DEPT
  // mine) the fetch is required: the seed is scoped to the dept and may
  // not contain the caller's row when they're not on page 1.
  const initialDoctorPromise: Promise<DoctorListRow | null> =
    effectiveDoctorId
      ? getDoctor(effectiveDoctorId).catch(() => null)
      : Promise.resolve(null);

  // The search is "ready" when the user has picked an appointment type
  // AND the effective department is known. ALL mode without a picked
  // department keeps the search in the not-ready state — the BE call
  // would 400 without `departmentId`.
  const isSearchReady =
    appointmentType !== null && Boolean(effectiveDepartmentId);

  // Let any `ApiError` from the BE bubble up to `(app)/error.tsx` — a
  // 403 from a cross-dept attempt or a 400 from an unknown
  // `(departmentId, type)` pair should surface the friendly card, not be
  // swallowed silently. Rule 5c.
  const slotsPromise: Promise<readonly SlotResponse[] | null> = isSearchReady
    ? listSlots({
        departmentId: effectiveDepartmentId as string,
        doctorId: effectiveDoctorId,
        date,
        type: appointmentType,
      })
    : Promise.resolve(null);

  const [departmentsResult, doctorSeed, initialDoctor, slots] =
    await Promise.all([
      listDepartments({ pageSize: MAX_PAGE_SIZE }),
      fetchDoctorPickerSeed({
        departmentId: effectiveDepartmentId,
      }),
      initialDoctorPromise,
      slotsPromise,
    ]);

  // Gate the "Book this slot" CTA on the caller holding an
  // appointment.create.* code. MRO (with schedule.read.all) sees the
  // slot list as a read-only visibility tool — the CTA hides for them.
  const canBook = hasPermission(
    session,
    PERMISSION_CODE.APPOINTMENT_CREATE_OWN,
    PERMISSION_CODE.APPOINTMENT_CREATE_OWN_DEPARTMENT,
  );

  // URL-preservation map for the scope toggle. The toggle drops
  // `?doctorId=` when flipping back to `mine` (see component) so we
  // don't list it here — the other axes (department / type / date)
  // survive verbatim.
  const scopeTogglePreserve: Record<string, string | undefined> = {
    [FIND_SLOT_QUERY_PARAM.DEPARTMENT_ID]: urlDepartmentId,
    [FIND_SLOT_QUERY_PARAM.DOCTOR_ID]: urlDoctorId,
    [FIND_SLOT_QUERY_PARAM.TYPE]: appointmentType ?? undefined,
    [FIND_SLOT_QUERY_PARAM.DATE]: dateParam,
  };

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={{ xs: 2, md: 3 }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", md: "center" }}
      >
        <Box>
          <Typography variant="h4" component="h1" color="primary">
            {tFindSlot(K.FindSlot.title)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tFindSlot(K.FindSlot.subtitle)}
          </Typography>
        </Box>
        {showScopeToggle ? (
          <FindSlotScopeToggle
            current={scope}
            preserveParams={scopeTogglePreserve}
          />
        ) : null}
      </Stack>
      {/*
        Re-key the filter card on URL change so the state initializers
        re-run with the fresh `activeXxx` props. Without the key, hitting
        the browser back button leaves the picker showing the previous
        local state — out of sync with the URL it just navigated to.
        Composing the key from every URL-driven prop keeps remounts cheap
        (only on actual URL change) without us needing a manual
        prop-sync `useEffect` inside the card.
      */}
      <FindSlotFilterCard
        key={[
          urlDepartmentId ?? "",
          urlDoctorId ?? "",
          appointmentType ?? "",
          date,
          scope,
        ].join("|")}
        showDepartmentFilter={showDepartmentFilter}
        showDoctorFilter={showDoctorFilter}
        departments={departmentsResult.data}
        effectiveDepartmentId={effectiveDepartmentId}
        activeDepartmentId={urlDepartmentId ?? ""}
        doctorSeed={doctorSeed}
        initialDoctor={initialDoctor}
        activeAppointmentType={appointmentType ?? ""}
        activeDate={date}
        scope={scope}
      />
      <FindSlotResultsList
        slots={slots}
        canBook={canBook}
        appointmentType={appointmentType}
      />
    </Stack>
  );
}
