/**
 * Batched CMJ neuromuscular-freshness read for a whole squad (one query).
 *
 * Per player: the latest CMJ jump height vs his own 6-week baseline median → a percent
 * drop. This is the Janetzki-2023 readiness marker — a drop = neuromuscular fatigue even
 * when the wellness check-in reads green. Reuses the app-wide VALD thresholds so it agrees
 * with the VALD snapshot elsewhere. Descriptive — the fit surfaces it as a distinct labelled
 * signal beside the readiness colour, never AS the colour.
 */

import { getSupabaseServer } from "@/lib/supabaseServer";
import { VALD_THRESHOLDS } from "@/lib/integrations/vald/config";

export type CmjFreshness = {
  playerId: string;
  latest: number | null;      // newest test's mean jump height (cm)
  baseline: number | null;    // median of prior tests in the window (cm)
  dropPct: number | null;     // (latest - baseline) / baseline * 100 — negative = below norm
  latestAt: string | null;    // ISO of the newest test
  daysSince: number | null;   // days from `date` to the latest test (freshness)
  nBaseline: number;          // prior tests contributing to the baseline
};

const median = (v: number[]): number | null => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const isCmjRow = (t: unknown) => { const s = String(t ?? "").toLowerCase(); return s === "" || s.includes("cmj"); };

export async function loadCmjFreshnessForTeam(teamId: string, date: string): Promise<Map<string, CmjFreshness>> {
  const sb = getSupabaseServer();
  const end = new Date(`${date}T23:59:59.999Z`);
  const start = new Date(`${date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - VALD_THRESHOLDS.baselineWindowDays);

  const { data } = await sb.from("vald_forcedecks_results")
    .select("microplayer_id, test_timestamp, jump_height_cm, is_valid, test_type")
    .eq("team_id", teamId).eq("is_valid", true)
    .gte("test_timestamp", start.toISOString()).lte("test_timestamp", end.toISOString())
    .order("test_timestamp", { ascending: false }).limit(5000);

  // Group valid CMJ trials by player → by test DAY, averaging trials within a day (per-test mean).
  const byPlayer = new Map<string, Map<string, { sum: number; n: number; at: string }>>();
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const pid = String(r.microplayer_id ?? ""); if (!pid) continue;
    if (!isCmjRow(r.test_type)) continue;
    const jh = Number(r.jump_height_cm);
    if (!Number.isFinite(jh)) continue;
    const at = String(r.test_timestamp ?? ""); if (!at) continue;
    const day = at.slice(0, 10);
    const days = byPlayer.get(pid) ?? new Map();
    const cur = days.get(day) ?? { sum: 0, n: 0, at };
    cur.sum += jh; cur.n += 1;
    if (at > cur.at) cur.at = at; // keep the newest timestamp within the day
    days.set(day, cur); byPlayer.set(pid, days);
  }

  const out = new Map<string, CmjFreshness>();
  for (const [pid, days] of byPlayer.entries()) {
    const perDay = [...days.entries()]
      .map(([day, v]) => ({ day, mean: v.sum / v.n, at: v.at }))
      .sort((a, b) => (a.day < b.day ? 1 : -1)); // newest first
    const newest = perDay[0];
    const prior = perDay.slice(1).map((d) => d.mean);
    const baseline = prior.length >= VALD_THRESHOLDS.baselineMinTests ? median(prior) : null;
    const latest = newest?.mean ?? null;
    const dropPct = latest != null && baseline != null && baseline > 0 ? ((latest - baseline) / baseline) * 100 : null;
    const daysSince = newest?.at ? Math.floor((end.getTime() - new Date(newest.at).getTime()) / 86400000) : null;
    out.set(pid, { playerId: pid, latest, baseline, dropPct, latestAt: newest?.at ?? null, daysSince, nBaseline: prior.length });
  }
  return out;
}
