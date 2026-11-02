/**
 * Session activity for one PT client — when they last logged anything and how
 * many separate days they trained in the last 7. Reads both logging paths
 * (strength sets + session RPE) so a sport session counts as well.
 *
 * With check-in off the session log is the only sign of life from a client, so
 * this is what the "Last session" column and the "gone quiet" flag rest on.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const QUIET_DAYS = 9;
const LOOKBACK_DAYS = 60;

export type SessionActivity = {
  lastSessionDate: string | null;
  daysSinceLastSession: number | null;
  sessionsLast7d: number;
};

function iso(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export async function getSessionActivity(sb: SupabaseClient, playerId: string): Promise<SessionActivity> {
  const since = iso(LOOKBACK_DAYS);
  const [setRes, rpeRes] = await Promise.all([
    sb.from("pt_exercise_set_logs").select("session_date").eq("player_id", playerId)
      .gte("session_date", since).order("session_date", { ascending: false }).limit(300),
    sb.from("session_rpe_entries").select("session_date").eq("player_id", playerId)
      .gte("session_date", since).order("session_date", { ascending: false }).limit(300),
  ]);
  const rows = [...(setRes.data ?? []), ...(rpeRes.data ?? [])] as Array<{ session_date: string }>;
  const dates = Array.from(new Set(rows.map((r) => r.session_date))).sort().reverse();
  const last = dates[0] ?? null;
  const days = last == null
    ? null
    : Math.floor((new Date(iso(0)).getTime() - new Date(last).getTime()) / 86_400_000);
  const weekStart = iso(6);
  return {
    lastSessionDate: last,
    daysSinceLastSession: days,
    sessionsLast7d: dates.filter((d) => d >= weekStart).length,
  };
}
