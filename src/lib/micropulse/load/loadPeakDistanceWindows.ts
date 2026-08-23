/**
 * Best peak-period TOTAL-distance rate (m/min) at the 1/3/5-min windows for one player,
 * from player_load_peak_period (metric 'distance', the MII peak-period feed). Shared by the
 * peak-demands benchmark card and Total Player Analysis so both read the shape identically.
 * Total distance, NOT HIR — feeds computePeakShape (context only, never graded vs Table 2).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadPeakDistanceWindows(
  sb: SupabaseClient, playerId: string,
): Promise<{ w1: number | null; w3: number | null; w5: number | null } | null> {
  const { data } = await sb.from("player_load_peak_period")
    .select("window_min, value").eq("player_id", playerId).eq("metric", "distance");
  const best = new Map<number, number>();
  for (const r of (data ?? []) as Array<{ window_min: number | string | null; value: number | string | null }>) {
    const w = Number(r.window_min), v = Number(r.value);
    if (Number.isFinite(w) && Number.isFinite(v)) best.set(w, Math.max(best.get(w) ?? -Infinity, v));
  }
  return best.size ? { w1: best.get(1) ?? null, w3: best.get(3) ?? null, w5: best.get(5) ?? null } : null;
}
