import Link from "next/link";

// Root-level 404 fallback for paths the locale middleware doesn't match.
// Plain HTML — no i18n provider available outside the [locale] segment.
export default function RootNotFound() {
  return (
    <html lang="en">
      <body>
        <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
          <h1>404 — Page not found</h1>
          <p>The page you are looking for does not exist.</p>
          <Link href="/">Go to home</Link>
        </main>
      </body>
    </html>
  );
}
