import "server-only";

/**
 * CCC chaos loader — assembles the player's recent rehab sessions with their
 * directional/reactive density (high-intensity accel + decel efforts per km), the
 * player's own near-full-match density baseline (the 100% chaos reference), and
 * any physio chaos tags, into the pure `ChaosSession[]` the CccCard renders.
 * Mirrors loader.ts's match-row fetch + pod-estimate filter; no new data layer.
 *
 * Chaos index = session efforts/km ÷ match efforts/km (a fraction of own-game
 * reactive demand). READ-ONLY / ADVISORY — never the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { chaosLevelFromIndex, type ChaosSession, type CccChaosLevel } from "./chaos";
import { isCccPhaseKey } from "./continuum";
import { isVcLevel, type VcLevel } from "./visualCognitive";

const num = (v: unknown): number | null => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
const MATCH_SOURCES = ["catapult", "manual", "titan", "wimu"];
const COLS = "date, source, total_distance, player_load, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, ima_accel, ima_decel, raw_payload_json";
const TAG_COLS = "session_date, chaos_level, cognitive_level, note";
/** Below this distance the per-km density is too noisy to suggest a level (physio tags manually). */
const MIN_DISTANCE_M = 500;

type Row = {
  date: string; source: string | null; total_distance: number | null; player_load: number | null;
  accel_b2_3_tot_effs_gen2: number | null; decel_b2_3_tot_effs_gen2: number | null;
  ima_accel: number | null; ima_decel: number | null;
  raw_payload_json: { estimated?: boolean } | null;
};
type TagRow = { session_date: string; chaos_level: string | null; cognitive_level: string | null; note: string | null };

const isReal = (r: Row): boolean => r.raw_payload_json?.estimated !== true;

/** High-intensity accel + decel efforts (band 2–3 preferred, IMA accel/decel fallback). */
function effortsHi(r: Row): number | null {
  const acc = num(r.accel_b2_3_tot_effs_gen2) ?? num(r.ima_accel);
  const dec = num(r.decel_b2_3_tot_effs_gen2) ?? num(r.ima_decel);
  if (acc == null && dec == null) return null;
  return (acc ?? 0) + (dec ?? 0);
}
/** Efforts per km — the directional/reactive density (null below the distance floor). */
function effortsPerKm(r: Row): number | null {
  const e = effortsHi(r);
  const dist = num(r.total_distance);
  if (e == null || dist == null || dist < MIN_DISTANCE_M) return null;
  return e / (dist / 1000);
}
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export type CccChaosLoad = { sessions: ChaosSession[]; matchEffortsPerKm: number | null; baselineN: number };

export async function loadCccChaos(
  sb: SupabaseClient,
  playerId: string,
  opts?: { recentDays?: number },
): Promise<CccChaosLoad> {
  const recentDays = opts?.recentDays ?? 21;
  const todayIso = new Date().toISOString().slice(0, 10);
  const recentFrom = new Date(Date.now() - recentDays * 86_400_000).toISOString().slice(0, 10);

  const [recentRes, minutesRes, tagsRes] = await Promise.all([
    sb.from("player_external_load_daily").select(COLS).eq("player_id", playerId).gte("date", recentFrom).lte("date", todayIso),
    sb.from("match_player_minutes").select("match_date, minutes_played").eq("player_id", playerId),
    sb.from("ccc_session_chaos_tags").select(TAG_COLS).eq("player_id", playerId).gte("session_date", recentFrom),
  ]);

  // Match density baseline — median efforts/km over the player's own near-full matches.
  const nearFull = new Set<string>();
  for (const m of (minutesRes.data ?? []) as Array<{ match_date: string; minutes_played: number | null }>) {
    if (m.minutes_played != null && Number(m.minutes_played) >= 80) nearFull.add(m.match_date);
  }
  let matchEffortsPerKm: number | null = null;
  let baselineN = 0;
  if (nearFull.size) {
    const { data: matchLoad } = await sb.from("player_external_load_daily").select(COLS)
      .eq("player_id", playerId).in("date", [...nearFull]).in("source", MATCH_SOURCES);
    const densities = ((matchLoad ?? []) as Row[]).filter(isReal).map(effortsPerKm).filter((x): x is number => x != null && x > 0);
    baselineN = densities.length;
    matchEffortsPerKm = median(densities);
  }

  // Tags keyed by date (confirmed physio physical + cognitive level + note).
  const tagByDate = new Map<string, { level: CccChaosLevel | null; cognitive: VcLevel | null; note: string | null }>();
  for (const t of (tagsRes.data ?? []) as TagRow[]) {
    tagByDate.set(t.session_date, {
      level: t.chaos_level && isCccPhaseKey(t.chaos_level) ? t.chaos_level : null,
      cognitive: t.cognitive_level && isVcLevel(t.cognitive_level) ? t.cognitive_level : null,
      note: t.note,
    });
  }

  // Recent GPS sessions with real running.
  const recent = ((recentRes.data ?? []) as Row[]).filter(isReal)
    .filter((r) => (num(r.player_load) ?? 0) > 0 || (num(r.total_distance) ?? 0) > 0);
  const byDate = new Map<string, ChaosSession>();
  for (const r of recent) {
    const epk = effortsPerKm(r);
    const idx = epk != null && matchEffortsPerKm && matchEffortsPerKm > 0 ? epk / matchEffortsPerKm : null;
    const tag = tagByDate.get(r.date);
    byDate.set(r.date, {
      date: r.date, source: r.source ?? null,
      distanceM: num(r.total_distance), effortsHi: effortsHi(r), effortsPerKm: epk,
      chaosIndexPct: idx, suggestedLevel: chaosLevelFromIndex(idx),
      confirmedLevel: tag?.level ?? null, cognitiveLevel: tag?.cognitive ?? null, note: tag?.note ?? null,
    });
  }

  // Manual no-GPS tags — a tagged date with no GPS row appears as a session with null GPS.
  for (const [date, tag] of tagByDate) {
    if (byDate.has(date)) continue;
    byDate.set(date, {
      date, source: "manual", distanceM: null, effortsHi: null, effortsPerKm: null,
      chaosIndexPct: null, suggestedLevel: null, confirmedLevel: tag.level, cognitiveLevel: tag.cognitive, note: tag.note,
    });
  }

  const sessions = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  return { sessions, matchEffortsPerKm, baselineN };
}
