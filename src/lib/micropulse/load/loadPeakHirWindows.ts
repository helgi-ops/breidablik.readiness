/**
 * Best peak-period HIGH-INTENSITY-RUNNING rate (m/min) at the 1/3/5-min windows for one player —
 * the >19.8-km/h fraction per window that opens the hard-gated Ju-2022 Table-2 track in
 * computePeakBenchmark. Merges TWO feeds, best m/min per window wins:
 *   - player_peak_window (the Catapult CTR upload): hsr_m (total metres) over the window = m/min,
 *     and carries the account HSR threshold (provenance).
 *   - player_load_peak_period metric='hsr' (the automatic MII sync, IF the org exposes an HSR
 *     interval): value is ALREADY stored per-minute (the sync divides by the window). No threshold
 *     in the MII feed → null (the Ju comparison then labels the threshold "not recorded").
 * Read-only, descriptive.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadPeakHirWindows(
  sb: SupabaseClient, playerId: string,
): Promise<{ perMin: { w1: number | null; w3: number | null; w5: number | null }; thresholdKmh: number | null } | null> {
  const best = new Map<number, number>();
  let thresholdKmh: number | null = null;

  // Feed A — CTR upload (total metres per window; carries the threshold).
  const { data: ctr } = await sb.from("player_peak_window")
    .select("window_min, hsr_m, hsr_threshold_kmh")
    .eq("player_id", playerId).not("window_min", "is", null).not("hsr_m", "is", null);
  for (const r of (ctr ?? []) as Array<{ window_min: number | string | null; hsr_m: number | string | null; hsr_threshold_kmh: number | string | null }>) {
    const w = Number(r.window_min), h = Number(r.hsr_m);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h)) continue;
    best.set(w, Math.max(best.get(w) ?? -Infinity, h / w)); // total metres / window = m/min
    const t = Number(r.hsr_threshold_kmh); if (Number.isFinite(t) && t > 0) thresholdKmh = t;
  }

  // Feed B — automatic MII sync HSR interval (value already m/min).
  const { data: mii } = await sb.from("player_load_peak_period")
    .select("window_min, value").eq("player_id", playerId).eq("metric", "hsr");
  for (const r of (mii ?? []) as Array<{ window_min: number | string | null; value: number | string | null }>) {
    const w = Number(r.window_min), v = Number(r.value);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(v)) continue;
    best.set(w, Math.max(best.get(w) ?? -Infinity, v)); // already m/min
  }

  if (best.size === 0) return null;
  return { perMin: { w1: best.get(1) ?? null, w3: best.get(3) ?? null, w5: best.get(5) ?? null }, thresholdKmh };
}
