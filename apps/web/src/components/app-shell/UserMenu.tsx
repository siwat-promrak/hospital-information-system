"use client";

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
import { useState, useTransition, type MouseEvent } from "react";

import { BACKEND_REWRITE_PREFIX } from "@/auth/auth.const";
import { BE_PATH, FE_PATH } from "@/auth/routes";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { initialsFromName } from "@/lib/utils/initials";

interface UserMenuProps {
  locale: AppLocale;
  name: string;
  email: string;
  picture: string | null;
}

/**
 * Avatar + dropdown shown on the right of the AppBar. The dropdown lists
 * the signed-in identity and a Sign out action. The actual sign-out flow
 * mirrors `SignOutButton.tsx`: POST `/api/be/auth/signout` (best-effort
 * audit), then NextAuth `signOut({ callbackUrl })`.
 */
export default function UserMenu({
  locale,
  name,
  email,
  picture,
}: UserMenuProps) {
  const tUserMenu = useTranslations(NS.UserMenu);
  const tSignOut = useTranslations(NS.SignOut);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpen(event: MouseEvent<HTMLElement>) {
    setAnchorEl(event.currentTarget);
  }

  function handleClose() {
    setAnchorEl(null);
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
