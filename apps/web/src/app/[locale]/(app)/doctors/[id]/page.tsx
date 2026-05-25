import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import BadgeIcon from "@mui/icons-material/Badge";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import PhoneIcon from "@mui/icons-material/Phone";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FE_PATH } from "@/auth/routes";
import { PERMISSION_CODE } from "@/auth/permissions";
import DepartmentChipLink from "@/components/department/DepartmentChipLink";
import { getDoctor } from "@/lib/api/doctor.api";
import { ApiError } from "@/lib/api/errors";
import { initialsFromName } from "@/lib/utils/initials";
import { K, NS } from "@/i18n/keys.generated";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { hasPermission, requireSession } from "@/lib/server/session";

interface DoctorDetailPageProps {
  params: Promise<{ locale: AppLocale; id: string }>;
}

export default async function DoctorDetailPage({ params }: DoctorDetailPageProps) {
  const { locale, id } = await params;

  setRequestLocale(locale);

  const session = await requireSession();
  const tDetail = await getTranslations(NS.DirectoryDoctorDetail);
  const tErrors = await getTranslations(NS.DirectoryErrors);

  if (!hasPermission(session, PERMISSION_CODE.DOCTOR_READ)) {
    return (
      <Card variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {tErrors(K.Directory.Errors.forbidden)}
        </Typography>
      </Card>
    );
  }

  const doctor = await getDoctor(id).catch((err: unknown) => {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }

    throw err;
  });

  if (!doctor) {
    notFound();
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Link
          href={FE_PATH.DOCTORS}
          style={{ textDecoration: "none", display: "inline-block" }}
        >
          <Button
            startIcon={<ArrowBackIcon />}
            size="small"
            color="inherit"
            sx={{ mb: 1 }}
          >
            {tDetail(K.Directory.DoctorDetail.back)}
          </Button>
        </Link>
      </Box>

      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2.5}
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Avatar
              sx={{
                width: 64,
                height: 64,
                bgcolor: "primary.dark",
                color: "primary.contrastText",
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              {initialsFromName(`${doctor.firstNameEn} ${doctor.lastNameEn}`)}
            </Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h5" component="h1" fontWeight={600}>
                {doctor.fullName}
              </Typography>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ mt: 0.5, flexWrap: "wrap" }}
              >
                <Chip
                  size="small"
                  icon={<BadgeIcon />}
                  label={`${tDetail(K.Directory.DoctorDetail.doctorCode)}: ${doctor.doctorCode}`}
                  variant="outlined"
                />
                {doctor.gender ? (
                  <Chip
                    size="small"
                    label={doctor.gender}
                    variant="outlined"
                  />
                ) : null}
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "2fr 1fr" },
        }}
      >
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center">
                <LocalHospitalIcon color="primary" />
                <Typography variant="subtitle1" fontWeight={600}>
                  {tDetail(K.Directory.DoctorDetail.departmentLabel)}
                </Typography>
              </Stack>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                <DepartmentChipLink
                  departmentId={doctor.department.id}
                  departmentName={doctor.department.name}
                />
              </Box>
              <Divider sx={{ my: 1 }} />
              <Stack direction="row" spacing={1} alignItems="center">
                <CalendarMonthIcon color="primary" />
                <Typography variant="subtitle1" fontWeight={600}>
                  {tDetail(K.Directory.DoctorDetail.scheduleSummary)}
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {doctor.scheduleCount === 0
                  ? tDetail(K.Directory.DoctorDetail.scheduleEmpty)
                  : `${doctor.scheduleCount}`}
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="subtitle1" fontWeight={600}>
                {tDetail(K.Directory.DoctorDetail.contact)}
              </Typography>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <PhoneIcon fontSize="small" color="action" />
                <Typography variant="body2">{doctor.phone}</Typography>
              </Stack>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <BadgeIcon fontSize="small" color="action" />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {tDetail(K.Directory.DoctorDetail.licenseNo)}
                  </Typography>
                  <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
                    {doctor.medicalLicenseNo}
                  </Typography>
                </Box>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Stack>
  );
}
