"use client";

import CheckIcon from "@mui/icons-material/Check";
import LogoutIcon from "@mui/icons-material/Logout";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition, type MouseEvent } from "react";

import { BACKEND_REWRITE_PREFIX } from "@/auth/auth.const";
import { BE_PATH, FE_PATH } from "@/auth/routes";
import { K, NS } from "@/i18n/keys.generated";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { SNACKBAR_SUCCESS_KEY } from "@/lib/notifications/messages.const";
import { useNotify } from "@/lib/notifications/use-notify";
import { initialsFromName } from "@/lib/utils/initials";

interface UserMenuProps {
  locale: AppLocale;
  name: string;
  email: string;
  picture: string | null;
}

/**
 * Avatar + dropdown shown on the right of the AppBar. The dropdown lists
 * the signed-in identity, the locale switcher (per rule 4d — preserves
 * query + hash on switch), and a Sign out action. The actual sign-out
 * flow mirrors `SignOutButton.tsx`: POST `/api/be/auth/signout` (best-effort
 * audit), then NextAuth `signOut({ callbackUrl })`.
 */
export default function UserMenu({
  locale,
  name,
  email,
  picture,
}: UserMenuProps) {
  const tUserMenu = useTranslations(NS.UserMenu);
  const tUserMenuLocales = useTranslations(NS.UserMenuLocales);
  const tSignOut = useTranslations(NS.SignOut);
  const notify = useNotify();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpen(event: MouseEvent<HTMLElement>) {
    setAnchorEl(event.currentTarget);
  }

  function handleClose() {
    setAnchorEl(null);
  }

  function handleLocaleChange(nextLocale: AppLocale) {
    setAnchorEl(null);

    if (nextLocale === locale) {
      return;
    }

    // Reattach the query string (next-intl's usePathname returns the
    // locale-stripped path without ?query).
    const query = searchParams.toString();
    const search = query.length > 0 ? `?${query}` : "";

    // The URL hash never reaches the server, so it isn't part of any
    // server-rendered prop. Read it client-side at click time, guarded
    // for SSR safety even though this handler only fires in the browser.
    const hash =
      typeof window !== "undefined" ? window.location.hash : "";

    router.replace(`${pathname}${search}${hash}`, { locale: nextLocale });
  }

  function handleSignOut() {
    setAnchorEl(null);

    startTransition(async () => {
      try {
        await fetch(`${BACKEND_REWRITE_PREFIX}${BE_PATH.AUTH_SIGN_OUT}`, {
          method: "POST",
          credentials: "include",
        });
      } catch {
        // best-effort audit: never block sign-out on a log failure
      }

      // Toast before navigating away — `signOut` triggers a hard redirect,
      // so the snackbar would be torn down before render if we toasted
      // after. `signOut` still re-routes, so the toast is essentially a
      // mid-redirect confirmation.
      notify.success(SNACKBAR_SUCCESS_KEY.SIGNED_OUT);

      await signOut({ callbackUrl: `/${locale}${FE_PATH.SIGNIN}` });
    });
  }

  const initials = initialsFromName(name, email);

  return (
    <>
      <Tooltip title={tUserMenu(K.UserMenu.openMenu)}>
        <IconButton
          onClick={handleOpen}
          size="small"
          aria-label={tUserMenu(K.UserMenu.openMenu)}
          aria-controls={anchorEl ? "user-menu" : undefined}
          aria-haspopup="true"
          aria-expanded={anchorEl ? "true" : undefined}
          sx={{ p: 0 }}
        >
          <Avatar
            src={picture ?? undefined}
            alt={name}
            sx={{
              width: 36,
              height: 36,
              bgcolor: "primary.dark",
              color: "primary.contrastText",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {picture ? null : initials}
          </Avatar>
        </IconButton>
      </Tooltip>
      <Menu
        id="user-menu"
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            elevation: 3,
            sx: { minWidth: 240, mt: 1 },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.25 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
              src={picture ?? undefined}
              alt={name}
              sx={{
                width: 40,
                height: 40,
                bgcolor: "primary.dark",
                color: "primary.contrastText",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {picture ? null : initials}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" noWrap>
                {name}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ display: "block" }}
              >
                {email}
              </Typography>
            </Box>
          </Stack>
        </Box>
        <Divider />
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ px: 2, pt: 1, display: "block", lineHeight: 1.6 }}
        >
          {tUserMenu(K.UserMenu.language)}
        </Typography>
        {routing.locales.map((code) => {
          const isActive = code === locale;

          return (
            <MenuItem
              key={code}
              onClick={() => handleLocaleChange(code)}
              selected={isActive}
              aria-current={isActive ? "true" : undefined}
            >
              <ListItemIcon>
                {isActive ? <CheckIcon fontSize="small" /> : null}
              </ListItemIcon>
              <ListItemText>{tUserMenuLocales(code)}</ListItemText>
            </MenuItem>
          );
        })}
        <Divider />
        <MenuItem onClick={handleSignOut} disabled={isPending}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{tSignOut(K.SignOut.label)}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
