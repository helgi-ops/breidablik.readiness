import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePlayerTrend,
  type DailyZ,
  type TrendForecastPayload,
} from "./index";

/**
 * Pull the last 14 days of z_today for a player from
 * `athlete_decision_history` and compute the trend forecast.
 * Returns the payload regardless of confidence — the UI decides whether
 * to render it.
 */
export async function loadPlayerTrend(
  sb: SupabaseClient,
  args: { playerId: string; todayIso: string },
): Promise<TrendForecastPayload> {
  const startIso = (() => {
    const d = new Date(`${args.todayIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 13);
    return d.toISOString().slice(0, 10);
  })();

  const { data, error } = await sb
    .from("athlete_decision_history")
    .select("decision_date, z_today")
    .eq("player_id", args.playerId)
    .gte("decision_date", startIso)
    .lte("decision_date", args.todayIso)
    .order("decision_date", { ascending: true });

  if (error) {
    return {
      daysObserved: 0,
      slopePerDay: null,
      r2: null,
      direction: "stable",
      confidence: "low",
      projectedZ3d: null,
      projectedSten3d: null,
      todayZ: null,
      todaySten: null,
    };
  }

  const rows: DailyZ[] = ((data ?? []) as Array<{ decision_date: string; z_today: number | null }>)
    .map((r) => ({ date: r.decision_date, z: Number(r.z_today ?? 0) }))
    .filter((r) => Number.isFinite(r.z));

  return computePlayerTrend(rows);
}
