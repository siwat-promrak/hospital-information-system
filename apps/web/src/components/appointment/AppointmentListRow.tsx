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
}: AppointmentListRowProps) {
  const tType = useTranslations(NS.CommonAppointmentType);
  const tStatus = useTranslations(NS.CommonAppointmentStatus);
  const tList = useTranslations(NS.AppointmentsList);

  const href = FE_PATH_BUILDER.appointmentDetail(appointment.id);
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
          <Box
            component="span"
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 0.5,
              mt: 0.5,
            }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              component="span"
            >
              {start.format("ddd, D MMM YYYY HH:mm")} – {end.format("HH:mm")}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              component="span"
            >
              {formatDoctorFullName(appointment.doctor)} ·{" "}
              {appointment.department.name}
            </Typography>
            <Box
              component="span"
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
