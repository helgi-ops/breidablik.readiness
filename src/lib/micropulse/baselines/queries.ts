import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { AthleteMetricBaseline } from "./index";

/**
 * Fetch all baselines for a single player.
 * Returns a map keyed by metric_key for O(1) lookup.
 */
export async function getPlayerBaselines(
  playerId: string,
): Promise<Map<string, AthleteMetricBaseline>> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("athlete_metric_baselines")
    .select("*")
    .eq("player_id", playerId);
  if (error) throw error;

  const map = new Map<string, AthleteMetricBaseline>();
  for (const row of (data ?? []) as AthleteMetricBaseline[]) {
    map.set(row.metric_key, row);
  }
  return map;
}

/**
 * Fetch a single baseline. Returns null if not present.
 */
export async function getBaseline(
  playerId: string,
  metricKey: string,
): Promise<AthleteMetricBaseline | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("athlete_metric_baselines")
    .select("*")
    .eq("player_id", playerId)
    .eq("metric_key", metricKey)
    .maybeSingle();
  if (error) throw error;
  return (data as AthleteMetricBaseline | null) ?? null;
}

/**
 * Trigger an immediate baseline refresh (calls the SQL function).
 * The cron runs nightly anyway; this is for manual rebuilds.
 */
export async function refreshAthleteMetricBaselines(): Promise<number> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb.rpc("refresh_athlete_metric_baselines");
  if (error) throw error;
  return Number(data) || 0;
}
