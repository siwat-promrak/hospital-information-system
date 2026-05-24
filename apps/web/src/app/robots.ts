import type { MetadataRoute } from "next";

// Allow-all robots config. Sitemap link sourced from NEXT_PUBLIC_SITE_URL.
export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
