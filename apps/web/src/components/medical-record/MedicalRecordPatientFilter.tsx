"use client";

import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useCallback, useState, useTransition } from "react";

import PatientPicker from "@/components/appointment/PatientPicker";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import { FE_PATH } from "@/auth/routes";
import { MEDICAL_RECORDS_PAGE_QUERY_PARAM } from "@/lib/api/medical-record-page.const";
import type { PatientResponse } from "@/types/patient.types";

interface MedicalRecordPatientFilterProps {
  /**
   * The patient resolved server-side from `?patientId=` (or `null` when
   * the URL has no patient selected yet). Drives the picker's initial
   * `value` so a deep-linked page renders the selected-patient card
   * without a client-side round-trip.
   */
  initialPatient: PatientResponse | null;
  /**
   * Preserved query params (currently just `?view=`). Re-emitted on
   * patient-change so the view toggle's state survives a patient swap.
   * The `?page=` param is intentionally NOT preserved — changing the
   * patient resets pagination to page 1.
   */
  preserveParams: Readonly<Record<string, string | undefined>>;
}

/**
 * URL-driven patient filter for the `/medical-records` browse page.
 *
 * Wraps the existing booking-wizard `<PatientPicker>` (search →
 * inline-list typeahead) and pushes `?patientId=<uuid>` into the URL on
 * change. The page server-component re-renders with the new patient and
 * fetches the matching paginated medical-records list.
 *
 * Reset behaviour:
 *   - Picking a new patient → URL becomes `?patientId=<new>&view=<v>`.
 *     `?page=` is dropped so the new dataset starts at page 1.
 *   - Clearing the picker (passing `null` from the picker's onChange) →
 *     URL becomes `?view=<v>` only; the page falls back to the empty-
 *     state hint.
 *
 * Lives under `components/medical-record/` rather than `components/shared/`
 * because the URL-routing wrapper is medical-records-specific; lifting
 * `<PatientPicker>` itself to `components/shared/` would require also
 * relocating its `NS.BookingWizardPatient` i18n bag, which is heavier
 * churn than the wrapper deserves for one new consumer.
 */
export default function MedicalRecordPatientFilter({
  initialPatient,
  preserveParams,
}: MedicalRecordPatientFilterProps) {
  const t = useTranslations(NS.MedicalRecords);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Local mirror of the controlled `<PatientPicker>` so the selected
  // state stays in lockstep while the URL transition completes. On a
  // back/forward navigation the page re-renders this component with a
  // fresh `initialPatient`; React re-mounts with the new state, so we
  // don't need a sync effect.
  const [patient, setPatient] = useState<PatientResponse | null>(
    initialPatient,
  );

  const handleChange = useCallback(
    (next: PatientResponse | null) => {
      setPatient(next);

      const search = new URLSearchParams();

      if (next) {
        search.set(MEDICAL_RECORDS_PAGE_QUERY_PARAM.PATIENT_ID, next.id);
      }

      for (const [key, value] of Object.entries(preserveParams)) {
        if (value !== undefined && value !== "") {
          search.set(key, value);
        }
      }

      const qs = search.toString();
      const target = qs
        ? `${FE_PATH.MEDICAL_RECORDS}?${qs}`
        : FE_PATH.MEDICAL_RECORDS;

      startTransition(() => {
        router.replace(target);
      });
    },
    [preserveParams, router],
  );

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            {t(K.MedicalRecords.filterTitle)}
          </Typography>
          <PatientPicker
            value={patient}
            onChange={handleChange}
          />
          {isPending ? (
            <Typography
              variant="caption"
              color="text.secondary"
              aria-live="polite"
            >
              …
            </Typography>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
