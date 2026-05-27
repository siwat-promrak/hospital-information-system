"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Button from "@mui/material/Button";
import type { SxProps, Theme } from "@mui/material/styles";

import { FE_PATH } from "@/auth/routes";
import { Link } from "@/i18n/navigation";

interface BackToWorkspaceButtonProps {
  label: string;
  sx?: SxProps<Theme>;
}

/**
 * "← Back to workspace" CTA used on the workspace detail page and its
 * not-found state. Mirrors `BackToAppointmentsButton` — client module so
 * the server-side page can pass the next-intl `Link` component across the
 * RSC boundary without React 19 rejecting `component={Link}` (CLAUDE.md §5a).
 */
export default function BackToWorkspaceButton({
  label,
  sx,
}: BackToWorkspaceButtonProps) {
  return (
    <Button
      component={Link}
      href={FE_PATH.WORKSPACE}
      startIcon={<ArrowBackIcon />}
      sx={sx}
    >
      {label}
    </Button>
  );
}
