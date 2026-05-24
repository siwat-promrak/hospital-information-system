import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FE_PATH } from "@/auth/routes";
import { PERMISSION_CODE } from "@/auth/permissions";
import DepartmentCardLink from "@/components/department/DepartmentCardLink";
import PaginationControl from "@/components/shared/PaginationControl";
import { listDepartments } from "@/lib/api/department.api";
import { parsePositiveInt } from "@/lib/utils/parse";
import { K, NS } from "@/i18n/keys.generated";
import type { AppLocale } from "@/i18n/routing";
import { hasPermission, requireSession } from "@/lib/server/session";
import { DOCTOR_QUERY_PARAM } from "@/lib/api/doctor.const";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  PAGINATION_QUERY_PARAM,
} from "@/lib/api/pagination.const";

interface DepartmentsPageProps {
  params: Promise<{ locale: AppLocale }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function DepartmentsPage({
  params,
  searchParams,
}: DepartmentsPageProps) {
  const { locale } = await params;
  const { page: pageParam } = await searchParams;

  setRequestLocale(locale);

  const session = await requireSession();
  const tHeader = await getTranslations(NS.DirectoryDepartments);
  const tErrors = await getTranslations(NS.DirectoryErrors);

  if (!hasPermission(session, PERMISSION_CODE.DOCTOR_LIST)) {
    return <ForbiddenCard message={tErrors(K.Directory.Errors.forbidden)} />;
  }

  const page = parsePositiveInt(pageParam) ?? DEFAULT_PAGE;
  const pageSize = DEFAULT_PAGE_SIZE;
  const result = await listDepartments({ page, pageSize });

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" component="h1" color="primary">
          {tHeader(K.Directory.Departments.title)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {tHeader(K.Directory.Departments.subtitle)}
        </Typography>
      </Box>
      {result.data.length === 0 ? (
        <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {tHeader(K.Directory.Departments.empty)}
          </Typography>
        </Card>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(3, 1fr)",
            },
          }}
        >
          {result.data.map((dept) => (
            <DepartmentCardLink
              key={dept.id}
              name={dept.name}
              description={dept.description}
              href={`${FE_PATH.DOCTORS}?${PAGINATION_QUERY_PARAM.PAGE}=${DEFAULT_PAGE}&${DOCTOR_QUERY_PARAM.DEPARTMENT_ID}=${dept.id}`}
            />
          ))}
        </Box>
      )}
      <PaginationControl
        page={result.page}
        totalPages={result.totalPages}
        basePath={FE_PATH.DEPARTMENTS}
      />
    </Stack>
  );
}

function ForbiddenCard({ message }: { message: string }) {
  return (
    <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Card>
  );
}
