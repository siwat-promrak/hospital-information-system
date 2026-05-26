"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";

import { FE_PATH } from "@/auth/routes";
import BloodGroupSelect from "@/components/shared/select/BloodGroupSelect";
import GenderSelect from "@/components/shared/select/GenderSelect";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import { createPatientAction } from "@/lib/api/patient.actions";
import { SNACKBAR_SUCCESS_KEY } from "@/lib/notifications/messages.const";
import { useNotify } from "@/lib/notifications/use-notify";
import {
  PATIENT_REGISTRATION_FIELD_ERROR_KEY,
  type PatientRegistrationFieldErrorCode,
} from "@/patient/registration-schema.const";
import {
  PATIENT_REGISTRATION_DEFAULTS,
  patientRegistrationSchema,
  type PatientRegistrationValues,
} from "@/patient/registration-schema";
import type {
  CreatePatientBody,
  PatientBloodGroup,
  PatientGender,
} from "@/types/patient.types";

/**
 * Walk-in patient registration form (F09 / `/patients/new`). Built on
 * `react-hook-form` + `zod`, mirrors the BE `CreatePatientDto` exactly.
 *
 * On success: shows a success toast carrying the minted HN and navigates
 * back to the appointments list (the most-common follow-up surface — the
 * front desk usually books an appointment for the patient they just
 * registered).
 *
 * On a known error code (e.g. `PATIENT_EMAIL_EXISTS`): the global
 * `useNotify` hook maps the wire code to the localised toast; the form
 * does not surface a redundant inline error so the UX stays single-source.
 *
 * For any other server-side error we render an inline `<Alert>` carrying
 * the generic copy — the user has lost their submission, so an
 * always-visible affordance is better than a transient toast.
 */
export default function PatientRegistrationForm() {
  const tRegister = useTranslations(NS.PatientsRegister);
  const tFields = useTranslations(NS.PatientsRegisterFields);
  const tPlaceholders = useTranslations(NS.PatientsRegisterPlaceholders);
  const tSections = useTranslations(NS.PatientsRegisterSections);
  const tFieldErrors = useTranslations(NS.PatientsRegisterFieldErrors);
  const tErrors = useTranslations(NS.PatientsRegisterErrors);
  const router = useRouter();
  const notify = useNotify();
  const [isPending, startTransition] = useTransition();

  const {
    control,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<PatientRegistrationValues>({
    resolver: zodResolver(patientRegistrationSchema),
    defaultValues: PATIENT_REGISTRATION_DEFAULTS,
    mode: "onBlur",
  });

  function resolveFieldHelperText(
    code: string | undefined,
  ): string | undefined {
    if (!code) {
      return undefined;
    }

    const key =
      PATIENT_REGISTRATION_FIELD_ERROR_KEY[
        code as PatientRegistrationFieldErrorCode
      ];

    if (!key) {
      return code;
    }

    return tFieldErrors(key);
  }

  function toCreateBody(values: PatientRegistrationValues): CreatePatientBody {
    return {
      firstNameEn: values.firstNameEn,
      lastNameEn: values.lastNameEn,
      firstNameTh: values.firstNameTh ?? null,
      lastNameTh: values.lastNameTh ?? null,
      email: values.email,
      dateOfBirth: values.dateOfBirth,
      gender: values.gender,
      bloodGroup: values.bloodGroup,
      identificationNo: values.identificationNo,
      phone: values.phone,
      emergencyPersonName: values.emergencyPersonName,
      emergencyPersonRelation: values.emergencyPersonRelation,
      emergencyPersonPhone: values.emergencyPersonPhone,
      address: values.address,
    };
  }

  function onSubmit(values: PatientRegistrationValues) {
    startTransition(async () => {
      const result = await createPatientAction(toCreateBody(values));

      if (!result.ok) {
        notify.error(result.error.code, tErrors(K.Patients.Register.Errors.generic));
        setError("root.serverError", {
          message: tErrors(K.Patients.Register.Errors.generic),
        });

        return;
      }

      notify.success(SNACKBAR_SUCCESS_KEY.PATIENT_CREATED, {
        hn: result.data.hn,
      });
      router.push(FE_PATH.APPOINTMENTS_NEW);
    });
  }

  const serverError = errors.root?.serverError?.message;

  return (
    <Card variant="outlined">
      <CardContent>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Stack spacing={4}>
            {serverError ? <Alert severity="error">{serverError}</Alert> : null}

            <Section title={tSections(K.Patients.Register.sections.identity)}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                useFlexGap
              >
                <Controller
                  name="firstNameEn"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={tFields(K.Patients.Register.fields.firstNameEn)}
                      placeholder={tPlaceholders(
                        K.Patients.Register.placeholders.firstNameEn,
                      )}
                      required
                      fullWidth
                      error={Boolean(errors.firstNameEn)}
                      helperText={resolveFieldHelperText(
                        errors.firstNameEn?.message,
                      )}
                    />
                  )}
                />
                <Controller
                  name="lastNameEn"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={tFields(K.Patients.Register.fields.lastNameEn)}
                      placeholder={tPlaceholders(
                        K.Patients.Register.placeholders.lastNameEn,
                      )}
                      required
                      fullWidth
                      error={Boolean(errors.lastNameEn)}
                      helperText={resolveFieldHelperText(
                        errors.lastNameEn?.message,
                      )}
                    />
                  )}
                />
              </Stack>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                useFlexGap
              >
                <Controller
                  name="firstNameTh"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value ?? ""}
                      label={tFields(K.Patients.Register.fields.firstNameTh)}
                      placeholder={tPlaceholders(
                        K.Patients.Register.placeholders.firstNameTh,
                      )}
                      fullWidth
                    />
                  )}
                />
                <Controller
                  name="lastNameTh"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value ?? ""}
                      label={tFields(K.Patients.Register.fields.lastNameTh)}
                      placeholder={tPlaceholders(
                        K.Patients.Register.placeholders.lastNameTh,
                      )}
                      fullWidth
                    />
                  )}
                />
              </Stack>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                useFlexGap
              >
                <Controller
                  name="dateOfBirth"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      type="date"
                      label={tFields(K.Patients.Register.fields.dateOfBirth)}
                      InputLabelProps={{ shrink: true }}
                      required
                      fullWidth
                      error={Boolean(errors.dateOfBirth)}
                      helperText={resolveFieldHelperText(
                        errors.dateOfBirth?.message,
                      )}
                    />
                  )}
                />
                <Controller
                  name="gender"
                  control={control}
                  render={({ field }) => (
                    <GenderSelect
                      value={(field.value ?? "") as PatientGender | ""}
                      onChange={(next) => field.onChange(next)}
                      label={tFields(K.Patients.Register.fields.gender)}
                      placeholder={tRegister(
                        K.Patients.Register.selectGenderPlaceholder,
                      )}
                      required
                      error={Boolean(errors.gender)}
                      helperText={resolveFieldHelperText(
                        errors.gender?.message,
                      )}
                    />
                  )}
                />
                <Controller
                  name="bloodGroup"
                  control={control}
                  render={({ field }) => (
                    <BloodGroupSelect
                      value={(field.value ?? "") as PatientBloodGroup | ""}
                      onChange={(next) =>
                        field.onChange(next === "" ? undefined : next)
                      }
                      label={tFields(K.Patients.Register.fields.bloodGroup)}
                      placeholder={tRegister(
                        K.Patients.Register.selectBloodGroupPlaceholder,
                      )}
                      helperText={tRegister(
                        K.Patients.Register.bloodGroupUnknownHint,
                      )}
                    />
                  )}
                />
              </Stack>
              <Controller
                name="identificationNo"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={tFields(
                      K.Patients.Register.fields.identificationNo,
                    )}
                    placeholder={tPlaceholders(
                      K.Patients.Register.placeholders.identificationNo,
                    )}
                    required
                    fullWidth
                    error={Boolean(errors.identificationNo)}
                    helperText={resolveFieldHelperText(
                      errors.identificationNo?.message,
                    )}
                  />
                )}
              />
            </Section>

            <Section title={tSections(K.Patients.Register.sections.contact)}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                useFlexGap
              >
                <Controller
                  name="phone"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={tFields(K.Patients.Register.fields.phone)}
                      placeholder={tPlaceholders(
                        K.Patients.Register.placeholders.phone,
                      )}
                      required
                      fullWidth
                      error={Boolean(errors.phone)}
                      helperText={resolveFieldHelperText(
                        errors.phone?.message,
                      )}
                    />
                  )}
                />
                <Controller
                  name="email"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value ?? ""}
                      type="email"
                      label={tFields(K.Patients.Register.fields.email)}
                      placeholder={tPlaceholders(
                        K.Patients.Register.placeholders.email,
                      )}
                      fullWidth
                      error={Boolean(errors.email)}
                      helperText={resolveFieldHelperText(
                        errors.email?.message,
                      )}
                    />
                  )}
                />
              </Stack>
            </Section>

            <Section title={tSections(K.Patients.Register.sections.emergency)}>
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                useFlexGap
              >
                <Controller
                  name="emergencyPersonName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={tFields(
                        K.Patients.Register.fields.emergencyPersonName,
                      )}
                      placeholder={tPlaceholders(
                        K.Patients.Register.placeholders.emergencyPersonName,
                      )}
                      required
                      fullWidth
                      error={Boolean(errors.emergencyPersonName)}
                      helperText={resolveFieldHelperText(
                        errors.emergencyPersonName?.message,
                      )}
                    />
                  )}
                />
                <Controller
                  name="emergencyPersonRelation"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={tFields(
                        K.Patients.Register.fields.emergencyPersonRelation,
                      )}
                      placeholder={tPlaceholders(
                        K.Patients.Register.placeholders
                          .emergencyPersonRelation,
                      )}
                      required
                      fullWidth
                      error={Boolean(errors.emergencyPersonRelation)}
                      helperText={resolveFieldHelperText(
                        errors.emergencyPersonRelation?.message,
                      )}
                    />
                  )}
                />
                <Controller
                  name="emergencyPersonPhone"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={tFields(
                        K.Patients.Register.fields.emergencyPersonPhone,
                      )}
                      placeholder={tPlaceholders(
                        K.Patients.Register.placeholders.emergencyPersonPhone,
                      )}
                      required
                      fullWidth
                      error={Boolean(errors.emergencyPersonPhone)}
                      helperText={resolveFieldHelperText(
                        errors.emergencyPersonPhone?.message,
                      )}
                    />
                  )}
                />
              </Stack>
            </Section>

            <Section title={tSections(K.Patients.Register.sections.address)}>
              <Controller
                name="address"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={tFields(K.Patients.Register.fields.address)}
                    placeholder={tPlaceholders(
                      K.Patients.Register.placeholders.address,
                    )}
                    required
                    fullWidth
                    multiline
                    minRows={2}
                    error={Boolean(errors.address)}
                    helperText={resolveFieldHelperText(
                      errors.address?.message,
                    )}
                  />
                )}
              />
            </Section>

            <Stack
              direction={{ xs: "column-reverse", sm: "row" }}
              spacing={1.5}
              justifyContent="flex-end"
            >
              <Button
                type="button"
                variant="text"
                onClick={() => router.back()}
                disabled={isPending}
              >
                {tRegister(K.Patients.Register.cancel)}
              </Button>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={isPending}
              >
                {tRegister(K.Patients.Register.submit)}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <Stack spacing={2}>
      <Typography variant="subtitle1" fontWeight={600}>
        {title}
      </Typography>
      <Stack spacing={2}>{children}</Stack>
    </Stack>
  );
}
