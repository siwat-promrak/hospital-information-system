"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Button from "@mui/material/Button";
import type { SxProps, Theme } from "@mui/material/styles";

import { FE_PATH } from "@/auth/routes";
import { Link } from "@/i18n/navigation";

interface BackToAppointmentsButtonProps {
  label: string;
  sx?: SxProps<Theme>;
}

/**
 * Small client wrapper for the "← Back to appointments" CTA on the
 * appointment detail page (and its not-found state). Lives in its own
 * client module so the server-side detail page doesn't need to pass
 * MUI's `Button` the next-intl `Link` component across the RSC boundary
 * (React 19 rejects `component={Link}` from a server component — see
 * CLAUDE.md rule 5a).
 */
export default function BackToAppointmentsButton({
  label,
  sx,
}: BackToAppointmentsButtonProps) {
  return (
    <Button
      component={Link}
      href={FE_PATH.APPOINTMENTS}
      startIcon={<ArrowBackIcon />}
      sx={sx}
    >
      {label}
    </Button>
  );
}
