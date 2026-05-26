"use client";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { formatDoctorFullName } from "@/appointment/labels";
import { K, NS } from "@/i18n/keys.generated";
import { listAppointmentGroupsAction } from "@/lib/api/appointment-group.actions";
import { APPOINTMENT_GROUP_STATUS } from "@/lib/api/appointment-group.const";
import { listAppointmentsAction } from "@/lib/api/appointment.actions";
import {
  APPOINTMENT_LIST_ORDER,
  APPOINTMENT_STATUS,
} from "@/lib/api/appointment.const";
import { MAX_PAGE_SIZE } from "@/lib/api/pagination.const";
import { usePaginatedList } from "@/lib/hooks/use-paginated-list";
import { dayjs } from "@/lib/dayjs";
import type { AppointmentResponse } from "@/types/appointment.types";

interface ContinuationPickerProps {
  /**
   * Patient whose history populates the picker. Required — the wizard
   * mounts this step only after a patient is selected on step 1.
   */
  patientId: string;
  /** Currently-picked prior visit (or `null` until the user chooses one). */
  value: AppointmentResponse | null;
  onChange: (next: AppointmentResponse | null) => void;
}

const CONTINUATION_PAGE_SIZE = 10;

/**
 * Paginated list of the patient's prior continuation-eligible
 * appointments. Drives the F14 booking-wizard "Yes, continues a prior
 * visit" branch.
 *
 * Eligibility rules (corrective tightening of the original "non-cancelled
 * rows" filter — too loose):
 *   1. `status === 'COMPLETED'` — a `BOOKED` row hasn't happened yet so it
 *      can't be the source of a continuation; a `CANCELLED` row never did.
 *   2. (no group) OR (group is still open) — once a case is closed the
 *      patient's care thread for that diagnosis is done, so a new visit
 *      should open a fresh case rather than reach back into the closed one.
 *
 * Implementation:
 *   - The COMPLETED narrowing is applied as `?status=COMPLETED` on the
 *     existing `GET /appointments` call (the BE accepts it — see
 *     `list-appointments.query.dto.ts`'s `@IsEnum(AppointmentStatus)`
 *     field). This keeps the row count small even for patients with long
 *     histories of cancellations / future bookings.
 *   - The open-group narrowing is a client-side intersection: we fetch
 *     the patient's open groups via `GET /appointment-groups?status=open`
 *     (one round-trip, `pageSize=all` — the open-case count per patient
 *     is bounded by the number of active threads, single digits in
 *     practice) and only keep rows whose `appointmentGroupId` is either
 *     `null` (ungrouped → eligible by rule 2) or in the open-groups set
 *     (`closedAt === null` → also eligible). Closed-group rows AND rows
 *     whose group state we couldn't fetch are filtered out.
 *   - The BE doesn't currently expose a "filter to (ungrouped OR
 *     open-group)" parameter on `GET /appointments`; if a future BE
 *     revision adds one, drop the second fetch and the `useEffect` below
 *     in favour of a single narrowed call.
 *
 * The list uses `usePaginatedList` directly (no `<EntityPicker>` wrapper)
 * because the UX is an inline result list with a "Show more" button,
 * not the dropdown shape — same pattern `<PatientPicker>` uses on
 * step 1. The entity-data plumbing still lives here so the parent
 * `<BookingWizard>` stays free of per-entity details.
 */
export default function ContinuationPicker({
  patientId,
  value,
  onChange,
}: ContinuationPickerProps) {
  const t = useTranslations(NS.BookingWizardContinuation);
  const locale = useLocale();

  const loadPage = useCallback(
    (args: { page: number; pageSize: number }) => {
      return listAppointmentsAction({
        patientId,
        page: args.page,
        pageSize: args.pageSize,
        order: APPOINTMENT_LIST_ORDER.DESC,
        // Rule-1 narrowing — see eligibility rules above. The BE filter
        // keeps the row count small even for patients with long histories.
        status: APPOINTMENT_STATUS.COMPLETED,
      });
    },
    [patientId],
  );

  // The patientId is the only filter that bumps the cursor — when the
  // parent re-mounts with a different patient (post-back to step 1 +
  // change of selection) the resetKey flip triggers page-1 refetch.
  const { loaded, total, hasMore, isLoadingMore, loadMore } =
    usePaginatedList<AppointmentResponse>({
      loadPage,
      getKey: (a) => a.id,
      resetKey: patientId,
      pageSize: CONTINUATION_PAGE_SIZE,
      autoFetchFirstPage: true,
    });

  // Rule-2 input — the set of `appointmentGroupId`s where the group is
  // still open (`closedAt === null`). Fetched once per patient in a
  // single `pageSize=all` round-trip: the open-case count per patient is
  // bounded (single digits in practice), so a pull-everything fetch is
  // both cheap and simpler than threading pagination through the
  // intersection logic.
  //
  // `null` means "haven't loaded yet" — distinct from `new Set()` which
  // means "loaded, patient has zero open groups". The filter falls
  // through to the safe state (hide grouped rows) while the set is
  // still loading.
  const [openGroupIds, setOpenGroupIds] = useState<ReadonlySet<string> | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    setOpenGroupIds(null);

    (async () => {
      const groups = await listAppointmentGroupsAction({
        patientId,
        status: APPOINTMENT_GROUP_STATUS.OPEN,
        pageSize: MAX_PAGE_SIZE,
      });

      if (!cancelled) {
        setOpenGroupIds(new Set(groups.data.map((g) => g.id)));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const filteredRows = useMemo(() => {
    // Until the open-groups fetch resolves we conservatively show only
    // ungrouped rows. Once it does, grouped rows whose group is in the
    // open set surface as well. Belt-and-braces `status` recheck stays
    // because the BE filter is the only guard against a future regression
    // (and the cost of the membership test is trivial).
    return loaded.filter((a) => {
      if (a.status !== APPOINTMENT_STATUS.COMPLETED) {
        return false;
      }

      if (a.appointmentGroupId == null) {
        return true;
      }

      if (openGroupIds == null) {
        return false;
      }

      return openGroupIds.has(a.appointmentGroupId);
    });
  }, [loaded, openGroupIds]);

  // The picker has two parallel async loads (appointments page + open
  // groups). Treat "still resolving" as a single loading state so the
  // empty-state copy doesn't flicker before the open-groups fetch
  // unmasks the grouped rows. `openGroupIds == null` means the
  // open-groups fetch hasn't resolved yet.
  const isResolving = isLoadingMore || openGroupIds == null;
  const showEmpty = !isResolving && filteredRows.length === 0;
  const showLoadMore = hasMore && !isLoadingMore;

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1" component="h3">
        {t(K.BookingWizard.Continuation.pickerTitle)}
      </Typography>

      {value ? (
        <Box
          sx={{
            border: 1,
            borderColor: "primary.light",
            borderRadius: 1,
            bgcolor: "primary.50",
            p: 2,
          }}
        >
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            justifyContent="space-between"
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CheckCircleIcon color="primary" />
              <Stack spacing={0}>
                <Typography variant="body1" fontWeight={600}>
                  {t(K.BookingWizard.Continuation.selectedSummary, {
                    date: dayjs(value.startAt)
                      .locale(locale)
                      .format("D MMM YYYY HH:mm"),
                    department: value.department.name,
                    doctor: formatDoctorFullName(value.doctor),
                  })}
                </Typography>
              </Stack>
            </Stack>
            <Button
              type="button"
              size="small"
              variant="text"
              onClick={() => onChange(null)}
            >
              {t(K.BookingWizard.Continuation.clearSelection)}
            </Button>
          </Stack>
        </Box>
      ) : null}

      {isResolving && filteredRows.length === 0 ? (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            {t(K.BookingWizard.Continuation.pickerLoading)}
          </Typography>
        </Stack>
      ) : null}

      {showEmpty ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ pl: 1 }}
        >
          {t(K.BookingWizard.Continuation.pickerEmpty)}
        </Typography>
      ) : null}

      {filteredRows.length > 0 ? (
        <Stack spacing={1}>
          <List
            dense
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              maxHeight: 360,
              overflowY: "auto",
              py: 0,
            }}
          >
            {filteredRows.map((a) => {
              const selected = value?.id === a.id;
              const start = dayjs(a.startAt).locale(locale);
              const visitChipLabel = a.appointmentGroupId
                ? t(K.BookingWizard.Continuation.rowVisitLabel, {
                    // The wire doesn't carry a per-row `visitNumber` on
                    // the list endpoint (only on the group-detail
                    // payload); the chip just badges "in a case" until
                    // the BE adds the field. The full timeline is one
                    // click away on the appointment detail page.
                    visitNumber: "•",
                  })
                : t(K.BookingWizard.Continuation.rowUngrouped);

              return (
                <ListItemButton
                  key={a.id}
                  selected={selected}
                  onClick={() => onChange(a)}
                >
                  <ListItemText
                    slotProps={{
                      primary: { component: "div" },
                      secondary: { component: "div" },
                    }}
                    primary={
                      <Stack
                        direction="row"
                        spacing={1.5}
                        alignItems="baseline"
                        flexWrap="wrap"
                      >
                        <Typography variant="body1" fontWeight={500}>
                          {start.format("ddd, D MMM YYYY HH:mm")}
                        </Typography>
                        <Chip
                          size="small"
                          variant="outlined"
                          label={visitChipLabel}
                        />
                      </Stack>
                    }
                    secondary={
                      <Stack
                        direction="row"
                        spacing={2}
                        sx={{ color: "text.secondary" }}
                      >
                        <Typography variant="caption" component="span">
                          {a.department.name}
                        </Typography>
                        <Typography variant="caption" component="span">
                          {formatDoctorFullName(a.doctor)}
                        </Typography>
                      </Stack>
                    }
                  />
                </ListItemButton>
              );
            })}
          </List>

          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 1 }}
          >
            <Typography variant="caption" color="text.secondary">
              {t(K.BookingWizard.Continuation.showingCount, {
                loaded: filteredRows.length,
                total,
              })}
            </Typography>
            {showLoadMore ? (
              <Button
                type="button"
                variant="text"
                size="small"
                onClick={() => {
                  void loadMore();
                }}
              >
                {t(K.BookingWizard.Continuation.loadMore)}
              </Button>
            ) : null}
            {isLoadingMore ? <CircularProgress size={16} /> : null}
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  );
}
