import { notFound } from "next/navigation";

// Catch-all under [locale]: any path that doesn't match a more specific page
// falls through here and triggers [locale]/not-found.tsx (which is i18n + theme aware).
// Without this, unmatched paths render Next.js's default unstyled 404.
export default function CatchAllPage(): never {
  notFound();
}
