/**
 * Training Load Intelligence — the bridge between sports science and PT.
 *
 * Splits the athlete's last-7-day internal load (Foster sRPE = RPE × minutes)
 * by source: STRENGTH (gym) vs SPORT (football, basketball, …) vs total. Most
 * PT apps only see the gym; because we log sport sessions too, we see the whole
 * athlete — and can flag when total load is climbing fast (ACWR) even if the
 * gym work looks fine.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeLoadQuadrant } from "@/lib/client/loadQuadrant";

export type TrainingLoad = {
  strength_7d: number;
  sport_7d: number;
  other_7d: number;
  total_7d: number;
  acwr: number | null;
  status: "low" | "optimal" | "high" | "very_high" | "building";
  confidence: "low" | "medium" | "high";
};

const STRENGTH_TYPES = new Set(["individual", "gym"]);
const SPORT_TYPES = new Set(["team_training", "match", "other"]);

function iso(daysAgo: number): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export async function computeTrainingLoad(
  sb: SupabaseClient,
  playerId: string,
): Promise<TrainingLoad> {
  const since7 = iso(6);
  const { data } = await sb
    .from("session_rpe_entries")
    .select("session_type, rpe, duration_minutes, session_load")
    .eq("player_id", playerId)
    .gte("session_date", since7);

  let strength = 0, sport = 0, other = 0;
  for (const r of (data ?? []) as Array<{ session_type: string | null; rpe: number | null; duration_minutes: number | null; session_load: number | null }>) {
    const load = r.session_load != null
      ? Number(r.session_load)
      : (r.rpe != null && r.duration_minutes != null ? Number(r.rpe) * Number(r.duration_minutes) : 0);
    if (!Number.isFinite(load) || load <= 0) continue;
    const tp = String(r.session_type ?? "").toLowerCase();
    if (STRENGTH_TYPES.has(tp)) strength += load;
    else if (SPORT_TYPES.has(tp)) sport += load;
    else other += load;
  }

  // ACWR + zone come from the same canonical load quadrant (one source of truth).
  const quad = await computeLoadQuadrant(sb, playerId);

  return {
    strength_7d: Math.round(strength),
    sport_7d: Math.round(sport),
    other_7d: Math.round(other),
    total_7d: Math.round(strength + sport + other),
    acwr: quad.acwr,
    status: quad.acwr == null || quad.confidence === "low"
      ? "building"
      : (quad.acwr < 0.8 ? "low" : quad.acwr <= 1.3 ? "optimal" : quad.acwr <= 1.5 ? "high" : "very_high"),
    confidence: quad.confidence,
  };
}
