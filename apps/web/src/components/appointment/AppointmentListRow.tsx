"use client";

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";

import { FE_PATH_BUILDER } from "@/auth/routes";
import {
  formatDoctorFullName,
  formatPatientFullName,
} from "@/appointment/labels";
import { K, NS } from "@/i18n/keys.generated";
import { Link } from "@/i18n/navigation";
import { dayjs } from "@/lib/dayjs";
import type { AppointmentResponse } from "@/types/appointment.types";

interface AppointmentListRowProps {
  appointment: AppointmentResponse;
  viewDetailLabel: string;
  locale: string;
  /**
   * Override the link target for the arrow button + patient name.
   * Defaults to `FE_PATH_BUILDER.appointmentDetail(appointment.id)` so
   * existing callers are unaffected. The workspace list passes
   * `FE_PATH_BUILDER.workspaceDetail(id)` to point at the doctor view.
   */
  href?: string;
}

/**
 * One row in the appointments list. Renders the patient name + HN as the
 * primary identifier, the scheduled time + doctor + department as the
 * secondary metadata, and chip badges for the appointment type + status.
 *
 * The whole row links to the detail page via the right-edge arrow + a
 * link on the patient name itself — same pattern as the doctors list
 * row so the directory feels consistent.
 */
export default function AppointmentListRow({
  appointment,
  viewDetailLabel,
  locale,
  href: hrefProp,
}: AppointmentListRowProps) {
  const tType = useTranslations(NS.CommonAppointmentType);
  const tStatus = useTranslations(NS.CommonAppointmentStatus);
  const tList = useTranslations(NS.AppointmentsList);

  const href = hrefProp ?? FE_PATH_BUILDER.appointmentDetail(appointment.id);
  const start = dayjs(appointment.startAt).locale(locale);
  const end = dayjs(appointment.endAt).locale(locale);

  return (
    <ListItem
      secondaryAction={
        <IconButton
          component={Link}
          href={href}
          edge="end"
          aria-label={viewDetailLabel}
        >
          <ArrowForwardIcon />
        </IconButton>
      }
      sx={{ alignItems: "flex-start", py: 2 }}
    >
      <ListItemText
        // MUI defaults both `primary` and `secondary` slots to a
        // `<Typography component="p">`. We nest a `<Stack>` (renders `<div>`)
        // in `primary` and a `<Chip>` (also `<div>`) in `secondary`, which
        // would violate the HTML "no block inside <p>" rule and trip React
        // 19's strict hydration checker. Override both slots to render as
        // `<div>` — same pattern PatientPicker already uses.
        slotProps={{
          primary: { component: "div" },
          secondary: { component: "div" },
        }}
        primary={
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ xs: "flex-start", sm: "baseline" }}
            flexWrap="wrap"
          >
            <Typography
              component={Link}
              href={href}
              sx={{
                color: "text.primary",
                textDecoration: "none",
                fontWeight: 600,
                "&:hover": { color: "primary.main" },
              }}
            >
              {formatPatientFullName(appointment.patient)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {tList(K.Appointments.List.hnLabel)} {appointment.patient.hn}
            </Typography>
          </Stack>
        }
        secondary={
          // The secondary slot is rendered as `<div>` (see `slotProps`
          // above) so the inner `<Box>`es default to `<div>` too — the
          // Chip rows (also `<div>`) nest cleanly inside without
          // tripping the "block inside inline" rule. The previous
          // `component="span"` wrappers were a workaround for the
          // default `<Typography component="p">` slot and are now
          // unnecessary.
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
              mt: 0.5,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {start.format("ddd, D MMM YYYY HH:mm")} – {end.format("HH:mm")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatDoctorFullName(appointment.doctor)} ·{" "}
              {appointment.department.name}
            </Typography>
            <Box
              sx={{
                display: "flex",
                gap: 0.75,
                mt: 0.5,
                flexWrap: "wrap",
              }}
            >
              <Chip
                label={tType(appointment.appointmentType)}
                size="small"
                variant="outlined"
              />
              <Chip
                label={tStatus(appointment.status)}
                size="small"
                color={
                  appointment.status === "BOOKED"
                    ? "primary"
                    : appointment.status === "CANCELLED"
                      ? "default"
                      : "success"
                }
                variant={
                  appointment.status === "BOOKED" ? "filled" : "outlined"
                }
              />
            </Box>
          </Box>
        }
      />
    </ListItem>
  );
}
