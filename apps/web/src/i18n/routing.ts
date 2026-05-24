import { defineRouting } from "next-intl/routing";

// Subpath-prefixed routing: every URL is prefixed with the locale (e.g. /en, /th).
export const routing = defineRouting({
  locales: ["en", "th"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];
