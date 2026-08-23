/**
 * Best peak-period HIGH-INTENSITY-RUNNING rate (m/min) at the 1/3/5-min windows for one player,
 * from player_peak_window (the Catapult CTR feed, metric hsr_m at the account threshold). This
 * is the >19.8-km/h fraction per window that the MII distance feed does NOT carry — it opens the
 * hard-gated Ju-2022 Table-2 track in computePeakBenchmark. Returns the account HSR threshold too
 * (provenance). Read-only, descriptive.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadPeakHirWindows(
  sb: SupabaseClient, playerId: string,
): Promise<{ perMin: { w1: number | null; w3: number | null; w5: number | null }; thresholdKmh: number | null } | null> {
  const { data } = await sb.from("player_peak_window")
    .select("window_min, hsr_m, hsr_threshold_kmh")
    .eq("player_id", playerId).not("window_min", "is", null).not("hsr_m", "is", null);
  const best = new Map<number, number>();
  let thresholdKmh: number | null = null;
  for (const r of (data ?? []) as Array<{ window_min: number | string | null; hsr_m: number | string | null; hsr_threshold_kmh: number | string | null }>) {
    const w = Number(r.window_min), h = Number(r.hsr_m);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h)) continue;
    const mmin = h / w; // HIR distance over the window length = m/min, comparable to Ju Table 2
    best.set(w, Math.max(best.get(w) ?? -Infinity, mmin));
    const t = Number(r.hsr_threshold_kmh); if (Number.isFinite(t) && t > 0) thresholdKmh = t;
  }
  if (best.size === 0) return null;
  return { perMin: { w1: best.get(1) ?? null, w3: best.get(3) ?? null, w5: best.get(5) ?? null }, thresholdKmh };
}
