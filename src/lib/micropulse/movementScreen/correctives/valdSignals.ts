import "server-only";

/**
 * VALD → corrective signals. Reads a player's RECENT force-plate / dynamometer
 * tests (ForceFrame hip, NordBord hamstring, ForceDecks CMJ) and turns the
 * variables that matter — left/right asymmetry, CMJ reactive strength (RSI-mod),
 * eccentric duration — into the SAME corrective compensations the movement
 * screen infers visually. Objective second source: each signal carries its
 * origin + value + age so the coach sees why. Only tests within the lookback
 * window count (stale force data must not drive today's prescription).
 *
 * Screening / training only — never a diagnosis, never the readiness colour.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bi } from "../registry";
import type { CompensationKey } from "./mapping";

/** How far back a VALD test still counts toward today's correctives. */
export const VALD_CORRECTIVE_LOOKBACK_DAYS = 56; // 8 weeks

export type ValdSignal = {
  compensation: CompensationKey;
  source: string; // "VALD ForceFrame" | "VALD NordBord" | "VALD ForceDecks"
  detail: Bi;
  ageDays: number;
  severity: "moderate" | "marked";
};

const round = (n: number) => Math.round(n);
const ageDaysOf = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
/** Standard limb-symmetry thresholds (Grindem 2016; Bishop 2020). */
const asymSeverity = (pct: number): "moderate" | "marked" | null => (pct >= 15 ? "marked" : pct >= 10 ? "moderate" : null);

type FrameRow = { movement_pattern: string | null; body_region: string | null; asymmetry_percent: number | null; test_timestamp: string; is_valid: boolean | null };
type NordRow = { asymmetry_percent: number | null; test_timestamp: string; is_valid: boolean | null };
type DecksRow = { rsi_mod: number | null; eccentric_duration_ms: number | null; asymmetry_percent: number | null; test_timestamp: string; is_valid: boolean | null };

export async function loadValdCorrectiveSignals(sb: SupabaseClient, playerId: string): Promise<ValdSignal[]> {
  const cutoff = new Date(Date.now() - VALD_CORRECTIVE_LOOKBACK_DAYS * 86_400_000).toISOString();
  const out: ValdSignal[] = [];

  const [frame, nord, decks] = await Promise.all([
    sb.from("vald_forceframe_results").select("movement_pattern, body_region, asymmetry_percent, test_timestamp, is_valid").eq("microplayer_id", playerId).gte("test_timestamp", cutoff).order("test_timestamp", { ascending: false }).limit(10),
    sb.from("vald_nordbord_results").select("asymmetry_percent, test_timestamp, is_valid").eq("microplayer_id", playerId).gte("test_timestamp", cutoff).order("test_timestamp", { ascending: false }).limit(5),
    sb.from("vald_forcedecks_results").select("rsi_mod, eccentric_duration_ms, asymmetry_percent, test_timestamp, is_valid").eq("microplayer_id", playerId).gte("test_timestamp", cutoff).order("test_timestamp", { ascending: false }).limit(5),
  ]);

  // ── ForceFrame: latest valid HIP-ABDUCTION test → hip-abductor asymmetry ──
  const frameRow = ((frame.data ?? []) as FrameRow[]).find((r) => r.is_valid !== false && /abduct/i.test(r.movement_pattern ?? ""));
  if (frameRow?.asymmetry_percent != null) {
    const sev = asymSeverity(frameRow.asymmetry_percent);
    if (sev) out.push({
      compensation: "hip_abductor_weakness",
      source: "VALD ForceFrame",
      detail: { en: `Hip-abduction asymmetry ${round(frameRow.asymmetry_percent)}%`, is: `Mjaðma-fráfærslu ósamhverfa ${round(frameRow.asymmetry_percent)}%` },
      ageDays: ageDaysOf(frameRow.test_timestamp),
      severity: sev,
    });
  }

  // ── NordBord: latest valid hamstring test → limb asymmetry ──
  const nordRow = ((nord.data ?? []) as NordRow[]).find((r) => r.is_valid !== false);
  if (nordRow?.asymmetry_percent != null) {
    const sev = asymSeverity(nordRow.asymmetry_percent);
    if (sev) out.push({
      compensation: "limb_asymmetry",
      source: "VALD NordBord",
      detail: { en: `Hamstring asymmetry ${round(nordRow.asymmetry_percent)}%`, is: `Aftanlæris ósamhverfa ${round(nordRow.asymmetry_percent)}%` },
      ageDays: ageDaysOf(nordRow.test_timestamp),
      severity: sev,
    });
  }

  // ── ForceDecks CMJ: asymmetry, RSI-mod (reactive), eccentric duration ──
  const decksRow = ((decks.data ?? []) as DecksRow[]).find((r) => r.is_valid !== false);
  if (decksRow) {
    const age = ageDaysOf(decksRow.test_timestamp);
    if (decksRow.asymmetry_percent != null) {
      const sev = asymSeverity(decksRow.asymmetry_percent);
      if (sev) out.push({ compensation: "limb_asymmetry", source: "VALD ForceDecks", detail: { en: `CMJ asymmetry ${round(decksRow.asymmetry_percent)}%`, is: `CMJ ósamhverfa ${round(decksRow.asymmetry_percent)}%` }, ageDays: age, severity: sev });
    }
    if (decksRow.rsi_mod != null && decksRow.rsi_mod < 0.4) {
      out.push({ compensation: "low_reactive_strength", source: "VALD ForceDecks", detail: { en: `Low CMJ RSI-mod (${decksRow.rsi_mod.toFixed(2)})`, is: `Lág CMJ RSI-mod (${decksRow.rsi_mod.toFixed(2)})` }, ageDays: age, severity: decksRow.rsi_mod < 0.3 ? "marked" : "moderate" });
    }
    if (decksRow.eccentric_duration_ms != null && decksRow.eccentric_duration_ms > 400) {
      out.push({ compensation: "poor_absorption", source: "VALD ForceDecks", detail: { en: `Prolonged CMJ eccentric phase (${round(decksRow.eccentric_duration_ms)} ms) — indicative`, is: `Löng CMJ eccentric-fasi (${round(decksRow.eccentric_duration_ms)} ms) — vísbending` }, ageDays: age, severity: decksRow.eccentric_duration_ms > 500 ? "marked" : "moderate" });
    }
  }

  return out;
}
