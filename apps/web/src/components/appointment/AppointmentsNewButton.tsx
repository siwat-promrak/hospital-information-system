"use client";

import AddIcon from "@mui/icons-material/Add";
import Button from "@mui/material/Button";

import { FE_PATH } from "@/auth/routes";
import { Link } from "@/i18n/navigation";

interface AppointmentsNewButtonProps {
  label: string;
}

/**
 * Small client wrapper for the "+ New booking" CTA shown above the
 * appointments list. Lives in its own client module so the server-side
 * `/appointments/page.tsx` doesn't need to pass MUI's `Button` the
 * next-intl `Link` component across the RSC boundary (React 19 rejects
 * `component={Link}` from a server component — see CLAUDE.md rule 5a).
 */
export default function AppointmentsNewButton({
  label,
}: AppointmentsNewButtonProps) {
  return (
    <Button
      component={Link}
      href={FE_PATH.APPOINTMENTS_NEW}
      variant="contained"
      color="primary"
      startIcon={<AddIcon />}
    >
      {label}
    </Button>
  );
}
