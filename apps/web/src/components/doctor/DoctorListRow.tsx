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
  primaryLabel: string;
}

export default function DoctorListRow({
  doctor,
  viewDetailLabel,
  primaryLabel,
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
          <Box
            component="span"
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 0.75,
              mt: 0.5,
            }}
          >
            {doctor.departments.length === 0 ? (
              <Typography variant="caption" color="text.disabled">
                —
              </Typography>
            ) : (
              doctor.departments.map((aff) => (
                <DepartmentChipLink
                  key={aff.departmentId}
                  departmentId={aff.departmentId}
                  departmentName={aff.departmentName}
                  isPrimary={aff.isPrimary}
                  primaryLabel={primaryLabel}
                />
              ))
            )}
          </Box>
        }
      />
    </ListItem>
  );
}
