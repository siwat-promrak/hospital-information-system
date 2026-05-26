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
import { useCallback, useMemo } from "react";

import { formatDoctorFullName } from "@/appointment/labels";
import { K, NS } from "@/i18n/keys.generated";
import { listAppointmentsAction } from "@/lib/api/appointment.actions";
import { APPOINTMENT_LIST_ORDER } from "@/lib/api/appointment.const";
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
 * Paginated list of the patient's prior non-cancelled appointments.
 * Drives the F14 booking-wizard "Yes, continues a prior visit" branch.
 *
 * The BE call narrows on `?patientId=` and skips cancelled rows on the
 * service-layer side (the list endpoint defaults to non-cancelled-only
 * for continuation use cases per the F14 spec). Rows are sorted
 * `startAt DESC` so the most-recent visit surfaces first — the
 * front-desk's usual continuation is the immediate prior visit.
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

  const filteredRows = useMemo(() => {
    // Belt-and-braces filter — the BE service layer hides cancelled
    // rows from the continuation use case, but if a future revision
    // surfaces them on the wire we still want the picker to hide them
    // because picking a cancelled row would 422 with
    // `PREVIOUS_APPOINTMENT_CANCELLED` on submit.
    return loaded.filter((a) => a.status !== "CANCELLED");
  }, [loaded]);

  const showEmpty = !isLoadingMore && filteredRows.length === 0;
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

      {isLoadingMore && filteredRows.length === 0 ? (
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
