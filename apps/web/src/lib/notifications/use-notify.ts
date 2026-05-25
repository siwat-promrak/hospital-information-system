"use client";

import { useSnackbar } from "notistack";
import { useTranslations } from "next-intl";

import { NS } from "@/i18n/keys.generated";

import {
  ERROR_CODE_TO_KEY,
  SNACKBAR_GENERIC_ERROR_KEY,
  type SnackbarSuccessKey,
} from "./messages.const";

/**
 * App-wide toast notifier. Built on top of notistack's `useSnackbar` so the
 * call site is one-liner-friendly:
 *
 *   const notify = useNotify();
 *   notify.success(SNACKBAR_SUCCESS_KEY.SCHEDULE_CREATED);
 *   notify.error(result.error.code);
 *
 * `success(key)` — `key` is a value from `SNACKBAR_SUCCESS_KEY`. The hook
 * looks it up under `Snackbar.Success.*` in the i18n catalog and shows a
 * success variant.
 *
 * `error(code)` — `code` is the BE wire code from `ApiError.code` (e.g.
 * `SCHEDULE_OVERLAP`). The hook maps it to `Snackbar.Errors.*` via
 * `ERROR_CODE_TO_KEY`; unknown codes fall through to the generic message.
 * The optional `fallbackMessage` arg lets the caller provide an already-
 * localised fallback (e.g. a translated form-level message) instead of the
 * generic copy when no mapping exists.
 *
 * Per CLAUDE.md rule 4, `useTranslations(NS.SnackbarSuccess)` / `NS.SnackbarErrors`
 * keep the namespace lookup typed via the generated `NS` catalog.
 */
export function useNotify() {
  const { enqueueSnackbar } = useSnackbar();
  const tOk = useTranslations(NS.SnackbarSuccess);
  const tErr = useTranslations(NS.SnackbarErrors);

  return {
    success(key: SnackbarSuccessKey, params?: Record<string, string | number>) {
      enqueueSnackbar(tOk(key, params), { variant: "success" });
    },
    error(code: string | undefined, fallbackMessage?: string) {
      const mapped = code ? ERROR_CODE_TO_KEY[code] : undefined;
      const message = mapped
        ? tErr(mapped)
        : fallbackMessage ?? tErr(SNACKBAR_GENERIC_ERROR_KEY);
      enqueueSnackbar(message, { variant: "error" });
    },
    info(message: string) {
      enqueueSnackbar(message, { variant: "info" });
    },
    warning(message: string) {
      enqueueSnackbar(message, { variant: "warning" });
    },
  };
}
