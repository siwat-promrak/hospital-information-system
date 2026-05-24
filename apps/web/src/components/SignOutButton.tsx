"use client";

import Button from "@mui/material/Button";
import LogoutIcon from "@mui/icons-material/Logout";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { useTransition } from "react";

import { BACKEND_REWRITE_PREFIX } from "@/auth/auth.const";
import { BE_PATH } from "@/auth/routes";
import { K, NS } from "@/i18n/keys.generated";

interface SignOutButtonProps {
  callbackUrl: string;
}

/**
 * Sign-out button that mirrors the dual-step flow from US-2.2 / US-2.7:
 *   1. POST `/api/be/auth/signout` so the BE writes a SIGN_OUT row to
 *      `auth_logs` (best-effort — failures don't block the UX).
 *   2. NextAuth `signOut()` clears the session cookie and redirects to
 *      `callbackUrl` (typically `/[locale]/signin`).
 *
 * Step 1 uses the `/api/be/*` rewrite so the session cookie travels
 * with the call (same-origin) and the BE's JwtGuard authorizes it.
 */
export default function SignOutButton({ callbackUrl }: SignOutButtonProps) {
  const t = useTranslations(NS.SignOut);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        await fetch(`${BACKEND_REWRITE_PREFIX}${BE_PATH.AUTH_SIGN_OUT}`, {
          method: "POST",
          credentials: "include",
        });
      } catch {
        // best-effort audit: never block sign-out on a log failure
      }

      await signOut({ callbackUrl });
    });
  }

  return (
    <Button
      type="button"
      variant="outlined"
      color="primary"
      startIcon={<LogoutIcon />}
      onClick={handleClick}
      disabled={isPending}
    >
      {t(K.SignOut.label)}
    </Button>
  );
}
