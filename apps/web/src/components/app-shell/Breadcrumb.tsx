"use client";

import HomeIcon from "@mui/icons-material/Home";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";

import { FE_PATH } from "@/auth/routes";
import { K, NS } from "@/i18n/keys.generated";
import { Link, usePathname } from "@/i18n/navigation";

import {
  BREADCRUMB_SEGMENT_LABEL,
  isBreadcrumbSegment,
} from "@/app-shell/breadcrumb-labels";

interface BreadcrumbProps {
  /**
   * Override the auto-derived label for the segment at this index (0-based,
   * after the locale segment is stripped). Used to swap a dynamic segment
   * like `[id]` for a human-readable name resolved server-side.
   */
  labelOverrides?: Readonly<Record<number, string>>;
}

/**
 * URL-derived breadcrumb. Walks `usePathname()` (already locale-stripped by
 * next-intl), looks up each segment in `BREADCRUMB_SEGMENT_LABEL`, and
 * falls back to the segment text when the catalog has no entry (so dynamic
 * uuids render as the uuid unless an override is provided).
 *
 * Home (locale root) is always the first crumb. The trailing crumb is the
 * current page, rendered as plain text; everything before it is a Link
 * back to that depth.
 */
export default function Breadcrumb({ labelOverrides }: BreadcrumbProps) {
  const pathname = usePathname();
  const tBreadcrumb = useTranslations(NS.Breadcrumb);
  const segments = pathname.split("/").filter(Boolean);

  function labelFor(segment: string, index: number): string {
    const override = labelOverrides?.[index];

    if (override) {
      return override;
    }

    if (isBreadcrumbSegment(segment)) {
      return tBreadcrumb(BREADCRUMB_SEGMENT_LABEL[segment]);
    }

    return segment;
  }

  return (
    <Breadcrumbs
      separator={<NavigateNextIcon fontSize="small" />}
      aria-label="breadcrumb"
      sx={{
        flex: 1,
        minWidth: 0,
        ".MuiBreadcrumbs-ol": {
          flexWrap: { xs: "nowrap", sm: "wrap" },
          overflow: { xs: "hidden", sm: "visible" },
        },
      }}
    >
      <Link
        href={FE_PATH.HOME}
        style={{
          color: "inherit",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <HomeIcon fontSize="small" />
        <Box
          component="span"
          sx={{ display: { xs: "none", sm: "inline" } }}
        >
          {tBreadcrumb(K.Breadcrumb.home)}
        </Box>
      </Link>
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const hrefSegments = segments.slice(0, index + 1).join("/");
        const href = `/${hrefSegments}`;
        const label = labelFor(segment, index);

        if (isLast) {
          return (
            <Typography
              key={`${segment}-${index}`}
              color="text.primary"
              sx={{
                fontWeight: 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {label}
            </Typography>
          );
        }

        return (
          <Link
            key={`${segment}-${index}`}
            href={href}
            style={{ color: "inherit", textDecoration: "none" }}
          >
            {label}
          </Link>
        );
      })}
    </Breadcrumbs>
  );
}
