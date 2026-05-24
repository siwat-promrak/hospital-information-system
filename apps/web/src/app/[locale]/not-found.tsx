import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { K } from "@/i18n/keys.generated";

// Locale-aware 404 page. Rendered for unmatched routes under /[locale]/...
// Server Component — no "use client" needed; relies on NextIntlClientProvider
// from the parent layout for translations.
export default function LocaleNotFound() {
  const t = useTranslations("NotFound");

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
      <Stack spacing={2} alignItems="center">
        <Typography variant="h2" component="h1" color="primary">
          404
        </Typography>
        <Typography variant="h5" component="h2">
          {t(K.NotFound.title)}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {t(K.NotFound.description)}
        </Typography>
        <Link href="/">{t(K.NotFound.goHome)}</Link>
      </Stack>
    </Box>
  );
}
