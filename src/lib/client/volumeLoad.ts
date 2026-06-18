/**
 * Volume load (tonnage) — external mechanical load: Σ (weight × reps) per set.
 *
 * Complements sRPE (internal load): volume load can fall on a deload while sRPE
 * stays high (tired despite less work). Computed from per-set logs so it's exact
 * even when sets carry different weights/reps. Shared by the client- and
 * trainer-facing endpoints so both see the same numbers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalLift } from "@/lib/client/oneRepMax";

export type VolumeLoad = {
  weeks: Array<{ week_start: string; total: number }>; // oldest → newest
  by_lift: Array<{ lift: string; total: number }>;      // descending, window total
  this_week: number;
  last_week: number;
  delta_pct: number | null;
  window_weeks: number;
  /** Acute:chronic workload ratio on tonnage (external load), Gabbett-style. */
  acwr: number | null;
  acute_daily: number;
  chronic_daily: number;
  acwr_status: "low" | "optimal" | "high" | "very_high" | "building";
};

/**
 * Build a "what did this athlete weigh on date X" resolver from their logged
 * body weights, carrying the latest log forward (and using the earliest known
 * log for dates before the first entry). Returns null only when the athlete has
 * never logged a body weight. Shared by volume-load and the trainer session
 * view so bodyweight (BW) sets are valued identically on both sides.
 */
export async function buildBodyweightResolver(
  sb: SupabaseClient,
  playerId: string,
): Promise<(date: string) => number | null> {
  const { data } = await sb
    .from("client_body_weight_logs")
    .select("log_date, weight_kg")
    .eq("player_id", playerId)
    .order("log_date", { ascending: true });
  const logs = ((data ?? []) as Array<{ log_date: string; weight_kg: number | null }>)
    .filter((b) => b.weight_kg != null);
  return (date: string): number | null => {
    if (!logs.length) return null;
    let val: number | null = null;
    for (const b of logs) {
      if (b.log_date <= date) val = Number(b.weight_kg);
      else break;
    }
    return val ?? Number(logs[0].weight_kg);
  };
}

function dayKey(offsetDaysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offsetDaysAgo);
  return d.toISOString().slice(0, 10);
}

const WINDOW_WEEKS = 8;

/** Monday (UTC) of the week containing isoDate. */
function weekStart(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function mondayOffset(weeksAgo: number): string {
  const d = new Date();
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow - weeksAgo * 7);
  return d.toISOString().slice(0, 10);
}

export async function computeVolumeLoad(
  sb: SupabaseClient,
  playerId: string,
): Promise<VolumeLoad> {
  const since = mondayOffset(WINDOW_WEEKS - 1); // start of the oldest week shown
  const { data } = await sb
    .from("pt_exercise_set_logs")
    .select("session_date, exercise_name, weight_kg, reps, is_bodyweight")
    .eq("player_id", playerId)
    .gte("session_date", since);

  const rows = ((data ?? []) as Array<{
    session_date: string; exercise_name: string; weight_kg: number | null; reps: number | null; is_bodyweight: boolean | null;
  }>);

  // Bodyweight sets carry no external weight — substitute the athlete's logged
  // body weight (carried forward from the latest log on/before the session
  // date) so push-ups/pull-ups count toward tonnage instead of being 0.
  const bodyweightAsOf = await buildBodyweightResolver(sb, playerId);

  // Build the week buckets (oldest → newest) so empty weeks still show.
  const weekKeys: string[] = [];
  for (let i = WINDOW_WEEKS - 1; i >= 0; i--) weekKeys.push(mondayOffset(i));
  const byWeek = new Map<string, number>(weekKeys.map((w) => [w, 0]));
  const byLift = new Map<string, number>();
  const byDate = new Map<string, number>();

  for (const r of rows) {
    const effectiveWeight = r.is_bodyweight ? bodyweightAsOf(r.session_date) : r.weight_kg;
    if (effectiveWeight == null || r.reps == null) continue;
    const vol = Number(effectiveWeight) * Number(r.reps);
    if (!Number.isFinite(vol) || vol <= 0) continue;
    const wk = weekStart(r.session_date);
    if (byWeek.has(wk)) byWeek.set(wk, (byWeek.get(wk) ?? 0) + vol);
    const lift = canonicalLift(r.exercise_name) ?? r.exercise_name.trim();
    byLift.set(lift, (byLift.get(lift) ?? 0) + vol);
    byDate.set(r.session_date, (byDate.get(r.session_date) ?? 0) + vol);
  }

  // ── ACWR on tonnage (external load): acute 7d vs chronic 28d daily mean ──
  const dayLoad = (offset: number) => byDate.get(dayKey(offset)) ?? 0;
  let acute = 0, chronic = 0;
  for (let i = 0; i < 28; i++) { const l = dayLoad(i); chronic += l; if (i < 7) acute += l; }
  const acuteDaily = acute / 7;
  const chronicDaily = chronic / 28;
  const acwr = chronicDaily > 0 ? Math.round((acuteDaily / chronicDaily) * 100) / 100 : null;
  const daysWithData = byDate.size;
  let acwr_status: VolumeLoad["acwr_status"] = "building";
  if (daysWithData >= 6 && acwr != null) {
    if (acwr < 0.8) acwr_status = "low";
    else if (acwr <= 1.3) acwr_status = "optimal";
    else if (acwr <= 1.5) acwr_status = "high";
    else acwr_status = "very_high";
  }

  const weeks = weekKeys.map((w) => ({ week_start: w, total: Math.round(byWeek.get(w) ?? 0) }));
  const by_lift = Array.from(byLift.entries())
    .map(([lift, total]) => ({ lift, total: Math.round(total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const thisWeek = weeks[weeks.length - 1]?.total ?? 0;
  const lastWeek = weeks[weeks.length - 2]?.total ?? 0;
  const delta_pct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;

  return {
    weeks, by_lift, this_week: thisWeek, last_week: lastWeek, delta_pct, window_weeks: WINDOW_WEEKS,
    acwr, acute_daily: Math.round(acuteDaily), chronic_daily: Math.round(chronicDaily), acwr_status,
  };
}
