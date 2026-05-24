import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PERMISSION_CODE } from "@/auth/permissions";
import DoctorListFilter from "@/components/doctor/DoctorListFilter";
import DoctorListRow from "@/components/doctor/DoctorListRow";
import { listDepartments } from "@/lib/api/department.api";
import { listDoctors } from "@/lib/api/doctor.api";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { hasPermission, requireSession } from "@/lib/server/session";

interface DoctorsPageProps {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ departmentId?: string }>;
}

export default async function DoctorsPage({
  params,
  searchParams,
}: DoctorsPageProps) {
  const { locale } = await params;
  const { departmentId } = await searchParams;

  setRequestLocale(locale);

  const session = await requireSession();
  const tHeader = await getTranslations(NS.DirectoryDoctors);
  const tErrors = await getTranslations(NS.DirectoryErrors);

  if (!hasPermission(session, PERMISSION_CODE.DOCTOR_LIST)) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {tErrors(K.Directory.Errors.forbidden)}
        </Typography>
      </Card>
    );
  }

  const [departments, doctors] = await Promise.all([
    listDepartments(),
    listDoctors({ departmentId }),
  ]);

  const viewDetailLabel = tHeader(K.Directory.Doctors.viewDetail);
  const primaryLabel = tHeader(K.Directory.Doctors.primary);

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
            {tHeader(K.Directory.Doctors.title)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tHeader(K.Directory.Doctors.subtitle)}
          </Typography>
        </Box>
        <DoctorListFilter
          departments={departments}
          activeDepartmentId={departmentId ?? null}
        />
      </Stack>
      <Card variant="outlined">
        {doctors.length === 0 ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              {tHeader(K.Directory.Doctors.empty)}
            </Typography>
          </Box>
        ) : (
          <List sx={{ py: 0 }}>
            {doctors.map((doc, index) => (
              <Box key={doc.id}>
                {index > 0 ? <Divider component="li" /> : null}
                <DoctorListRow
                  doctor={doc}
                  viewDetailLabel={viewDetailLabel}
                  primaryLabel={primaryLabel}
                />
              </Box>
            ))}
          </List>
        )}
      </Card>
    </Stack>
  );
}
