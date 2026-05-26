"use client";

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";

import { FE_PATH, FE_PATH_BUILDER } from "@/auth/routes";
import {
  formatDoctorFullName,
  formatPatientFullName,
} from "@/appointment/labels";
import { K, NS } from "@/i18n/keys.generated";
import { Link } from "@/i18n/navigation";
import { APPOINTMENT_QUERY_PARAM } from "@/lib/api/appointment.const";
import { dayjs } from "@/lib/dayjs";
import type { AppointmentResponse } from "@/types/appointment.types";

interface ReferralListRowProps {
  appointment: AppointmentResponse;
  locale: string;
}

/**
 * One row on the F14 referrals pickup queue. Shows the patient, the
 * source department + doctor, the referred-at timestamp, and a primary
 * "Book follow-up" CTA that deep-links to the booking wizard with the
 * source appointment pre-filled via
 * `?previousAppointmentId=<id>`.
 *
 * A secondary "Open source visit" link surfaces the appointment detail
 * page for the source row so the receiving department can read up
 * before booking.
 */
export default function ReferralListRow({
  appointment,
  locale,
}: ReferralListRowProps) {
  const tList = useTranslations(NS.ReferralsList);

  const referredAt = appointment.referredAt
    ? dayjs(appointment.referredAt).locale(locale)
    : null;
  const sourceHref = FE_PATH_BUILDER.appointmentDetail(appointment.id);
  const bookFollowUpHref = `${FE_PATH.APPOINTMENTS_NEW}?${APPOINTMENT_QUERY_PARAM.PREVIOUS_APPOINTMENT_ID}=${appointment.id}`;

  return (
    <>
      <Divider component="li" />
      <ListItem
        secondaryAction={
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              component={Link}
              href={bookFollowUpHref}
              variant="contained"
              color="primary"
              size="small"
            >
              {tList(K.Referrals.List.bookFollowUp)}
            </Button>
            <IconButton
              component={Link}
              href={sourceHref}
              edge="end"
              aria-label={tList(K.Referrals.List.viewAppointment)}
            >
              <ArrowForwardIcon />
            </IconButton>
          </Stack>
        }
        sx={{ alignItems: "flex-start", py: 2, pr: { sm: 24 } }}
      >
        <ListItemText
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
                href={sourceHref}
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
                {tList(K.Referrals.List.hnLabel)} {appointment.patient.hn}
              </Typography>
            </Stack>
          }
          secondary={
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                gap: 0.5,
                mt: 0.5,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {tList(K.Referrals.List.sourceDepartment)}:{" "}
                {appointment.department.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {tList(K.Referrals.List.sourceDoctor)}:{" "}
                {formatDoctorFullName(appointment.doctor)} (
                {appointment.doctor.doctorCode})
              </Typography>
              {referredAt ? (
                <Typography variant="caption" color="text.secondary">
                  {tList(K.Referrals.List.referredAt)}:{" "}
                  {referredAt.format("ddd, D MMM YYYY HH:mm")}
                </Typography>
              ) : null}
            </Box>
          }
        />
      </ListItem>
    </>
  );
}
