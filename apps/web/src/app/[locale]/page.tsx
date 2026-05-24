import { Suspense } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { K } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import LocaleSwitcher from "./LocaleSwitcher";

type HomePageProps = {
  params: Promise<{ locale: AppLocale }>;
};

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;

  setRequestLocale(locale);

  const t = await getTranslations("Home");

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 4,
        position: "relative",
      }}
    >
      <Box sx={{ position: "absolute", top: 16, right: 16 }}>
        <Suspense fallback={null}>
          <LocaleSwitcher />
        </Suspense>
      </Box>
      <Stack spacing={3} alignItems="center">
        <Typography variant="h3" component="h1" color="primary">
          {t(K.Home.title)}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {t(K.Home.subtitle)}
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button variant="contained" color="primary">
            {t(K.Home.primaryAction)}
          </Button>
          <Button variant="contained" color="secondary">
            {t(K.Home.secondaryAction)}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
