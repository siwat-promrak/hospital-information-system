"use client";

import Chip from "@mui/material/Chip";

import { FE_PATH } from "@/auth/routes";
import { Link } from "@/i18n/navigation";

interface DepartmentChipLinkProps {
  departmentId: string;
  departmentName: string;
  size?: "small" | "medium";
}

/**
 * Chip rendered as a link to `/doctors?departmentId=<id>`. Wrapped in a
 * client component for the same RSC reason as [[DepartmentCardLink]] —
 * `component={Link}` cannot cross the server → client boundary as a prop.
 *
 * After the RBAC refactor, doctors have a 1:1 relationship with a
 * department, so the previous "primary affiliation" decoration is gone.
 */
export default function DepartmentChipLink({
  departmentId,
  departmentName,
  size = "small",
}: DepartmentChipLinkProps) {
  return (
    <Chip
      size={size}
      label={departmentName}
      color="primary"
      variant="outlined"
      component={Link}
      clickable
      href={`${FE_PATH.DOCTORS}?departmentId=${departmentId}`}
    />
  );
}
