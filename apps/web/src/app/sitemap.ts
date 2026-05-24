import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

// Generates a sitemap with one entry per locale for the home page.
// Each entry advertises the alternate-locale URLs via alternates.languages.
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const lastModified = new Date();

  const languages: Record<string, string> = {};

  for (const locale of routing.locales) {
    languages[locale] = `${baseUrl}/${locale}`;
  }

  return routing.locales.map((locale) => ({
    url: `${baseUrl}/${locale}`,
    lastModified,
    changeFrequency: "weekly",
    priority: 1.0,
    alternates: {
      languages,
    },
  }));
}
