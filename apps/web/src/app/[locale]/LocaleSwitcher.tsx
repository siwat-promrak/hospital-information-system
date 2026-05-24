"use client";

import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";

// Tiny EN/TH switcher used on the home page to demonstrate i18n wiring.
// Preserves query string and hash fragment across locale changes so that
// deep links survive the switch.
export default function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(
    _event: React.MouseEvent<HTMLElement>,
    nextLocale: AppLocale | null,
  ) {
    if (!nextLocale || nextLocale === locale) {
      return;
    }

    // Reattach the query string (next-intl's usePathname returns the
    // locale-stripped path without ?query).
    const query = searchParams.toString();
    const search = query.length > 0 ? `?${query}` : "";

    // The URL hash never reaches the server, so it isn't part of any
    // server-rendered prop. Read it client-side at click time, guarded
    // for SSR safety even though this handler only fires in the browser.
    const hash =
      typeof window !== "undefined" ? window.location.hash : "";

    router.replace(`${pathname}${search}${hash}`, { locale: nextLocale });
  }

  return (
    <ToggleButtonGroup
      value={locale}
      exclusive
      onChange={handleChange}
      size="small"
      aria-label="Language"
    >
      {routing.locales.map((code) => (
        <ToggleButton key={code} value={code} aria-label={code}>
          {code.toUpperCase()}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
