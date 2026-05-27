"use client";

import AddIcon from "@mui/icons-material/Add";
import Button from "@mui/material/Button";

import { FE_PATH } from "@/auth/routes";
import { Link } from "@/i18n/navigation";

interface PatientsNewButtonProps {
  label: string;
}

/**
 * Small client wrapper for the "Register patient" CTA shown above the
 * patients list. Lives in its own client module so the server-side
 * `/patients/page.tsx` doesn't need to pass MUI's `Button` the
 * next-intl `Link` component across the RSC boundary (React 19 rejects
 * `component={Link}` from a server component — see CLAUDE.md rule 5a).
 */
export default function PatientsNewButton({ label }: PatientsNewButtonProps) {
  return (
    <Button
      component={Link}
      href={FE_PATH.PATIENTS_NEW}
      variant="contained"
      color="primary"
      startIcon={<AddIcon />}
    >
      {label}
    </Button>
  );
}
