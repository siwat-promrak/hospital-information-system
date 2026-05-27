"use client";

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import { useState } from "react";

import PatientInfoDialog from "@/components/patient/PatientInfoDialog";
import PatientListRow from "@/components/patient/PatientListRow";
import type { PatientResponse } from "@/types/patient.types";

interface PatientListClientProps {
  patients: readonly PatientResponse[];
  locale: string;
}

/**
 * Client wrapper that holds the patients list rows + the read-only
 * patient-info dialog together. Owns the (selected patient, open) state
 * so each row's `onClick` opens the dialog without needing per-row
 * dialog instances.
 *
 * The list response already carries the full `PatientResponse` for every
 * row (see `apps/web/src/types/patient.types.ts`), so the dialog renders
 * straight from the row's data — no extra `getPatient(id)` fetch.
 */
export default function PatientListClient({
  patients,
  locale,
}: PatientListClientProps) {
  const [selectedPatient, setSelectedPatient] =
    useState<PatientResponse | null>(null);
  const [open, setOpen] = useState(false);

  function handleOpen(patient: PatientResponse) {
    setSelectedPatient(patient);
    setOpen(true);
  }

  function handleClose() {
    setOpen(false);
  }

  return (
    <>
      <List sx={{ py: 0 }}>
        {patients.map((patient, index) => (
          <Box key={patient.id}>
            {index > 0 ? <Divider component="li" /> : null}
            <PatientListRow
              patient={patient}
              onClick={() => handleOpen(patient)}
            />
          </Box>
        ))}
      </List>
      <PatientInfoDialog
        patient={selectedPatient}
        open={open}
        onClose={handleClose}
        locale={locale}
      />
    </>
  );
}
