"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";

import { FE_PATH } from "@/auth/routes";
import {
  BOOKING_DEEP_LINK_PARAM,
} from "@/find-slot/find-slot.const";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import { dayjs } from "@/lib/dayjs";
import type { AppointmentType } from "@/types/appointment-type.types";
import type { SlotResponse } from "@/types/slot.types";

interface FindSlotResultsListProps {
  /**
   * Loaded slot rows. `null` means "search hasn't been issued yet" (the
   * not-ready empty state); an empty array means "search ran, no open
   * slots" (the empty-results state).
   */
  slots: readonly SlotResponse[] | null;
  /**
   * `true` when the caller holds at least one `appointment.create.*` code
   * — gates the per-row "Book this slot" CTA. MRO callers (no
   * appointment.create) see the slot list without the CTA.
   */
  canBook: boolean;
  /**
   * Picked appointment type — threaded into the deep-link's
   * `?appointmentType=` param so the booking wizard pre-locks the type.
   * `null` when the user hasn't picked a type (the page won't reach
   * this state with slots loaded, but the prop stays nullable so the
   * results list can render the empty / not-ready states safely).
   */
  appointmentType: AppointmentType | null;
}

interface SlotGroup {
  doctorId: string;
  doctorName: string;
  doctorCode: string;
  slots: readonly SlotResponse[];
}

/**
 * Group the flat slot list by doctor while preserving the BE's
 * chronological ordering inside each group. The BE returns
 * `startAt ASC` across the merged set; grouping by doctor is a stable
 * partition over that order so each doctor's slots stay sorted within
 * their group, and the groups themselves appear in the order the
 * earliest-slot doctor shows up.
 */
function groupSlotsByDoctor(
  slots: readonly SlotResponse[],
): readonly SlotGroup[] {
  const groups = new Map<string, SlotGroup>();

  for (const slot of slots) {
    const existing = groups.get(slot.doctorId);

    if (existing) {
      groups.set(slot.doctorId, {
        doctorId: existing.doctorId,
        doctorName: existing.doctorName,
        doctorCode: existing.doctorCode,
        slots: [...existing.slots, slot],
      });
    } else {
      groups.set(slot.doctorId, {
        doctorId: slot.doctorId,
        doctorName: slot.doctorName,
        doctorCode: slot.doctorCode,
        slots: [slot],
      });
    }
  }

  return Array.from(groups.values());
}

/**
 * Render the slot results grouped by doctor. Each row carries a "Book
 * this slot" CTA that deep-links into the booking wizard with the
 * `(doctorScheduleId, startAt, appointmentType, departmentId)` tuple
 * pre-filled and locked.
 *
 * Three render states:
 *   - `slots === null`  — search hasn't been issued yet (filter card is
 *                          still being composed). Renders a friendly
 *                          "pick filters" prompt.
 *   - `slots.length === 0` — search ran, no open slots. Renders the
 *                            empty-results card.
 *   - `slots.length > 0`   — grouped list with per-doctor sections.
 *
 * The CTA is gated on `canBook` so MRO callers (read-only, no
 * `appointment.create`) see the list without an affordance the BE would
 * 403 on.
 */
export default function FindSlotResultsList({
  slots,
  canBook,
  appointmentType,
}: FindSlotResultsListProps) {
  const t = useTranslations(NS.FindSlotResults);
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const groups = useMemo(() => {
    if (!slots) {
      return [];
    }

    return groupSlotsByDoctor(slots);
  }, [slots]);

  function handleBook(slot: SlotResponse) {
    if (!appointmentType) {
      return;
    }

    const search = new URLSearchParams();
    search.set(BOOKING_DEEP_LINK_PARAM.DOCTOR_SCHEDULE_ID, slot.scheduleId);
    search.set(BOOKING_DEEP_LINK_PARAM.START_AT, slot.startAt);
    search.set(BOOKING_DEEP_LINK_PARAM.APPOINTMENT_TYPE, appointmentType);
    search.set(BOOKING_DEEP_LINK_PARAM.DEPARTMENT_ID, slot.departmentId);

    startTransition(() => {
      router.push(`${FE_PATH.APPOINTMENTS_NEW}?${search.toString()}`);
    });
  }

  if (slots === null) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Stack spacing={1} alignItems="center">
          <Typography variant="subtitle1">
            {t(K.FindSlot.results.notReadyTitle)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t(K.FindSlot.results.notReadyDescription)}
          </Typography>
        </Stack>
      </Card>
    );
  }

  if (slots.length === 0) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Stack spacing={1} alignItems="center">
          <Typography variant="subtitle1">
            {t(K.FindSlot.results.emptyTitle)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t(K.FindSlot.results.emptyDescription)}
          </Typography>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2" color="text.secondary">
        {t(K.FindSlot.results.slotCountLabel, { count: slots.length })}
      </Typography>
      {groups.map((group) => (
        <Card key={group.doctorId} variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="subtitle1" fontWeight={600}>
                {t(K.FindSlot.results.doctorHeading, {
                  name: group.doctorName,
                  code: group.doctorCode,
                })}
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 1,
                }}
              >
                {group.slots.map((slot) => {
                  const label = t(K.FindSlot.results.timeRange, {
                    start: dayjs(slot.startAt)
                      .locale(locale)
                      .format("HH:mm"),
                    end: dayjs(slot.endAt).locale(locale).format("HH:mm"),
                  });

                  if (!canBook) {
                    return (
                      <Box
                        key={`${slot.scheduleId}-${slot.startAt}`}
                        sx={{
                          border: 1,
                          borderColor: "divider",
                          borderRadius: 1,
                          px: 1.5,
                          py: 0.75,
                          minWidth: 110,
                          textAlign: "center",
                        }}
                      >
                        <Typography variant="body2" fontWeight={500}>
                          {label}
                        </Typography>
                      </Box>
                    );
                  }

                  return (
                    <Button
                      key={`${slot.scheduleId}-${slot.startAt}`}
                      variant="outlined"
                      color="primary"
                      size="small"
                      onClick={() => handleBook(slot)}
                      disabled={isPending}
                      aria-label={`${t(K.FindSlot.results.bookSlotButton)} ${label}`}
                      sx={{ minWidth: 110 }}
                    >
                      {label}
                    </Button>
                  );
                })}
              </Box>
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
