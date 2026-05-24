import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import theme from "@/theme/theme";
import { routing } from "@/i18n/routing";
import { K } from "@/i18n/keys.generated";

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "Home" });

  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    ),
    title: t(K.Home.title),
    description: t(K.Home.subtitle),
    alternates: {
      canonical: `/${locale}`,
      languages: {
        en: "/en",
        th: "/th",
        "x-default": "/en",
      },
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enables static rendering for Server Components in this segment.
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      {/* suppressHydrationWarning tolerates attrs injected by browser extensions (e.g. Grammarly). */}
      <body suppressHydrationWarning>
        <AppRouterCacheProvider options={{ key: "mui" }}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <NextIntlClientProvider>{children}</NextIntlClientProvider>
          </ThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
