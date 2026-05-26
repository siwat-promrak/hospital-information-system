import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getTranslations } from "next-intl/server";

import { K, NS } from "@/i18n/keys.generated";
import { listMedicalRecords } from "@/lib/api/medical-record.api";
import { PAGE_SIZE_ALL } from "@/lib/api/pagination.const";
import { dayjs } from "@/lib/dayjs";

interface AppointmentVisitThreadProps {
  appointmentGroupId: string;
  locale: string;
}

/**
 * F17 — read-only visit thread showing all medical records for the same
 * appointment group. Fetches via
 * `GET /medical-records?appointmentGroupId=<id>&pageSize=all` (the
 * `pageSize=all` sentinel — visit threads rarely exceed a handful of
 * rows). Sorted by `createdAt ASC` (the BE returns in this order by
 * default).
 *
 * Omit this component entirely when `appointmentGroupId` is null
 * (standalone visit not yet part of a group).
 */
export default async function AppointmentVisitThread({
  appointmentGroupId,
  locale,
}: AppointmentVisitThreadProps) {
  const t = await getTranslations(NS.VisitThread);

  const result = await listMedicalRecords({
    appointmentGroupId,
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
