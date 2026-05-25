"use client";

import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useTranslations } from "next-intl";
import type { ChangeEvent } from "react";
import { useTransition } from "react";

import { FE_PATH } from "@/auth/routes";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";
import {
  SCHEDULE_QUERY_PARAM,
  SCHEDULE_SCOPE,
  type ScheduleScope,
} from "@/lib/api/schedule.const";

interface ScheduleViewModeSwitchProps {
  /**
   * Current scope — `"mine"` or `"dept"`. Defaults are owned by the page
   * (the switch just reflects what's in the URL).
   */
  current: ScheduleScope;
  /**
   * URL params the switch MUST preserve when it navigates (calendar view,
   * month / week date params, the doctor filter if the user already
   * picked one while on "dept"). Re-emitted verbatim — `undefined` /
   * empty values are stripped so cleared filters don't linger.
   */
  preserveParams: Readonly<Record<string, string | undefined>>;
}

/**
 * Mode D ("own+dept" — DOCTOR caller) scope switch. A single MUI `<Switch>`
 * with the label "Show mine only":
 *
 *   - ON  (default) — pushes `?scope=mine` (page filters to the caller's
 *                     own doctor row by passing
 *                     `doctorId=<caller.doctorId>`).
 *   - OFF           — pushes `?scope=dept` (page omits `doctorId`; BE
 *                     returns every schedule in the caller's department,
 *                     since the BE picks the widest scope the caller holds
 *                     — `own-department` here).
 *
 * Default is "mine" on first visit (less surprising for a doctor — their
 * own rows are the primary use case). The page server-component computes
 * the default when `?scope=` is missing; this component just reflects it.
 *
 * Routes back to `/schedules` (always the unified page). Preserves the
 * other URL params (view, month, weekStart, doctorId) verbatim so the
 * user keeps their date / filter context when flipping scope.
 */
export default function ScheduleViewModeSwitch({
  current,
  preserveParams,
}: ScheduleViewModeSwitchProps) {
  const tSchedules = useTranslations(NS.Schedules);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(_event: ChangeEvent<HTMLInputElement>, checked: boolean) {
    const nextValue: ScheduleScope = checked
      ? SCHEDULE_SCOPE.MINE
      : SCHEDULE_SCOPE.DEPT;

    if (nextValue === current) {
      return;
    }

    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(preserveParams)) {
      if (value !== undefined && value !== "") {
        search.set(key, value);
      }
    }

    // Switching back to "mine" clears any lingering `doctorId` so the
    // caller's own rows are the only thing the BE returns — leaving an
    // explicit `doctorId` would silently pin the switch to whoever the
    // user previously picked on "dept" and make the toggle feel buggy.
    if (nextValue === SCHEDULE_SCOPE.MINE) {
      search.delete(SCHEDULE_QUERY_PARAM.DOCTOR_ID);
    }

    search.set(SCHEDULE_QUERY_PARAM.SCOPE, nextValue);

    startTransition(() => {
      router.replace(`${FE_PATH.SCHEDULES}?${search.toString()}`);
    });
  }

  const isMine = current === SCHEDULE_SCOPE.MINE;

  return (
    <FormControlLabel
      control={
        <Switch
          checked={isMine}
          onChange={handleChange}
          disabled={isPending}
          color="primary"
          inputProps={{
            "aria-label": tSchedules(K.Schedules.toggleShowMineOnly),
          }}
        />
      }
      label={tSchedules(K.Schedules.toggleShowMineOnly)}
    />
  );
}
