import { compareISODatetime } from "@/lib/utils/date";
import type { ScheduleResponse } from "@/types/schedule.types";

export interface LaneAssignment {
  /** 0-indexed lane within the schedule's overlap cluster. */
  lane: number;
  /** Total lanes used in the cluster — drives the chip's % width. */
  lanesInCluster: number;
}

/**
 * Greedy interval-graph coloring for one day column.
 *
 * Walks the day's schedules in start-time order and assigns each to the
 * lowest-indexed lane whose previously-placed schedule has already ended.
 * Schedules that overlap form a "cluster"; every schedule in a cluster
 * receives the same `lanesInCluster`, so the renderer can split the
 * column evenly side-by-side.
 *
 * Two non-overlapping clusters on the same day stay independent — a
 * morning cluster of 3 overlapping schedules occupies thirds while an
 * unrelated afternoon schedule takes the full width.
 *
 * All comparisons go through `compareISODatetime` (dayjs-backed) instead
 * of lexicographic ISO compare so an ISO string with a non-`Z` offset
 * still orders correctly (CLAUDE.md rule 9).
 */
export function assignLanesForDay(
  schedules: readonly ScheduleResponse[],
): Map<string, LaneAssignment> {
  const result = new Map<string, LaneAssignment>();
  const sorted = [...schedules].sort((a, b) =>
    compareISODatetime(a.startAt, b.startAt),
  );

  interface Cluster {
    ids: string[];
    laneEnds: string[];
    maxEnd: string;
  }

  let cluster: Cluster | null = null;

  function commit(c: Cluster) {
    const total = c.laneEnds.length;

    for (const id of c.ids) {
      const prior = result.get(id);

      if (!prior) {
        continue;
      }

      result.set(id, { lane: prior.lane, lanesInCluster: total });
    }
  }

  for (const s of sorted) {
    if (cluster === null || compareISODatetime(s.startAt, cluster.maxEnd) >= 0) {
      if (cluster !== null) {
        commit(cluster);
      }

      cluster = { ids: [], laneEnds: [], maxEnd: s.endAt };
    }

    let lane = -1;

    for (let i = 0; i < cluster.laneEnds.length; i += 1) {
      if (compareISODatetime(cluster.laneEnds[i] ?? "", s.startAt) <= 0) {
        lane = i;
        break;
      }
    }

    if (lane === -1) {
      lane = cluster.laneEnds.length;
      cluster.laneEnds.push(s.endAt);
    } else {
      cluster.laneEnds[lane] = s.endAt;
    }

    cluster.ids.push(s.id);
    cluster.maxEnd =
      compareISODatetime(cluster.maxEnd, s.endAt) > 0 ? cluster.maxEnd : s.endAt;
    // Placeholder lanesInCluster — filled by `commit` when the cluster closes.
    result.set(s.id, { lane, lanesInCluster: 1 });
  }

  if (cluster !== null) {
    commit(cluster);
  }

  return result;
}
