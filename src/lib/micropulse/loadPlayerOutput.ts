/**
 * Per-90 tactical output for one player — the OUTPUT leg of Role-Demand Fit.
 *
 * Shared by the route and the validation script so both read output the SAME way. Fixes the
 * cameo-dilution that made ~78% of the squad read "under": instead of the raw per-match OBV
 * total (which is small for a substitute), it MINUTES-NORMALISES each meaningful appearance to
 * a per-90 rate (OBV / minutes x 90) using match_player_minutes, then means those — comparable
 * to the season OBV per-90 baseline. Appearances under MIN_APP_MIN or DNPs are dropped; too few
 * qualifying appearances -> null (the Output tile greys out, honestly). Read-only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutputInput } from "@/lib/micropulse/roleDemandFit";

const OBV_KEY = "OBV";
/** A shorter appearance than this is a cameo — its per-90 extrapolation is too noisy to trust. */
export const MIN_APP_MIN = 45;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const obvOf = (m: unknown): number | null => (m && typeof m === "object" ? num((m as Record<string, unknown>)[OBV_KEY]) : null);

export async function loadPlayerOutput(sb: SupabaseClient, teamId: string, playerId: string): Promise<OutputInput> {
  const [pmRes, minRes, ssRes] = await Promise.all([
    sb.from("player_match_stats").select("match_date, metrics").eq("team_id", teamId).eq("player_id", playerId),
    sb.from("match_player_minutes").select("match_date, minutes_played, is_dnp").eq("team_id", teamId).eq("player_id", playerId),
    sb.from("player_season_stats").select("metrics").eq("team_id", teamId).eq("player_id", playerId),
  ]);

  // OBV per match date (one row per date).
  const obvByDate = new Map<string, number>();
  for (const r of (pmRes.data ?? []) as Array<Record<string, unknown>>) {
    const d = String(r.match_date ?? ""); const v = obvOf(r.metrics);
    if (d && v != null && !obvByDate.has(d)) obvByDate.set(d, v);
  }
  // Minutes per match date (authoritative).
  const minByDate = new Map<string, number>();
  for (const r of (minRes.data ?? []) as Array<Record<string, unknown>>) {
    if (r.is_dnp === true) continue;
    const d = String(r.match_date ?? ""); const m = num(r.minutes_played);
    if (d && m != null && m > 0) minByDate.set(d, m);
  }

  // Minutes-normalised per-90 over meaningful appearances.
  const per90s: number[] = [];
  for (const [d, obv] of obvByDate) {
    const mins = minByDate.get(d);
    if (mins == null) continue;              // no minutes for this appearance -> can't normalise
    if (mins < MIN_APP_MIN) continue;        // cameo -> too noisy to extrapolate
    per90s.push((obv / mins) * 90);
  }
  const per90 = per90s.length ? per90s.reduce((s, v) => s + v, 0) / per90s.length : null;

  // Season OBV baseline (already per-90).
  let baselinePer90: number | null = null;
  for (const s of (ssRes.data ?? []) as Array<Record<string, unknown>>) { const v = obvOf(s.metrics); if (v != null) { baselinePer90 = v; break; } }

  if (per90 == null && baselinePer90 == null) return null;
  return { per90, baselinePer90, matches: per90s.length };
}
