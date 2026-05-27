"use client";

// Client component per CLAUDE.md §5a: a server-rendered MUI <Chip> cannot
// take `component={Link}` as a prop across the RSC boundary (React 19
// rejects passing a component value from server → client).
import Chip from "@mui/material/Chip";

import { Link } from "@/i18n/navigation";

interface ViewAppointmentChipProps {
  href: string;
  label: string;
}

export default function ViewAppointmentChip({
  href,
  label,
}: ViewAppointmentChipProps) {
  return (
    <Chip
      component={Link}
      href={href}
      clickable
      label={label}
      size="small"
      variant="outlined"
      color="primary"
    />
  );
}
