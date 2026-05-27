import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { K, NS } from "@/i18n/keys.generated";
import { formatDoctorFullName } from "@/appointment/labels";
import { listMedicalRecords } from "@/lib/api/medical-record.api";
import { PAGE_SIZE_ALL } from "@/lib/api/pagination.const";
import { dayjs } from "@/lib/dayjs";

interface AppointmentVisitThreadProps {
  appointmentId: string;
  appointmentGroupId: string | null;
  locale: string;
}

/**
 * F17 — read-only medical-records history.
 *
 * Two fetch modes, chosen by whether the visit belongs to a case:
 *  - Grouped (`appointmentGroupId` set): every record in the case via
 *    `GET /medical-records?appointmentGroupId=<id>&pageSize=all` — the full
 *    visit thread (includes this visit's own record once completed).
 *  - Standalone (`appointmentGroupId` null): this appointment's own record
 *    via `GET /medical-records?appointmentId=<id>&pageSize=all` — so a
 *    past standalone visit still surfaces the note the doctor wrote.
 *
 * The `pageSize=all` sentinel is safe — a case rarely exceeds a handful of
 * rows. Records sort `createdAt ASC` (the BE default), so the latest sits
 * at the bottom. Always read-only.
 */
export default async function AppointmentVisitThread({
  appointmentId,
  appointmentGroupId,
  locale,
}: AppointmentVisitThreadProps) {
  const t = await getTranslations(NS.VisitThread);

  const result = appointmentGroupId
    ? await listMedicalRecords({
        appointmentGroupId,
        pageSize: PAGE_SIZE_ALL,
      })
    : await listMedicalRecords({
        appointmentId,
        pageSize: PAGE_SIZE_ALL,
      });

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            {t(K.VisitThread.title)}
          </Typography>

          {result.data.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t(K.VisitThread.empty)}
            </Typography>
          ) : (
            <Stack spacing={2}>
              {result.data.map((record, index) => (
                <Stack key={record.id} spacing={1}>
                  {index > 0 ? <Divider /> : null}

                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                  >
                    <Chip
                      label={t(K.VisitThread.visitNumber, {
                        number: index + 1,
                      })}
                      size="small"
                      variant="outlined"
                    />
                    <Typography variant="caption" color="text.secondary">
                      {dayjs(record.createdAt).locale(locale).format("LL HH:mm")}
                    </Typography>
                  </Stack>

                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={2}
                  >
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        {t(K.VisitThread.doctorLabel)}
                      </Typography>
                      <Typography variant="body2">
                        {formatDoctorFullName(record.doctor)} ({record.doctor.doctorCode})
                      </Typography>
                    </Stack>

                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        {t(K.VisitThread.departmentLabel)}
                      </Typography>
                      <Typography variant="body2">
                        {record.department.name}
                      </Typography>
                    </Stack>
                  </Stack>

                  <Stack spacing={0.5}>
                    <Typography variant="caption" color="text.secondary">
                      {t(K.VisitThread.noteLabel)}
                    </Typography>
                    <Typography variant="body2">{record.note}</Typography>
                  </Stack>

                  {record.drug ? (
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        {t(K.VisitThread.drugLabel)}
                      </Typography>
                      <Typography variant="body2">{record.drug}</Typography>
                    </Stack>
                  ) : null}
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
