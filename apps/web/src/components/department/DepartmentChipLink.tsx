"use client";

import Chip from "@mui/material/Chip";

import { FE_PATH } from "@/auth/routes";
import { Link } from "@/i18n/navigation";

interface DepartmentChipLinkProps {
  departmentId: string;
  departmentName: string;
  isPrimary: boolean;
  /**
   * Localised "Primary" label to append after a primary affiliation. The
   * caller resolves it via next-intl so this client component stays free
   * of namespace strings.
   */
  primaryLabel: string;
  size?: "small" | "medium";
}

/**
 * Chip rendered as a link to `/doctors?departmentId=<id>`. Wrapped in a
 * client component for the same RSC reason as [[DepartmentCardLink]] —
 * `component={Link}` cannot cross the server → client boundary as a prop.
 */
export default function DepartmentChipLink({
  departmentId,
  departmentName,
  isPrimary,
  primaryLabel,
  size = "small",
}: DepartmentChipLinkProps) {
  return (
    <Chip
      size={size}
      label={isPrimary ? `${departmentName} • ${primaryLabel}` : departmentName}
      color={isPrimary ? "primary" : "default"}
      variant={isPrimary ? "filled" : "outlined"}
      component={Link}
      clickable
      href={`${FE_PATH.DOCTORS}?departmentId=${departmentId}`}
    />
  );
}
