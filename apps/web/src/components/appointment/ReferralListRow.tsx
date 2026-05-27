"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useState } from "react";

import ReferralBookDialog from "@/components/appointment/ReferralBookDialog";
import {
  formatDoctorFullName,
  formatPatientFullName,
} from "@/appointment/labels";
import { K, NS } from "@/i18n/keys.generated";
import { dayjs } from "@/lib/dayjs";
import type { PaginatedListInitial } from "@/lib/hooks/use-paginated-list";
import type { AppointmentResponse } from "@/types/appointment.types";
import type { DoctorListRow } from "@/types/doctor.types";

interface ReferralListRowProps {
  appointment: AppointmentResponse;
  locale: string;
  /**
   * Whether the caller can book new appointments at all. When `false` the
   * Book button hides — the row degrades to a read-only summary.
   */
  canBook: boolean;
  /** Doctor picker SSR seed scoped to the caller's department. */
  doctorSeed?: PaginatedListInitial<DoctorListRow>;
  /** Doctor picker filter — caller's department for `.own-department`. */
  doctorScopeDepartmentId?: string;
  /** Caller's own doctor row when DOCTOR-with-`.own`-only — locks the picker. */
  lockedDoctor?: DoctorListRow;
}

/**
 * One row on the F14 referrals pickup queue. Shows the patient, the
 * source department + doctor, the referred-at timestamp, and a primary
 * "Book" CTA that opens an inline booking dialog (doctor + appointment
 * type + date + slot) without leaving the queue. Submitting the dialog
 * routes to the new appointment's detail page on success.
 */
export default function ReferralListRow({
  appointment,
  locale,
  canBook,
  doctorSeed,
  doctorScopeDepartmentId,
  lockedDoctor,
}: ReferralListRowProps) {
  const tList = useTranslations(NS.ReferralsList);
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);

  const referredAt = appointment.referredAt
    ? dayjs(appointment.referredAt).locale(locale)
    : null;

  return (
    <>
      <Divider component="li" />
      <ListItem
        secondaryAction={
          canBook ? (
            <Button
              variant="contained"
              color="primary"
              size="small"
              onClick={() => setDialogOpen(true)}
            >
              {tList(K.Referrals.List.bookFollowUp)}
            </Button>
          ) : null
        }
        sx={{ alignItems: "flex-start", py: 2, pr: { sm: 16 } }}
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
              <Typography sx={{ fontWeight: 600 }}>
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
      {canBook ? (
        <ReferralBookDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          referral={appointment}
          lockedDoctor={lockedDoctor}
          doctorSeed={doctorSeed}
          doctorScopeDepartmentId={doctorScopeDepartmentId}
        />
      ) : null}
    </>
  );
}
