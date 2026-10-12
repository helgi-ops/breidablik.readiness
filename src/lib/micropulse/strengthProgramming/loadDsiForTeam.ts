import "server-only";

/**
 * Roster-wide DSI terms — the CMJ (ballistic) + IMTP (isometric) trial-mean peak forces for every
 * active player on a team, in the SAME way `buildRtpAssessment` extracts them per player, but in two
 * paginated queries instead of N heavy per-player assessments. Used to (a) classify each player's DSI
 * against the squad distribution and (b) feed the `?all=1` micro-dose cards.
 *
 * Server-only (service-role queries). Pure extraction — no readiness colour, no decision, no writes.
 */

import { fetchAllPages } from "@/lib/supabasePaginate";
import { BATTERY_CODES } from "@/lib/integrations/vald/battery";
import { squadDsiThresholds, type DsiCoverageInput, type SquadDsiThresholds } from "./deriveDsi";

type Sb = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Latest-test trial-mean of one numeric field, grouped by player (rows pre-sorted newest-first). */
function latestTrialMean<R extends { microplayer_id?: string | null; raw_test_id?: string | null; test_timestamp?: string | null }>(
  rows: R[],
  valueOf: (r: R) => number | null,
  countsRow: (r: R) => boolean,
): Map<string, { value: number; trialCount: number }> {
  // newest-first per player → first raw_test_id seen is the latest test
  const latestTestByPlayer = new Map<string, string>();
  const byPlayer = new Map<string, R[]>();
  for (const r of rows) {
    const pid = String(r.microplayer_id ?? "");
    if (!pid || !r.raw_test_id) continue;
    if (!latestTestByPlayer.has(pid)) latestTestByPlayer.set(pid, String(r.raw_test_id));
    (byPlayer.get(pid) ?? byPlayer.set(pid, []).get(pid)!).push(r);
  }
  const out = new Map<string, { value: number; trialCount: number }>();
  for (const [pid, list] of byPlayer) {
    const testId = latestTestByPlayer.get(pid);
    const trials = list.filter((r) => String(r.raw_test_id) === testId && countsRow(r));
    const vals = trials.map(valueOf).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (vals.length) out.set(pid, { value: vals.reduce((a, b) => a + b, 0) / vals.length, trialCount: vals.length });
  }
  return out;
}

/** CMJ + IMTP trial-mean peak forces for every active player on the team. */
export async function loadDsiForTeam(sb: Sb, teamId: string): Promise<Map<string, DsiCoverageInput>> {
  const { data: roster } = await sb.from("players").select("id").eq("team_id", teamId).neq("is_active", false);
  const ids = ((roster ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (!ids.length) return new Map();

  const [cmjRows, imtpRows] = await Promise.all([
    fetchAllPages<Record<string, unknown>>((from, to) =>
      sb.from("vald_forcedecks_results")
        .select("microplayer_id, raw_test_id, test_timestamp, peak_force_n, is_valid, test_type")
        .in("microplayer_id", ids)
        .order("test_timestamp", { ascending: false })
        .range(from, to) as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>,
    ).catch(() => [] as Record<string, unknown>[]),
    fetchAllPages<Record<string, unknown>>((from, to) =>
      sb.from("vald_test_metrics")
        .select("microplayer_id, raw_test_id, test_timestamp, metric_code, limb, value")
        .in("microplayer_id", ids)
        .eq("test_type", "IMTP")
        .in("metric_code", BATTERY_CODES.imtpPeakForce)
        .order("test_timestamp", { ascending: false })
        .range(from, to) as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>,
    ).catch(() => [] as Record<string, unknown>[]),
  ]);

  // CMJ: valid + CMJ family (test_type null or ~cmj), mirror buildRtpAssessment's filter.
  const cmj = latestTrialMean(
    (cmjRows as Array<Record<string, unknown>>).filter((r) => r.is_valid !== false && (r.test_type == null || /cmj/i.test(String(r.test_type)))) as Array<{ microplayer_id?: string | null; raw_test_id?: string | null; test_timestamp?: string | null; peak_force_n?: number | null }>,
    (r) => (typeof r.peak_force_n === "number" ? r.peak_force_n : null),
    () => true,
  );
  // IMTP: prefer Trial limb (fall back to Both) — match the per-player extractor.
  const imtpRowsTyped = imtpRows as Array<{ microplayer_id?: string | null; raw_test_id?: string | null; test_timestamp?: string | null; limb?: string | null; value?: number | null }>;
  const hasTrialByTest = new Set(imtpRowsTyped.filter((r) => r.limb === "Trial").map((r) => String(r.raw_test_id)));
  const imtp = latestTrialMean(
    imtpRowsTyped,
    (r) => (typeof r.value === "number" ? r.value : null),
    (r) => (hasTrialByTest.has(String(r.raw_test_id)) ? r.limb === "Trial" : r.limb === "Both"),
  );

  const out = new Map<string, DsiCoverageInput>();
  for (const id of ids) {
    const c = cmj.get(id);
    const i = imtp.get(id);
    out.set(id, {
      cmjPeakForceN: c?.value ?? null,
      imtpPeakForceN: i?.value ?? null,
      cmjTrialCount: c?.trialCount ?? null,
      imtpTrialCount: i?.trialCount ?? null,
    });
  }
  return out;
}

/** The squad's valid DSI ratios (players with both terms) → tertile thresholds, or null if too few. */
export function squadThresholdsFromMap(map: Map<string, DsiCoverageInput>): SquadDsiThresholds | null {
  const ratios: number[] = [];
  for (const v of map.values()) {
    if (typeof v.cmjPeakForceN === "number" && typeof v.imtpPeakForceN === "number" && v.imtpPeakForceN > 0) {
      ratios.push(v.cmjPeakForceN / v.imtpPeakForceN);
    }
  }
  return squadDsiThresholds(ratios);
}
