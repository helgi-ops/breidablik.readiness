/**
 * Training Momentum — the retention mechanic. A single 0-100 consistency score
 * over the last 14 days, blending check-in consistency, workout frequency, sport
 * activity and the check-in streak. Athletes chase momentum, not data.
 *
 * Vacation-aware: declared break days are excluded so a rest period never tanks
 * the score (no penalty — same promise as the streak/compliance).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getClientBreakRanges, dateInRanges } from "@/lib/notifications/clientBreaks";

export type Momentum = {
  score: number;            // 0-100
  level: "high" | "building" | "low";
  checkins: number;
  workouts: number;
  sport_sessions: number;
  streak: number;
  window_days: number;
};

const WINDOW = 14;
const SPORT_TYPES = new Set(["team_training", "match", "other"]);

function iso(n: number): string { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }

export async function computeMomentum(sb: SupabaseClient, playerId: string): Promise<Momentum> {
  const since = iso(WINDOW - 1);
  const [checkRes, setRes, rpeRes, ranges] = await Promise.all([
    sb.from("readiness_entries").select("entry_date").eq("player_id", playerId).gte("entry_date", iso(40)),
    sb.from("pt_exercise_set_logs").select("session_date").eq("player_id", playerId).gte("session_date", since),
    sb.from("session_rpe_entries").select("session_date, session_type").eq("player_id", playerId).gte("session_date", since),
    getClientBreakRanges(sb, playerId, iso(40)),
  ]);

  const isVac = (d: string) => dateInRanges(d, ranges);
  const checkDates = new Set(((checkRes.data ?? []) as Array<{ entry_date: string }>).map((c) => c.entry_date));
  const checkins = Array.from(checkDates).filter((d) => d >= since).length;
  const workouts = new Set(((setRes.data ?? []) as Array<{ session_date: string }>).map((s) => s.session_date)).size;
  const sportSessions = ((rpeRes.data ?? []) as Array<{ session_date: string; session_type: string | null }>)
    .filter((r) => SPORT_TYPES.has(String(r.session_type ?? "").toLowerCase())).length;

  // Vacation-aware check-in streak (skip vacation days, today pending is ok).
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = iso(i);
    if (isVac(d)) continue;
    if (checkDates.has(d)) { streak++; continue; }
    if (i === 0) continue;
    break;
  }

  // Effective days exclude vacation so rest doesn't dent the score.
  let vacDays = 0;
  for (let i = 0; i < WINDOW; i++) { if (isVac(iso(i))) vacDays++; }
  const effectiveDays = Math.max(1, WINDOW - vacDays);

  const checkinRatio = Math.min(1, checkins / effectiveDays);
  const workoutScore = Math.min(1, workouts / 8);   // ~4 sessions/week
  const sportScore = Math.min(1, sportSessions / 4);
  const streakScore = Math.min(1, streak / WINDOW);
  const score = Math.round(100 * (0.4 * checkinRatio + 0.3 * workoutScore + 0.15 * streakScore + 0.15 * sportScore));

  const level: Momentum["level"] = score >= 75 ? "high" : score >= 45 ? "building" : "low";

  return { score, level, checkins, workouts, sport_sessions: sportSessions, streak, window_days: WINDOW };
}
