import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PERMISSION_CODE } from "@/auth/permissions";
import { FE_PATH } from "@/auth/routes";
import MedicalRecordCard from "@/components/medical-record/MedicalRecordCard";
import MedicalRecordPatientFilter from "@/components/medical-record/MedicalRecordPatientFilter";
import MedicalRecordsViewToggle from "@/components/medical-record/MedicalRecordsViewToggle";
import PaginationControl from "@/components/shared/PaginationControl";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import {
  MEDICAL_RECORDS_PAGE_QUERY_PARAM,
  MEDICAL_RECORDS_VIEW,
  resolveMedicalRecordsView,
  type MedicalRecordsView,
} from "@/lib/api/medical-record-page.const";
import { listMedicalRecords } from "@/lib/api/medical-record.api";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  PAGINATION_QUERY_PARAM,
} from "@/lib/api/pagination.const";
import { getPatient } from "@/lib/api/patient.api";
import { hasPermission, requireSession } from "@/lib/server/session";
import { parsePositiveInt } from "@/lib/utils/parse";

interface MedicalRecordsPageProps {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{
    patientId?: string;
    view?: string;
    page?: string;
  }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: NS.MedicalRecords });

  return {
    title: t(K.MedicalRecords.title),
  };
}

/**
 * `/medical-records` — patient-scoped medical-records browse page.
 *
 * Three coordinated parts:
 *   1. A typeahead patient filter. No records render until a patient is
 *      picked; the page shows an empty-state hint instead.
 *   2. A LIST / GRID view toggle. Default is LIST when `?view=` is
 *      missing or unrecognised. URL: `?view=list|grid`.
 *   3. The records themselves — paginated via the shared
 *      `<PaginationControl>`. URL: `?page=N`.
 *
 * The BE endpoint (`GET /medical-records?patientId=…`) is gated on
 * `medical_records.read.all`, which DOCTOR / NURSE / MRO / PHARMACY all
 * hold in the seeded baseline. Callers without the permission see the
 * shared forbidden card; the sidebar nav entry is already gated, but
 * the page guards directly so a deep-link bypass surfaces the same
 * card instead of a 403.
 *
 * Pagination-reset behaviour:
 *   - Patient change → `?page=` is dropped (`MedicalRecordPatientFilter`).
 *   - View change → `?page=` is preserved (`MedicalRecordsViewToggle`).
 *   - Page change → `<PaginationControl>` preserves `patientId` + `view`.
 */
export default async function MedicalRecordsPage({
  params,
  searchParams,
}: MedicalRecordsPageProps) {
  const { locale } = await params;
  const {
    patientId: patientIdParam,
    view: viewParam,
    page: pageParam,
  } = await searchParams;

  setRequestLocale(locale);

  const session = await requireSession();
  const t = await getTranslations(NS.MedicalRecords);
  const tErrors = await getTranslations(NS.MedicalRecordsErrors);

  if (!hasPermission(session, PERMISSION_CODE.MEDICAL_RECORDS_READ_ALL)) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {tErrors(K.MedicalRecords.Errors.forbidden)}
        </Typography>
      </Card>
    );
  }

  const view: MedicalRecordsView =
    resolveMedicalRecordsView(viewParam) ?? MEDICAL_RECORDS_VIEW.LIST;
  const page = parsePositiveInt(pageParam) ?? DEFAULT_PAGE;
  const pageSize = DEFAULT_PAGE_SIZE;

  // Fetch the patient row + records list in parallel when a patient is
  // selected. `getPatient` powers the picker's initial `value` so the
  // selected-patient card renders on first paint of a deep-linked page;
  // the records list powers the paginated body. When no patient is
  // selected, both calls are skipped and the page renders the
  // empty-state hint.
  const [initialPatient, recordsResult] = patientIdParam
    ? await Promise.all([
        getPatient(patientIdParam),
        listMedicalRecords({
          patientId: patientIdParam,
          page,
          pageSize,
        }),
      ])
    : [null, null];

  // Preserved across the view toggle — both `patientId` (so flipping
  // LIST↔GRID keeps the patient) and `page` (so the user stays on the
  // same page across the toggle — the dataset isn't changing).
  const viewTogglePreservedQuery: Record<string, string | undefined> = {
    [MEDICAL_RECORDS_PAGE_QUERY_PARAM.PATIENT_ID]: patientIdParam,
  };

  if (page !== DEFAULT_PAGE) {
    viewTogglePreservedQuery[PAGINATION_QUERY_PARAM.PAGE] = String(page);
  }

  // Preserved across the patient filter change — only `view`. `page` is
  // intentionally dropped so the new patient's results start at page 1.
  const patientFilterPreservedQuery: Record<string, string | undefined> = {
    [MEDICAL_RECORDS_PAGE_QUERY_PARAM.VIEW]:
      view === MEDICAL_RECORDS_VIEW.LIST ? undefined : view,
  };

  // Preserved across pagination — keep `patientId` + `view` so stepping
  // to page N doesn't lose the filter context.
  const paginationPreservedQuery: Record<string, string | undefined> = {
    [MEDICAL_RECORDS_PAGE_QUERY_PARAM.PATIENT_ID]: patientIdParam,
    [MEDICAL_RECORDS_PAGE_QUERY_PARAM.VIEW]:
      view === MEDICAL_RECORDS_VIEW.LIST ? undefined : view,
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h1" color="primary">
          {t(K.MedicalRecords.title)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t(K.MedicalRecords.subtitle)}
        </Typography>
      </Stack>

      <MedicalRecordPatientFilter
        initialPatient={initialPatient}
        preserveParams={patientFilterPreservedQuery}
      />

      {initialPatient ? (
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          justifyContent="flex-end"
        >
          <MedicalRecordsViewToggle
            view={view}
            preserveParams={viewTogglePreservedQuery}
          />
        </Stack>
      ) : null}

      {!initialPatient ? (
        <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {t(K.MedicalRecords.selectPatientHint)}
          </Typography>
        </Card>
      ) : recordsResult && recordsResult.data.length === 0 ? (
        <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {t(K.MedicalRecords.empty)}
          </Typography>
        </Card>
      ) : recordsResult ? (
        view === MEDICAL_RECORDS_VIEW.GRID ? (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                md: "repeat(3, minmax(0, 1fr))",
              },
              gap: 2,
            }}
          >
            {recordsResult.data.map((record) => (
              <MedicalRecordCard
                key={record.id}
                record={record}
                locale={locale}
                variant="grid"
              />
            ))}
          </Box>
        ) : (
          <Stack spacing={0}>
            {recordsResult.data.map((record, index) => (
              <Box key={record.id}>
                {index > 0 ? <Divider sx={{ my: 2 }} /> : null}
                <MedicalRecordCard
                  record={record}
                  locale={locale}
                  variant="list"
                />
              </Box>
            ))}
          </Stack>
        )
      ) : null}

      {recordsResult ? (
        <PaginationControl
          page={recordsResult.page}
          totalPages={recordsResult.totalPages}
          basePath={FE_PATH.MEDICAL_RECORDS}
          preservedQuery={paginationPreservedQuery}
        />
      ) : null}
    </Stack>
  );
}
