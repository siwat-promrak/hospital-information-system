import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";

// Locale-aware navigation helpers. Use these instead of next/link & next/navigation
// so that locale prefixes are handled automatically.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
