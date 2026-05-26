"use client";

import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { useTransition } from "react";

import { FE_PATH } from "@/auth/routes";
import {
  FIND_SLOT_QUERY_PARAM,
  FIND_SLOT_SCOPE,
  type FindSlotScope,
} from "@/find-slot/find-slot.const";
import { K, NS } from "@/i18n/keys.generated";
import { useRouter } from "@/i18n/navigation";

interface FindSlotScopeToggleProps {
  /** Current scope (`mine` or `dept`). Reflects `?scope=` from the URL. */
  current: FindSlotScope;
  /**
   * URL params the toggle MUST preserve when navigating (effective type,
   * date, and any non-doctor filter the user has chosen). Re-emitted
   * verbatim — `undefined` / empty values are stripped.
   */
  preserveParams: Readonly<Record<string, string | undefined>>;
}

/**
 * OWN_PLUS_DEPT-only scope toggle. Two buttons — "Show mine" / "Show
 * department" — that write `?scope=mine|dept` to the URL.
 *
 * Switching to `mine` clears any lingering `?doctorId=` so the BE call
 * pins to the caller's own doctor row (the page resolves the caller's
 * doctor id from `/me` when `scope=mine` and threads it into `listSlots`).
 * Switching to `dept` leaves the doctor filter empty so the multi-doctor
 * merge kicks in; the doctor picker becomes available alongside.
 *
 * Mirrors the F06 schedule page's scope toggle (lives under
 * `components/schedule/ScheduleViewModeSwitch.tsx`), but uses a two-button
 * `ToggleButtonGroup` rather than a single `Switch` because the slot
 * finder lacks the schedule page's column-of-buttons grid context — a
 * pair of pill buttons is the closer match for the filter-row layout.
 */
export default function FindSlotScopeToggle({
  current,
  preserveParams,
}: FindSlotScopeToggleProps) {
  const t = useTranslations(NS.FindSlotScopeToggle);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(
    _event: MouseEvent<HTMLElement>,
    nextValue: FindSlotScope | null,
  ) {
    if (!nextValue || nextValue === current) {
      return;
    }

    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(preserveParams)) {
      if (value !== undefined && value !== "") {
        search.set(key, value);
      }
    }

    // Flipping to `mine` clears any lingering doctor filter — `mine` pins
    // the BE call to the caller's own doctor id, so a leftover
    // `?doctorId=<colleague>` would be silently overwritten and feel buggy.
    if (nextValue === FIND_SLOT_SCOPE.MINE) {
      search.delete(FIND_SLOT_QUERY_PARAM.DOCTOR_ID);
    }

    search.set(FIND_SLOT_QUERY_PARAM.SCOPE, nextValue);

    startTransition(() => {
      router.replace(`${FE_PATH.FIND_SLOT}?${search.toString()}`);
    });
  }

  return (
    <ToggleButtonGroup
      value={current}
      exclusive
      onChange={handleChange}
      size="small"
      color="primary"
      disabled={isPending}
    >
      <ToggleButton value={FIND_SLOT_SCOPE.MINE}>
        {t(K.FindSlot.scopeToggle.mine)}
      </ToggleButton>
      <ToggleButton value={FIND_SLOT_SCOPE.DEPT}>
        {t(K.FindSlot.scopeToggle.dept)}
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
