"use client";

import AddIcon from "@mui/icons-material/Add";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { formatScheduleDoctorName } from "@/doctor/format";
import { K, NS } from "@/i18n/keys.generated";
import {
  compareISODatetime,
  formatDate,
  formatTime,
  isPastDateLocal,
  parseISODatetime,
} from "@/lib/utils/date";
import { isScheduleReadOnly } from "@/schedule/time";
import type { ScheduleResponse } from "@/types/schedule.types";

interface ScheduleDayDetailsDialogProps {
  open: boolean;
  /**
   * The date the user clicked. `null` when closed so the dialog can stay
   * mounted while animating shut.
   */
  date: Date | null;
  /**
   * Pre-filtered to the schedules whose start time falls on `date`. The
   * dialog does no additional filtering — the host owns that logic so the
   * empty-state can be consistent with the calendar's chip rendering.
   */
  schedules: readonly ScheduleResponse[];
  /**
   * Gates the "Create schedule" CTA at the dialog footer. A DOCTOR
   * viewing `OWN_PLUS_DEPT` + "dept" sees `false` here even though
   * `canUpdate` may also be `false` — surface the create + click-to-edit
   * affordances independently.
   */
  canCreate: boolean;
  /**
   * Gates whether each schedule row in the day list is clickable. When
   * `false`, the rows render as inert list items so the user can still
   * inspect the day's content but cannot open the edit dialog.
   */
  canUpdate: boolean;
  colorForDepartment: (departmentId: string) => string;
  onClose: () => void;
  onCreate: (date: Date) => void;
  onEditSchedule: (schedule: ScheduleResponse) => void;
}

/**
 * Day-details overlay opened from the month view. Lists every schedule on
 * the focused date, each clickable to open the edit modal, and offers a
 * Create-schedule action that opens the create modal pre-filled with this
 * date. Replaces the old "click cell → straight to create" + "+ N more →
 * jump to week" behaviour with a single, inspectable surface.
 */
export default function ScheduleDayDetailsDialog({
  open,
  date,
  schedules,
  canCreate,
  canUpdate,
  colorForDepartment,
  onClose,
  onCreate,
  onEditSchedule,
}: ScheduleDayDetailsDialogProps) {
  const tDay = useTranslations(NS.SchedulesDayDetails);
  const tSchedules = useTranslations(NS.Schedules);
  const locale = useLocale();

  const dateLabel = useMemo(
    () => (date ? formatDate(date, locale) : ""),
    [date, locale],
  );

  const sorted = useMemo(
    () => [...schedules].sort((a, b) => compareISODatetime(a.startAt, b.startAt)),
    [schedules],
  );

  // The Create-schedule action is gated on the day not being already in
  // the past — the BE rejects `startAt <= now` anyway, but disabling the
  // button up-front avoids the round-trip and the snackbar miss.
  const isPastDate = useMemo(
    () => (date ? isPastDateLocal(date) : false),
    [date],
  );
  const createDisabled = !date || isPastDate;

  function handleCreate() {
    if (!date) {
      return;
    }

    onCreate(date);
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{tDay(K.Schedules.DayDetails.title, { date: dateLabel })}</DialogTitle>

      <DialogContent dividers>
        {sorted.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            {tDay(K.Schedules.DayDetails.empty)}
          </Typography>
        ) : (
          <List disablePadding>
            {sorted.map((schedule) => {
              const start = parseISODatetime(schedule.startAt);
              const end = parseISODatetime(schedule.endAt);
              const timeLabel =
                start && end
                  ? `${formatTime(start, locale)} – ${formatTime(end, locale)}`
                  : "";
              // Use the embedded `schedule.doctor` ref — the BE already
              // serialises every name field per row, so we never need a
              // local lookup against the paginated SSR `doctors` list
              // (which would render blank for off-page doctors).
              const doctorName = formatScheduleDoctorName(
                locale,
                schedule.doctor,
              );
              // Past rows stay clickable (the modal opens in read-only mode
              // so the user can still inspect them), but the "Past" chip
              // gives a quick visual signal at the list level.
              const readOnly = isScheduleReadOnly(schedule);

              return (
                <ListItemButton
                  key={schedule.id}
                  onClick={() => onEditSchedule(schedule)}
                  disabled={!canUpdate}
                  sx={{ py: 1 }}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.5}
                    sx={{ width: "100%" }}
                  >
                    <Box
                      aria-hidden
                      sx={{
                        width: 8,
                        height: 32,
                        borderRadius: 0.5,
                        bgcolor: colorForDepartment(schedule.departmentId),
                        flexShrink: 0,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {timeLabel} · {doctorName}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        noWrap
                      >
                        {schedule.department.name}
                      </Typography>
                    </Box>
                    {readOnly ? (
                      <Chip
                        label={tSchedules(K.Schedules.pastBadge)}
                        size="small"
                        variant="outlined"
                        sx={{ flexShrink: 0 }}
                      />
                    ) : null}
                  </Stack>
                </ListItemButton>
              );
            })}
          </List>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{tDay(K.Schedules.DayDetails.close)}</Button>
        {canCreate ? (
          // Wrap in Tooltip so the user sees WHY the button is disabled
          // when the focused day is in the past. The Tooltip needs a
          // `<span>` wrapper because MUI strips pointer events from a
          // disabled button, which kills its hover target.
          <Tooltip
            title={
              isPastDate ? tDay(K.Schedules.DayDetails.cannotCreatePast) : ""
            }
            disableHoverListener={!isPastDate}
            disableFocusListener={!isPastDate}
          >
            <span>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreate}
                disabled={createDisabled}
              >
                {tDay(K.Schedules.DayDetails.create)}
              </Button>
            </span>
          </Tooltip>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
