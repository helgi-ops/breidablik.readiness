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
};

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
    .select("session_date, exercise_name, weight_kg, reps")
    .eq("player_id", playerId)
    .gte("session_date", since);

  const rows = ((data ?? []) as Array<{
    session_date: string; exercise_name: string; weight_kg: number | null; reps: number | null;
  }>);

  // Build the week buckets (oldest → newest) so empty weeks still show.
  const weekKeys: string[] = [];
  for (let i = WINDOW_WEEKS - 1; i >= 0; i--) weekKeys.push(mondayOffset(i));
  const byWeek = new Map<string, number>(weekKeys.map((w) => [w, 0]));
  const byLift = new Map<string, number>();

  for (const r of rows) {
    if (r.weight_kg == null || r.reps == null) continue;
    const vol = Number(r.weight_kg) * Number(r.reps);
    if (!Number.isFinite(vol) || vol <= 0) continue;
    const wk = weekStart(r.session_date);
    if (byWeek.has(wk)) byWeek.set(wk, (byWeek.get(wk) ?? 0) + vol);
    const lift = canonicalLift(r.exercise_name) ?? r.exercise_name.trim();
    byLift.set(lift, (byLift.get(lift) ?? 0) + vol);
  }

  const weeks = weekKeys.map((w) => ({ week_start: w, total: Math.round(byWeek.get(w) ?? 0) }));
  const by_lift = Array.from(byLift.entries())
    .map(([lift, total]) => ({ lift, total: Math.round(total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const thisWeek = weeks[weeks.length - 1]?.total ?? 0;
  const lastWeek = weeks[weeks.length - 2]?.total ?? 0;
  const delta_pct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;

  return { weeks, by_lift, this_week: thisWeek, last_week: lastWeek, delta_pct, window_weeks: WINDOW_WEEKS };
}
