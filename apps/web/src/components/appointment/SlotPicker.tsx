"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import { K, NS } from "@/i18n/keys.generated";
import { dayjs } from "@/lib/dayjs";
import { loadSlotsAction } from "@/lib/api/slot.actions";
import { useNotify } from "@/lib/notifications/use-notify";
import type { AppointmentType } from "@/types/appointment-type.types";
import type { SlotResponse } from "@/types/slot.types";

interface SlotPickerProps {
  doctorId: string | null;
  departmentId: string | null;
  date: string;
  type: AppointmentType | null;
  value: SlotResponse | null;
  onChange: (next: SlotResponse | null) => void;
  locale: string;
}

/**
 * F09 step-2 slot grid. Re-fetches whenever any of
 * `(doctorId, departmentId, date, type)` change — the wizard owns those
 * inputs and threads them in.
 *
 * Behaves as a controlled component (`value` + `onChange`). Renders a
 * stack of chip-style buttons, one per open slot, in chronological order.
 *
 * The slot-finder endpoint returns `200 []` for past-only days and for
 * `(doctorId, departmentId)` pairs with no schedules; both flow into the
 * "no open slots" empty state.
 */
export default function SlotPicker({
  doctorId,
  departmentId,
  date,
  type,
  value,
  onChange,
  locale,
}: SlotPickerProps) {
  const t = useTranslations(NS.BookingWizardSlot);
  const notify = useNotify();
  const [slots, setSlots] = useState<readonly SlotResponse[]>([]);
  const [isLoading, startTransition] = useTransition();
  const requestSeq = useRef<number>(0);

  // `useNotify()` returns a fresh object literal every render — listing
  // `notify` in the effect's deps re-fires the effect every render which
  // calls `setSlots([])` + `startTransition(...)` → re-render → loop
  // ("Maximum update depth exceeded"). Stash it behind a ref so the
  // inner async callback can still reach `.error()` without subscribing
  // to its identity.
  const notifyRef = useRef(notify);

  useEffect(() => {
    notifyRef.current = notify;
  });

  useEffect(() => {
    // Clear stale results whenever any dimension changes — the picker
    // never shows slots from a previous tuple even briefly.
    setSlots([]);

    if (!doctorId || !departmentId || !type || !date) {
      return;
    }

    const seq = ++requestSeq.current;

    startTransition(async () => {
      const result = await loadSlotsAction({
        doctorId,
        departmentId,
        date,
        type,
      });

      if (seq !== requestSeq.current) {
        return;
      }

      if (!result.ok) {
        notifyRef.current.error(result.error.code);
        setSlots([]);

        return;
      }

      setSlots(result.data);
    });
  }, [doctorId, departmentId, date, type]);

  if (!doctorId || !departmentId || !type) {
    return (
      <Box
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          p: 3,
          textAlign: "center",
          bgcolor: "background.default",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {t(K.BookingWizard.Slot.selectDoctorFirst)}
        </Typography>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={{ p: 2 }}
      >
        <CircularProgress size={18} />
        <Typography variant="body2" color="text.secondary">
          {t(K.BookingWizard.Slot.loadingSlots)}
        </Typography>
      </Stack>
    );
  }

  if (slots.length === 0) {
    return (
      <Box
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          p: 3,
          textAlign: "center",
          bgcolor: "background.default",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {t(K.BookingWizard.Slot.emptySlots)}
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2">
        {t(K.BookingWizard.Slot.slotListTitle)}
      </Typography>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        {slots.map((slot) => {
          const selected =
            value?.startAt === slot.startAt &&
            value?.scheduleId === slot.scheduleId;
          const label = `${dayjs(slot.startAt).locale(locale).format("HH:mm")} – ${dayjs(slot.endAt).locale(locale).format("HH:mm")}`;

          return (
            <Button
              key={`${slot.scheduleId}-${slot.startAt}`}
              variant={selected ? "contained" : "outlined"}
              color="primary"
              size="small"
              onClick={() => onChange(slot)}
              sx={{ minWidth: 110 }}
            >
              {label}
            </Button>
          );
        })}
      </Box>
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
            <Stack spacing={0}>
              <Typography variant="caption" color="text.secondary">
                {t(K.BookingWizard.Slot.selectedSlot)}
              </Typography>
              <Typography variant="body1" fontWeight={600}>
                {dayjs(value.startAt)
                  .locale(locale)
                  .format("ddd, D MMM YYYY HH:mm")}
              </Typography>
            </Stack>
            <Chip
              label={`${dayjs(value.endAt).diff(value.startAt, "minute")} min`}
              color="primary"
              size="small"
            />
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}
