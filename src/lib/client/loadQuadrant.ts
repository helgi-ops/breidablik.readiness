/**
 * computeLoadQuadrant — Fitness × Fatigue quadrant for one player/client.
 *
 * Pure-ish helper (takes a Supabase admin client + playerId) so both the
 * client-facing endpoint (/api/client/load-quadrant) and the trainer-facing
 * one (/api/trainer/client/[id]/load-quadrant) compute it identically.
 *
 * Derived from session_rpe_entries (gym + sport + anything), so it matches the
 * Foster / ACWR numbers shown elsewhere.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type LoadQuadrant = {
  acute_daily: number;
  chronic_daily: number;
  older_chronic: number;
  recent_chronic: number;
  acwr: number | null;
  fitness_high: boolean;
  fatigue_high: boolean;
  zone: "primed" | "overreaching" | "detrained" | "danger" | "baseline";
  confidence: "low" | "medium" | "high";
  days_with_data: number;
};

function dayIso(offsetDaysAgo: number): string {
  const d = new Date(); d.setDate(d.getDate() - offsetDaysAgo);
  return d.toISOString().slice(0, 10);
}

export async function computeLoadQuadrant(
  sb: SupabaseClient,
  playerId: string,
): Promise<LoadQuadrant> {
  const since28 = dayIso(27);
  const { data } = await sb
    .from("session_rpe_entries")
    .select("session_date, rpe, duration_minutes, session_load")
    .eq("player_id", playerId)
    .gte("session_date", since28);

  const byDate = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ session_date: string; rpe: number | null; duration_minutes: number | null; session_load: number | null }>) {
    const load = r.session_load != null
      ? Number(r.session_load)
      : (r.rpe != null && r.duration_minutes != null ? Number(r.rpe) * Number(r.duration_minutes) : 0);
    byDate.set(r.session_date, (byDate.get(r.session_date) ?? 0) + (Number.isFinite(load) ? load : 0));
  }

  const loadOn = (offset: number) => byDate.get(dayIso(offset)) ?? 0;
  const sumRange = (from: number, toExclusive: number) => {
    let s = 0; for (let i = from; i < toExclusive; i++) s += loadOn(i); return s;
  };

  const acuteDaily = sumRange(0, 7) / 7;
  const chronicDaily = sumRange(0, 28) / 28;
  const recentChronic = sumRange(0, 14) / 14;
  const olderChronic = sumRange(14, 28) / 14;
  const acwr = chronicDaily > 0 ? Math.round((acuteDaily / chronicDaily) * 100) / 100 : null;

  const daysWithData = byDate.size;
  let confidence: LoadQuadrant["confidence"] = "low";
  if (daysWithData >= 12) confidence = "high";
  else if (daysWithData >= 6) confidence = "medium";

  const fitnessHigh = chronicDaily >= olderChronic && chronicDaily > 0;
  const fatigueHigh = acwr != null && acwr > 1.3;

  let zone: LoadQuadrant["zone"] = "baseline";
  if (daysWithData >= 6 && chronicDaily > 0) {
    if (fitnessHigh && !fatigueHigh) zone = "primed";
    else if (fitnessHigh && fatigueHigh) zone = "overreaching";
    else if (!fitnessHigh && !fatigueHigh) zone = "detrained";
    else zone = "danger";
  }

  return {
    acute_daily: Math.round(acuteDaily),
    chronic_daily: Math.round(chronicDaily),
    older_chronic: Math.round(olderChronic),
    recent_chronic: Math.round(recentChronic),
    acwr,
    fitness_high: fitnessHigh,
    fatigue_high: fatigueHigh,
    zone,
    confidence,
    days_with_data: daysWithData,
  };
}
