import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { isSignInErrorKey } from "@/auth/sign-in-errors";
import SignInButton from "@/components/SignInButton";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { redirect } from "@/i18n/navigation";
import { getServerSession } from "@/lib/server/session";

interface SignInPageProps {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}

export default async function SignInPage({ params, searchParams }: SignInPageProps) {
  const { locale } = await params;
  const { error, callbackUrl: rawCallbackUrl } = await searchParams;

  setRequestLocale(locale);

  // If the user is already signed in, bounce them to the role dispatcher
  // at the locale root rather than rendering a useless sign-in page.
  const session = await getServerSession();

  if (session?.user?.userId) {
    redirect({ href: "/", locale });
  }

  const t = await getTranslations(NS.SignIn);
  const tErrors = await getTranslations(NS.SignInErrors);

  const callbackUrl = isSafeCallback(rawCallbackUrl, locale) ? rawCallbackUrl : `/${locale}`;
  const errorKey = isSignInErrorKey(error) ? error : null;

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 4,
      }}
    >
      <Container maxWidth="sm">
        <Paper elevation={2} sx={{ p: 4 }}>
          <Stack spacing={3} alignItems="center">
            <Stack spacing={1} alignItems="center" sx={{ textAlign: "center" }}>
              <Typography variant="h4" component="h1" color="primary">
                {t(K.SignIn.title)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t(K.SignIn.subtitle)}
              </Typography>
            </Stack>

            {errorKey ? (
              <Alert severity="error" sx={{ width: "100%" }} role="alert">
                {tErrors(errorKey)}
              </Alert>
            ) : null}

            <Box sx={{ width: "100%" }}>
              <SignInButton callbackUrl={callbackUrl} />
            </Box>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}

/**
 * Cheap open-redirect guard: only allow callback URLs that are same-origin
 * and start with the active locale prefix.
 */
function isSafeCallback(value: string | undefined, locale: string): value is string {
  if (!value) {
    return false;
  }

  if (!value.startsWith(`/${locale}/`) && value !== `/${locale}`) {
    return false;
  }

  // Reject URLs with a scheme / host / protocol-relative form.
  return !value.startsWith("//") && !/^[a-z]+:/i.test(value);
}
