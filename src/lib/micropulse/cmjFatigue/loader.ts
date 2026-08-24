/**
 * Async data layer for the CMJ neuromuscular-fatigue engine (robustness #5).
 *
 * Pulls one player's CMJ series (vald_forcedecks_results), his recent wellness
 * (readiness_entries: sleep / soreness / stress) for the central-vs-peripheral
 * triangulation, and the last match's HSR (reusing the cmjRecovery match loader,
 * Hader 2019) for the expected-recovery deficit. Runs the pure engine.
 *
 * Read-only; never touches the canonical verdict. Wellness axes are lower-is-worse
 * (1-5, 5 = best), so a NEGATIVE personal z = below his usual = worse — exactly
 * what classifyFatigueType expects.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCmjFatigue, type CmjFatigueInput, type CmjFatigueRead, type CmjPoint } from "./index";
import { loadMatchRecoveryInputs, hoursPostMatch } from "@/lib/micropulse/cmjRecovery/loader";

const CMJ_DAYS = 42;      // trend window for the multi-day slope
const WELLNESS_DAYS = 28; // personal-norm window for sleep/soreness/stress

function addISO(d: string, n: number): string {
  const x = new Date(`${d}T00:00:00.000Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
}
const num = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((s, v) => s + v, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / xs.length);
}
/** Personal z of the latest value vs its own window mean/SD. Null if no spread / no data. */
function personalZ(vals: number[]): number | null {
  if (vals.length < 5) return null; // need a minimally-mature baseline
  const m = mean(vals); const sd = stdev(vals);
  if (m == null || sd == null || sd <= 0.2) return null;
  const latest = vals[vals.length - 1];
  return Math.round(((latest - m) / sd) * 100) / 100;
}

export type CmjFatigueBundle = {
  playerId: string;
  read: CmjFatigueRead;
  /** Number of CMJ tests in the window (for the robustness-watch confidence gate). */
  nTests: number;
  /** The exact inputs the injury-risk rule reads (for the robustness watch assembly). */
  cmjSlopeZ: number | null;
  cmjRecoveryDeficit: number | null;
};

/** Assemble + compute the CMJ fatigue read for one player as-of a date. */
export async function loadCmjFatigue(
  sb: SupabaseClient,
  teamId: string,
  playerId: string,
  asOf: string,
): Promise<CmjFatigueBundle> {
  const cmjSince = `${addISO(asOf, -CMJ_DAYS)}T00:00:00`;
  const wellSince = addISO(asOf, -WELLNESS_DAYS);

  const [cmjRes, wellRes, match] = await Promise.all([
    sb.from("vald_forcedecks_results")
      .select("jump_height_cm, test_timestamp")
      .eq("microplayer_id", playerId)
      .gte("test_timestamp", cmjSince)
      .lte("test_timestamp", `${asOf}T23:59:59`)
      .not("jump_height_cm", "is", null)
      .order("test_timestamp"),
    sb.from("readiness_entries")
      .select("entry_date, sleep_quality, muscle_soreness, stress_mood")
      .eq("player_id", playerId)
      .gte("entry_date", wellSince)
      .lte("entry_date", asOf)
      .order("entry_date"),
    loadMatchRecoveryInputs(sb, teamId, asOf),
  ]);

  const jumps: CmjPoint[] = ((cmjRes.data ?? []) as Array<Record<string, unknown>>)
    .map((r) => ({ ts: String(r.test_timestamp ?? ""), value: num(r.jump_height_cm) }))
    .filter((p): p is CmjPoint => p.ts !== "" && p.value != null);

  const jumpVals = jumps.map((j) => j.value);
  const latestJump = jumpVals.length ? jumpVals[jumpVals.length - 1] : null;
  // Baseline excludes the latest test so "latest vs baseline" is a genuine comparison.
  const priorJumps = jumpVals.slice(0, -1);
  const baselineMean = priorJumps.length ? mean(priorJumps) : null;
  const baselineSd = priorJumps.length ? stdev(priorJumps) : null;
  const observedPctOfBaseline =
    latestJump != null && baselineMean != null && baselineMean > 0
      ? Math.round((latestJump / baselineMean) * 1000) / 10
      : null;

  const wellRows = (wellRes.data ?? []) as Array<Record<string, unknown>>;
  const sleepVals = wellRows.map((r) => num(r.sleep_quality)).filter((v): v is number => v != null);
  const soreVals = wellRows.map((r) => num(r.muscle_soreness)).filter((v): v is number => v != null);
  const stressVals = wellRows.map((r) => num(r.stress_mood)).filter((v): v is number => v != null);

  const hsr = match.hsrByPlayer.get(playerId) ?? null;

  const input: CmjFatigueInput = {
    jumps,
    latestJump,
    baselineMean,
    baselineSd,
    sleepZ: personalZ(sleepVals),
    sorenessZ: personalZ(soreVals),
    stressZ: personalZ(stressVals),
    matchHsr: hsr,
    hoursPostMatch: hoursPostMatch(match.matchDate, asOf),
    observedPctOfBaseline,
  };

  const read = computeCmjFatigue(input);
  return { playerId, read, nTests: jumps.length, cmjSlopeZ: read.cmjSlopeZ, cmjRecoveryDeficit: read.cmjRecoveryDeficit };
}
