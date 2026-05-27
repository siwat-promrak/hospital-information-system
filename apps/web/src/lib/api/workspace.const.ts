/**
 * Workspace-page URL constants (F18).
 *
 * The workspace list renders two independent paginated sections
 * (Upcoming + History), each with its own query param so stepping
 * through one section doesn't disturb the other.
 */

export const WORKSPACE_QUERY_PARAM = {
  /** 1-indexed page for the "Upcoming" (BOOKED, future) section. */
  UPCOMING_PAGE: "upcomingPage",
  /** 1-indexed page for the "Past visits" (COMPLETED + CANCELLED) section. */
  HISTORY_PAGE: "historyPage",
} as const;
