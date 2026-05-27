"use client";

import Box from "@mui/material/Box";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import SearchIcon from "@mui/icons-material/Search";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { FE_PATH } from "@/auth/routes";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import { PATIENT_QUERY_PARAM } from "@/lib/api/patient.const";
import {
  DEFAULT_PAGE,
  PAGINATION_QUERY_PARAM,
} from "@/lib/api/pagination.const";

interface PatientListFilterProps {
  activeQ: string | null;
}

/**
 * Free-text search filter for `/patients`. Updates the `q` query param via
 * `router.replace` so the URL stays the canonical source of truth and
 * back/forward navigation works. Resets `page` to 1 on every change per
 * CLAUDE.md §8 — filter changes must not leave the user on an out-of-range
 * page.
 *
 * The BE accepts `q` as a free-text filter across name (en/th), phone,
 * identification number, and HN.
 */
export default function PatientListFilter({
  activeQ,
}: PatientListFilterProps) {
  const tList = useTranslations(NS.PatientsList);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    const search = new URLSearchParams();

    search.set(PAGINATION_QUERY_PARAM.PAGE, String(DEFAULT_PAGE));

    if (value.trim()) {
      search.set(PATIENT_QUERY_PARAM.Q, value.trim());
    }

    startTransition(() => {
      router.replace(`${FE_PATH.PATIENTS}?${search.toString()}`);
    });
  }

  return (
    <Box sx={{ minWidth: { xs: "100%", sm: 280 } }}>
      <TextField
        defaultValue={activeQ ?? ""}
        label={tList(K.Patients.List.searchLabel)}
        placeholder={tList(K.Patients.List.searchPlaceholder)}
        size="small"
        fullWidth
        disabled={isPending}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
        onChange={(e) => handleChange(e.target.value)}
      />
    </Box>
  );
}
