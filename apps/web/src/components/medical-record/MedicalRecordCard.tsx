import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { formatDoctorFullName } from "@/appointment/labels";
import { FE_PATH_BUILDER } from "@/auth/routes";
import { K, NS } from "@/i18n/keys.generated";
import { dayjs } from "@/lib/dayjs";
import type { MedicalRecordResponse } from "@/types/medical-record.types";

import ViewAppointmentChip from "./ViewAppointmentChip";

interface MedicalRecordCardProps {
  record: MedicalRecordResponse;
  locale: string;
  /**
   * Visual density. `list` renders the full note in its natural height;
   * `grid` truncates to ~3 lines via CSS line-clamp so cells in a grid
   * keep a uniform rough height. The full note is reachable by clicking
   * through to the source appointment.
   */
  variant: "list" | "grid";
}

/**
 * Server-rendered medical-record card used by the `/medical-records`
 * browse page in both LIST and GRID modes.
 *
 * Mirrors the F18 `AppointmentVisitThread` card visuals — visit chip is
 * dropped (no appointment-group context here — every record is a
 * standalone row in a patient-scoped list), but doctor + department +
 * timestamp + note + drug stay. A small "View appointment" chip links
 * each card to the source appointment's detail page so the user can
 * jump into the visit's wider context.
 *
 * In GRID variant the note collapses to 3 lines via CSS line-clamp so
 * the grid renders as a uniform tile array. The card never grows a
 * dedicated expand affordance — the appointment-detail link is the
 * canonical full-context surface.
 */
export default async function MedicalRecordCard({
  record,
  locale,
  variant,
}: MedicalRecordCardProps) {
  const t = await getTranslations(NS.MedicalRecords);

  const formattedDate = dayjs(record.createdAt)
    .locale(locale)
    .format("LL HH:mm");

  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Stack spacing={1.5}>
          {/* Header row — doctor name + view-appointment chip. */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ xs: "flex-start", sm: "center" }}
            justifyContent="space-between"
          >
            <Typography variant="subtitle1" component="h3" fontWeight={600}>
              {formatDoctorFullName(record.doctor)} ({record.doctor.doctorCode})
            </Typography>
            <ViewAppointmentChip
              href={FE_PATH_BUILDER.appointmentDetail(record.appointmentId)}
              label={t(K.MedicalRecords.viewAppointment)}
            />
          </Stack>

          {/* Metadata row — department + recorded-at timestamp. */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            flexWrap="wrap"
          >
            <Stack spacing={0.25}>
              <Typography variant="caption" color="text.secondary">
                {t(K.MedicalRecords.departmentLabel)}
              </Typography>
              <Typography variant="body2">
                {record.department.name}
              </Typography>
            </Stack>
            <Stack spacing={0.25}>
              <Typography variant="caption" color="text.secondary">
                {t(K.MedicalRecords.dateLabel)}
              </Typography>
              <Typography variant="body2">{formattedDate}</Typography>
            </Stack>
          </Stack>

          {/* Note — full height in list, 3-line clamp in grid. */}
          <Stack spacing={0.25}>
            <Typography variant="caption" color="text.secondary">
              {t(K.MedicalRecords.noteLabel)}
            </Typography>
            <Box
              sx={
                variant === "grid"
                  ? {
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }
                  : undefined
              }
            >
              <Typography
                variant="body2"
                sx={{ whiteSpace: "pre-wrap" }}
              >
                {record.note}
              </Typography>
            </Box>
          </Stack>

          {/* Optional drug list. */}
          {record.drug ? (
            <Stack spacing={0.25}>
              <Typography variant="caption" color="text.secondary">
                {t(K.MedicalRecords.drugLabel)}
              </Typography>
              <Typography
                variant="body2"
                sx={
                  variant === "grid"
                    ? {
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }
                    : { whiteSpace: "pre-wrap" }
                }
              >
                {record.drug}
              </Typography>
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
