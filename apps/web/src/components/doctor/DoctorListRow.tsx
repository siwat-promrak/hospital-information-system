"use client";

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import ListItem from "@mui/material/ListItem";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { FE_PATH_BUILDER } from "@/auth/routes";
import DepartmentChipLink from "@/components/department/DepartmentChipLink";
import { Link } from "@/i18n/navigation";
import { initialsFromName } from "@/lib/utils/initials";
import type { DoctorListRow as DoctorListRowData } from "@/types/doctor.types";

interface DoctorListRowProps {
  doctor: DoctorListRowData;
  viewDetailLabel: string;
}

export default function DoctorListRow({
  doctor,
  viewDetailLabel,
}: DoctorListRowProps) {
  const detailHref = FE_PATH_BUILDER.doctorDetail(doctor.id);

  return (
    <ListItem
      secondaryAction={
        <IconButton
          component={Link}
          href={detailHref}
          edge="end"
          aria-label={viewDetailLabel}
        >
          <ArrowForwardIcon />
        </IconButton>
      }
      sx={{ alignItems: "flex-start", py: 2 }}
    >
      <ListItemAvatar>
        <Avatar
          sx={{
            bgcolor: "primary.dark",
            color: "primary.contrastText",
            fontWeight: 600,
          }}
        >
          {initialsFromName(`${doctor.firstNameEn} ${doctor.lastNameEn}`)}
        </Avatar>
      </ListItemAvatar>
      <ListItemText
        // Both slots wrap block-level content (`<Stack>` renders `<div>`,
        // `<Chip>` renders `<div>` / `<a>`). MUI defaults each slot to
        // `<Typography component="p">`, which would yield invalid
        // `<p><div>` nesting and trip React 19's strict hydration check.
        // Override to `<div>` for both — same pattern AppointmentListRow
        // and PatientPicker already use.
        slotProps={{
          primary: { component: "div" },
          secondary: { component: "div" },
        }}
        primary={
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
          >
            <Typography
              component={Link}
              href={detailHref}
              sx={{
                color: "text.primary",
                textDecoration: "none",
                fontWeight: 600,
                "&:hover": { color: "primary.main" },
              }}
            >
              {doctor.fullName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {doctor.doctorCode}
            </Typography>
          </Stack>
        }
        secondary={
          // The secondary slot is rendered as `<div>` (see `slotProps`
          // above) so the inner `<Box>` defaults to `<div>` too — the
          // `<DepartmentChipLink>` (renders `<a>` via `<Chip
          // component={Link}>`) nests cleanly without the
          // previous `component="span"` workaround.
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 0.75,
              mt: 0.5,
            }}
          >
            <DepartmentChipLink
              departmentId={doctor.department.id}
              departmentName={doctor.department.name}
            />
          </Box>
        }
      />
    </ListItem>
  );
}
