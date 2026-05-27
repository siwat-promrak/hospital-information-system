"use client";

import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { useTransition } from "react";

import { FE_PATH } from "@/auth/routes";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import {
  MEDICAL_RECORDS_PAGE_QUERY_PARAM,
  MEDICAL_RECORDS_VIEW,
  type MedicalRecordsView,
} from "@/lib/api/medical-record-page.const";

interface MedicalRecordsViewToggleProps {
  view: MedicalRecordsView;
  /**
   * Query params that must survive the toggle (`patientId`, `page`).
   * Re-emitted verbatim so flipping between LIST and GRID keeps the same
   * patient + page intact — the dataset isn't changing, just the visual.
   */
  preserveParams: Readonly<Record<string, string | undefined>>;
}

/**
 * Segmented LIST / GRID toggle for the `/medical-records` browse page.
 *
 * Stored in the URL as `?view=list|grid` so a deep link preserves the
 * user's choice. Mirrors `ScheduleViewToggle`'s pattern: locale-aware
 * `next-intl` router, transition wrapper, and verbatim preservation of
 * the other URL params.
 *
 * Unlike the patient filter, this toggle DOES preserve `?page=` —
 * switching between LIST and GRID re-renders the same paginated dataset,
 * just in a different layout.
 */
export default function MedicalRecordsViewToggle({
  view,
  preserveParams,
}: MedicalRecordsViewToggleProps) {
  const t = useTranslations(NS.MedicalRecords);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(
    _event: MouseEvent<HTMLElement>,
    nextValue: MedicalRecordsView | null,
  ) {
    if (!nextValue || nextValue === view) {
      return;
    }

    const search = new URLSearchParams();
    search.set(MEDICAL_RECORDS_PAGE_QUERY_PARAM.VIEW, nextValue);

    for (const [key, value] of Object.entries(preserveParams)) {
      if (value !== undefined && value !== "") {
        search.set(key, value);
      }
    }

    startTransition(() => {
      router.replace(`${FE_PATH.MEDICAL_RECORDS}?${search.toString()}`);
    });
  }

  return (
    <ToggleButtonGroup
      value={view}
      exclusive
      onChange={handleChange}
      size="small"
      color="primary"
      disabled={isPending}
      aria-label={t(K.MedicalRecords.viewToggleAriaLabel)}
    >
      <ToggleButton value={MEDICAL_RECORDS_VIEW.LIST}>
        {t(K.MedicalRecords.viewList)}
      </ToggleButton>
      <ToggleButton value={MEDICAL_RECORDS_VIEW.GRID}>
        {t(K.MedicalRecords.viewGrid)}
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
