"use client";

import Button from "@mui/material/Button";
import GoogleIcon from "@mui/icons-material/Google";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { useTransition } from "react";

import { OAUTH_PROVIDER } from "@/auth/oauth";
import { K, NS } from "@/i18n/keys.generated";

interface SignInButtonProps {
  callbackUrl: string;
}

/**
 * Single-button sign-in starter. Kicks off NextAuth's Google OAuth flow;
 * the server-side `signIn` callback in `src/auth.ts` does the
 * `POST /auth/resolve` round-trip and writes the SIGN_IN_SUCCESS or
 * SIGN_IN_FAILED row in `auth_logs` (F02).
 *
 * `callbackUrl` is forwarded so the user lands back where they came from
 * (e.g. the protected page that triggered the middleware redirect).
 */
export default function SignInButton({ callbackUrl }: SignInButtonProps) {
  const t = useTranslations(NS.SignIn);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await signIn(OAUTH_PROVIDER.GOOGLE, { callbackUrl });
    });
  }

  return (
    <Button
      type="button"
      variant="contained"
      color="primary"
      size="large"
      startIcon={<GoogleIcon />}
      onClick={handleClick}
      disabled={isPending}
      fullWidth
    >
      {t(K.SignIn.continueWithGoogle)}
    </Button>
  );
}
