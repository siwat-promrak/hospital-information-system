import { setRequestLocale } from "next-intl/server";

import AppShell from "@/components/app-shell/AppShell";
import type { AppLocale } from "@/i18n/routing";
import { requireSession } from "@/lib/server/session";

interface AppShellLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: AppLocale }>;
}

/**
 * Layout for every authenticated route under `/[locale]/(app)/...`. The
 * `(app)` route group keeps the URL flat (no `/app/` segment) while
 * gating the entire subtree on a valid session and wrapping it in the
 * sidebar + header chrome.
 *
 * `/[locale]/signin` and the `/[locale]/` role dispatcher deliberately
 * stay outside this group so they don't render the chrome.
 */
export default async function AppShellLayout({
  children,
  params,
}: AppShellLayoutProps) {
  const { locale } = await params;

  setRequestLocale(locale);

  const session = await requireSession();
  const displayName =
    session.user.name?.trim() ||
    session.user.email?.trim() ||
    "";

  return (
    <AppShell
      locale={locale}
      user={{
        name: displayName,
        email: session.user.email ?? "",
        picture: session.user.image ?? null,
        roleCode: session.user.roleCode,
        permissionCodes: session.user.permissionCodes,
      }}
    >
      {children}
    </AppShell>
  );
}
