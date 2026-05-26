"use client";

import HomeIcon from "@mui/icons-material/Home";
import RefreshIcon from "@mui/icons-material/Refresh";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { FE_PATH } from "@/auth/routes";
import { K, NS } from "@/i18n/keys.generated";
import { Link } from "@/i18n/navigation";
import { parseApiErrorDigest } from "@/lib/api/errors";

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Global error boundary for every authenticated route under
 * `/[locale]/(app)/*`. Renders inside the existing `(app)/layout.tsx`,
 * so the sidebar + header stay visible while the page area swaps to
 * the right error card.
 *
 * Recovering the original `ApiError` shape is tricky here — `error.tsx`
 * receives a serialized `Error` whose prototype + custom fields are
 * lost. We stash the HTTP status on `error.digest` (see
 * `lib/api/errors.ts`) because `digest` is the only field that survives
 * the server→client boundary in both dev AND prod (prod scrubs
 * `error.message`).
 *
 * Branches:
 *   - 403 → "no permission" card
 *   - 404 → "not found" card
 *   - other → generic "something went wrong" + Try-again + Home
 */
export default function AppRouteError({
  error,
  reset,
}: ErrorBoundaryProps) {
  const t = useTranslations(NS.AppError);

  // Surface every unhandled error to the browser console in dev — without
  // this the only feedback is the rendered card, which is too generic
  // to debug. In prod the console log is harmless (the boundary already
  // prevents the broken page from rendering).
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[AppRouteError]", error);
  }, [error]);

  const parsed = parseApiErrorDigest(error.digest);

  if (parsed?.status === 403) {
    return (
      <ErrorCard
        title={t(K.AppError.Forbidden.title)}
        description={t(K.AppError.Forbidden.description)}
        primaryAction={
          <Button
            component={Link}
            href={FE_PATH.HOME}
            variant="contained"
            startIcon={<HomeIcon />}
          >
            {t(K.AppError.goHome)}
          </Button>
        }
      />
    );
  }

  if (parsed?.status === 404) {
    return (
      <ErrorCard
        title={t(K.AppError.NotFound.title)}
        description={t(K.AppError.NotFound.description)}
        primaryAction={
          <Button
            component={Link}
            href={FE_PATH.HOME}
            variant="contained"
            startIcon={<HomeIcon />}
          >
            {t(K.AppError.goHome)}
          </Button>
        }
      />
    );
  }

  return (
    <ErrorCard
      title={t(K.AppError.title)}
      description={t(K.AppError.description)}
      primaryAction={
        <Button
          onClick={reset}
          variant="contained"
          startIcon={<RefreshIcon />}
        >
          {t(K.AppError.tryAgain)}
        </Button>
      }
      secondaryAction={
        <Button
          component={Link}
          href={FE_PATH.HOME}
          startIcon={<HomeIcon />}
        >
          {t(K.AppError.goHome)}
        </Button>
      }
    />
  );
}

interface ErrorCardProps {
  title: string;
  description: string;
  primaryAction: React.ReactNode;
  secondaryAction?: React.ReactNode;
}

function ErrorCard({
  title,
  description,
  primaryAction,
  secondaryAction,
}: ErrorCardProps) {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: { xs: 4, md: 8 } }}>
      <Card variant="outlined" sx={{ maxWidth: 520, width: "100%" }}>
        <CardContent>
          <Stack spacing={2.5} alignItems="center" sx={{ textAlign: "center" }}>
            <Typography variant="h5" component="h1">
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
            <Stack
              direction={{ xs: "column-reverse", sm: "row" }}
              spacing={1.5}
              sx={{ pt: 1 }}
            >
              {secondaryAction}
              {primaryAction}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
