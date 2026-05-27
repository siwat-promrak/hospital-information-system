import type { Metadata } from "next";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FE_PATH } from "@/auth/routes";
import { PERMISSION_CODE } from "@/auth/permissions";
import PatientListFilter from "@/components/patient/PatientListFilter";
import PatientListRow from "@/components/patient/PatientListRow";
import PatientsNewButton from "@/components/patient/PatientsNewButton";
import PaginationControl from "@/components/shared/PaginationControl";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { listPatients } from "@/lib/api/patient.api";
import { PATIENT_QUERY_PARAM } from "@/lib/api/patient.const";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
} from "@/lib/api/pagination.const";
import { parsePositiveInt } from "@/lib/utils/parse";
import { hasPermission, requireSession } from "@/lib/server/session";

interface PatientsPageProps {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ page?: string; q?: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: AppLocale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: NS.PatientsList });

  return {
    title: t(K.Patients.List.title),
  };
}

export default async function PatientsPage({
  params,
  searchParams,
}: PatientsPageProps) {
  const { locale } = await params;
  const { page: pageParam, q } = await searchParams;

  setRequestLocale(locale);

  const session = await requireSession();
  const tList = await getTranslations(NS.PatientsList);
  const tErrors = await getTranslations(NS.DirectoryErrors);

  if (!hasPermission(session, PERMISSION_CODE.PATIENT_READ)) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {tErrors(K.Directory.Errors.forbidden)}
        </Typography>
      </Card>
    );
  }

  const page = parsePositiveInt(pageParam) ?? DEFAULT_PAGE;
  const pageSize = DEFAULT_PAGE_SIZE;

  const patientsResult = await listPatients({ page, pageSize, q });

  const canCreate = hasPermission(session, PERMISSION_CODE.PATIENT_CREATE);
  const registerLabel = tList(K.Patients.List.registerPatient);

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={{ xs: 2, md: 3 }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", md: "center" }}
      >
        <Box>
          <Typography variant="h4" component="h1" color="primary">
            {tList(K.Patients.List.title)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tList(K.Patients.List.subtitle)}
          </Typography>
        </Box>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          alignItems={{ xs: "flex-start", sm: "center" }}
          sx={{ width: { xs: "100%", md: "auto" } }}
        >
          <PatientListFilter activeQ={q ?? null} />
          {canCreate ? (
            <PatientsNewButton label={registerLabel} />
          ) : null}
        </Stack>
      </Stack>
      <Card variant="outlined">
        {patientsResult.data.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {tList(K.Patients.List.empty)}
            </Typography>
          </Box>
        ) : (
          <List sx={{ py: 0 }}>
            {patientsResult.data.map((patient, index) => (
              <Box key={patient.id}>
                {index > 0 ? <Divider component="li" /> : null}
                <PatientListRow patient={patient} />
              </Box>
            ))}
          </List>
        )}
      </Card>
      <PaginationControl
        page={patientsResult.page}
        totalPages={patientsResult.totalPages}
        basePath={FE_PATH.PATIENTS}
        preservedQuery={{
          [PATIENT_QUERY_PARAM.Q]: q,
        }}
      />
    </Stack>
  );
}
