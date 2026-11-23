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
import { squadImtpThreshold, suggestGoalFromDsi, type GoalSuggestion } from "./goalSuggestion";

type Sb = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** IMTP peak force per kg of body mass. Only this code: its sibling ISO_BW_REL_FORCE_PEAK is × body weight (about 2.6,
 *  not 26), so the two must never be averaged together. */
const IMTP_N_PER_KG = BATTERY_CODES.imtpRelForcePeak[0];

/** Latest-test trial-mean of one numeric field, grouped by player (rows pre-sorted newest-first). */
function latestTrialMean<R extends { microplayer_id?: string | null; raw_test_id?: string | null; test_timestamp?: string | null }>(
  rows: R[],
  valueOf: (r: R) => number | null,
  countsRow: (r: R) => boolean,
): Map<string, { value: number; trialCount: number; date: string | null }> {
  // newest-first per player → first raw_test_id seen is the latest test
  const latestTestByPlayer = new Map<string, string>();
  const byPlayer = new Map<string, R[]>();
  for (const r of rows) {
    const pid = String(r.microplayer_id ?? "");
    if (!pid || !r.raw_test_id) continue;
    if (!latestTestByPlayer.has(pid)) latestTestByPlayer.set(pid, String(r.raw_test_id));
    (byPlayer.get(pid) ?? byPlayer.set(pid, []).get(pid)!).push(r);
  }
  const out = new Map<string, { value: number; trialCount: number; date: string | null }>();
  for (const [pid, list] of byPlayer) {
    const testId = latestTestByPlayer.get(pid);
    const trials = list.filter((r) => String(r.raw_test_id) === testId && countsRow(r));
    const vals = trials.map(valueOf).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const date = trials.find((r) => r.test_timestamp)?.test_timestamp ?? null;
    if (vals.length) {
      out.set(pid, { value: vals.reduce((a, b) => a + b, 0) / vals.length, trialCount: vals.length, date: date ? String(date).slice(0, 10) : null });
    }
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
        .in("metric_code", [...BATTERY_CODES.imtpPeakForce, IMTP_N_PER_KG])
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
  // Peak force and the per-kg value come in one query (2026-11-23, brief §4a): each is read from its own metric codes.
  type ImtpRow = { microplayer_id?: string | null; raw_test_id?: string | null; test_timestamp?: string | null; metric_code?: string | null; limb?: string | null; value?: number | null };
  const imtpAll = imtpRows as ImtpRow[];
  const byCodes = (codes: readonly string[]) => imtpAll.filter((r) => codes.includes(String(r.metric_code)));
  const trialMean = (rows: ImtpRow[]) => {
    const hasTrialByTest = new Set(rows.filter((r) => r.limb === "Trial").map((r) => String(r.raw_test_id)));
    return latestTrialMean(
      rows,
      (r) => (typeof r.value === "number" ? r.value : null),
      (r) => (hasTrialByTest.has(String(r.raw_test_id)) ? r.limb === "Trial" : r.limb === "Both"),
    );
  };
  const imtp = trialMean(byCodes(BATTERY_CODES.imtpPeakForce));
  const imtpRel = trialMean(byCodes([IMTP_N_PER_KG]));

  const out = new Map<string, DsiCoverageInput>();
  for (const id of ids) {
    const c = cmj.get(id);
    const i = imtp.get(id);
    out.set(id, {
      cmjPeakForceN: c?.value ?? null,
      imtpPeakForceN: i?.value ?? null,
      cmjTrialCount: c?.trialCount ?? null,
      imtpTrialCount: i?.trialCount ?? null,
      // Test dates (2026-11-17): only the goal suggestion reads them (12-month limit); the DSI read does not.
      cmjTestDate: c?.date ?? null,
      imtpTestDate: i?.date ?? null,
      // Same test as the peak force only (a per-kg value from another day is not mixed in).
      imtpRelNkg: i && imtpRel.get(id) && imtpRel.get(id)!.date === i.date ? Number(imtpRel.get(id)!.value.toFixed(1)) : null,
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

/** The DSI goal suggestion for each player on the team (2026-11-17): the same squad read as the coach's DSI chip,
 *  tests within 12 months. Any failure → no suggestions (everything else works as before). */
export async function loadDsiGoalSuggestions(sb: Sb, teamId: string, todayIso: string): Promise<Map<string, GoalSuggestion>> {
  const out = new Map<string, GoalSuggestion>();
  try {
    const map = await loadDsiForTeam(sb, teamId);
    const squad = squadThresholdsFromMap(map);
    // The team's pull per kg (tests within 12 months), for the "strength test first" suggestion.
    const freshRel = [...map.values()].filter((v) => v.imtpTestDate && Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${v.imtpTestDate}T00:00:00Z`) <= 365 * 86_400_000).map((v) => v.imtpRelNkg);
    const imtpSquad = squadImtpThreshold(freshRel);
    if (!squad && !imtpSquad) return out;
    for (const [id, inp] of map) {
      const s = suggestGoalFromDsi(inp, squad, todayIso, imtpSquad);
      if (s) out.set(id, s);
    }
  } catch {
    // no suggestions
  }
  return out;
}
