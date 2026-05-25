"use client";

import { SnackbarProvider as NotistackProvider } from "notistack";

import type { ReactNode } from "react";

/**
 * App-wide notistack provider, pre-configured for the HIS app shell:
 *
 *   - `maxSnack: 3` — stack up to three concurrent toasts before older
 *      ones get dropped.
 *   - `autoHideDuration: 4000` — long enough to read a one-liner without
 *      blocking the UI indefinitely.
 *   - Top-right anchor on `md+`, top-center on `xs` / `sm` — matches
 *      MUI's standard responsive guidance (top-right pairs well with the
 *      `<UserMenu>` corner; top-center reads better on a phone).
 *
 * Mounted from `(app)/layout.tsx` so public pages (`/signin`, `/[locale]/`
 * role-dispatcher, the 404 catch-all) stay free of the provider. The hook
 * (`useNotify`) lives in `lib/notifications/use-notify.ts`.
 */
interface SnackbarProviderProps {
  children: ReactNode;
}

const MAX_SNACK = 3;
const AUTO_HIDE_MS = 4000;

export default function SnackbarProvider({ children }: SnackbarProviderProps) {
  return (
    <NotistackProvider
      maxSnack={MAX_SNACK}
      autoHideDuration={AUTO_HIDE_MS}
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      preventDuplicate
      disableWindowBlurListener
    >
      {children}
    </NotistackProvider>
  );
}
