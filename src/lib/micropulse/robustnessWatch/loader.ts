/**
 * Async data layer for the robustness watch (fusion #5).
 *
 * Composes the existing loaders — signalPack (the "why"), cmjFatigue (neuromuscular
 * slope + type), playerTrendForecast (trajectory) — and adds the new mechanical
 * personal-z signals (running asymmetry / footstrike / RHIE) computed from the
 * newly-mapped Catapult columns. Assembles a FOCUSED injury-risk input from the
 * same data to drive the level, then runs the pure combiner.
 *
 * Read-only; never touches the canonical verdict. The mechanical columns are null
 * until the Catapult re-sync lands the new OpenField Reporting_Parameters — the
 * contributors then simply skip and confidence stays where the core signals put it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeRobustnessWatch, type RobustnessWatch } from "./index";
import { loadPlayerSignalPack } from "@/lib/micropulse/signalPack/loader";
import { ewmaAcwr } from "@/lib/micropulse/signalPack";
import { loadCmjFatigue } from "@/lib/micropulse/cmjFatigue/loader";
import { loadPlayerTrend } from "@/lib/micropulse/playerTrendForecast/loader";
import { buildInjuryRiskDecision, type InjuryRiskInput } from "@/lib/micropulse/injuryRisk";
import type { Voice } from "@/lib/micropulse/signalPack";

const LOAD_DAYS = 35;      // EWMA runway for the internal-load ACWR
const NORM_DAYS = 28;      // personal-norm window for the mechanical signals

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
/** Personal z of the latest value vs its own window mean/SD (>=5 obs, real spread). */
function personalZ(vals: number[]): { z: number | null; latest: number | null } {
  if (!vals.length) return { z: null, latest: null };
  const latest = vals[vals.length - 1];
  if (vals.length < 5) return { z: null, latest };
  const m = mean(vals); const sd = stdev(vals);
  if (m == null || sd == null || sd <= 0.01) return { z: null, latest };
  return { z: Math.round(((latest - m) / sd) * 100) / 100, latest };
}

type LoadRow = {
  date: string;
  session_load?: number | null;
  decelerations: number | null;
  high_speed_distance: number | null;
  running_symmetry: number | null;
  running_deviation: number | null;
  running_imbalance: number | null;
  footstrikes: number | null;
  rhie_bouts: number | null;
};

/** Per-day "asymmetry" where HIGHER = worse, preferring imbalance > deviation > (100 - symmetry). */
function asymmetryValue(r: LoadRow): number | null {
  const imb = num(r.running_imbalance);
  if (imb != null) return imb;
  const dev = num(r.running_deviation);
  if (dev != null) return dev;
  const sym = num(r.running_symmetry);
  if (sym != null) return Math.max(0, 100 - sym); // symmetry% -> asymmetry%
  return null;
}

/**
 * Build one player's robustness watch as-of a date. Voice defaults to coach.
 */
export async function loadRobustnessWatch(
  sb: SupabaseClient,
  teamId: string,
  playerId: string,
  playerName: string,
  asOf: string,
  voice: Voice = "coach",
): Promise<RobustnessWatch> {
  const loadSince = addISO(asOf, -LOAD_DAYS);
  const normSince = addISO(asOf, -NORM_DAYS);

  const [packBundle, cmj, trend, loadRes, sRpeRes] = await Promise.all([
    loadPlayerSignalPack(sb, teamId, playerId, asOf, voice),
    loadCmjFatigue(sb, teamId, playerId, asOf),
    loadPlayerTrend(sb, { playerId, todayIso: asOf }),
    sb.from("player_external_load_daily")
      .select("date, decelerations, high_speed_distance, running_symmetry, running_deviation, running_imbalance, footstrikes, rhie_bouts")
      .eq("player_id", playerId)
      .in("source", ["catapult", "manual"])
      .gte("date", loadSince)
      .lte("date", asOf)
      .order("date"),
    sb.from("session_rpe_entries")
      .select("session_date, session_load")
      .eq("player_id", playerId)
      .gte("session_date", loadSince)
      .lte("session_date", asOf)
      .order("session_date"),
    // wellness personal-z is already computed inside cmjFatigue; the injury
    // input's sleep/soreness z are taken from the signal pack's own reads.
  ]);

  const loadRows = ((loadRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    date: String(r.date ?? "").slice(0, 10),
    decelerations: num(r.decelerations),
    high_speed_distance: num(r.high_speed_distance),
    running_symmetry: num(r.running_symmetry),
    running_deviation: num(r.running_deviation),
    running_imbalance: num(r.running_imbalance),
    footstrikes: num(r.footstrikes),
    rhie_bouts: num(r.rhie_bouts),
  })) as LoadRow[];

  const inNorm = loadRows.filter((r) => r.date >= normSince);

  // Internal-load EWMA ACWR (0-filled daily series) for the level + hasLoadSpike.
  const sRpeByDate = new Map<string, number>();
  for (const r of (sRpeRes.data ?? []) as Array<Record<string, unknown>>) {
    const d = String(r.session_date ?? "").slice(0, 10); const v = num(r.session_load);
    if (d && v != null) sRpeByDate.set(d, (sRpeByDate.get(d) ?? 0) + v);
  }
  const loadDaily: number[] = []; let loadDays = 0;
  for (let i = LOAD_DAYS - 1; i >= 0; i--) { const d = addISO(asOf, -i); const v = sRpeByDate.get(d); loadDaily.push(v ?? 0); if (v != null) loadDays++; }
  const acwr = ewmaAcwr(loadDaily).ratio;

  // Deceleration + HSR ACWR (from the load table) for the gpsSpike context.
  const decelDaily: number[] = []; const hsrDaily: number[] = [];
  const decelBy = new Map<string, number>(); const hsrBy = new Map<string, number>();
  for (const r of loadRows) { if (r.decelerations != null) decelBy.set(r.date, r.decelerations); if (r.high_speed_distance != null) hsrBy.set(r.date, r.high_speed_distance); }
  for (let i = LOAD_DAYS - 1; i >= 0; i--) { const d = addISO(asOf, -i); decelDaily.push(decelBy.get(d) ?? 0); hsrDaily.push(hsrBy.get(d) ?? 0); }
  const decelAcwr = ewmaAcwr(decelDaily).ratio;
  const hsrAcwr = ewmaAcwr(hsrDaily).ratio;
  const gpsSpike = (decelAcwr != null && decelAcwr >= 1.5) || (hsrAcwr != null && hsrAcwr >= 1.5);
  const hasLoadSpike = (acwr != null && acwr >= 1.3) || gpsSpike;

  // Mechanical personal-z signals (null until the re-sync lands the columns).
  const asymVals = inNorm.map(asymmetryValue).filter((v): v is number => v != null);
  const asym = personalZ(asymVals);
  const footVals = inNorm.map((r) => r.footstrikes).filter((v): v is number => v != null);
  const foot = personalZ(footVals);
  const rhieVals = inNorm.map((r) => r.rhie_bouts).filter((v): v is number => v != null);
  const rhie = personalZ(rhieVals);

  // Personal sleep/soreness z for the injury input — reuse the signal pack's sleep
  // read (its cmj/sleep contributors already encode the personal-norm flag). We map
  // a flagged sleep contributor to a conservative z so the recovery rule can fire.
  const sleepSig = packBundle?.pack.contributors.find((c) => c.key === "sleep");
  const sleepZ = sleepSig?.flagged ? -1.2 : sleepSig ? 0 : null;

  const injuryInput: InjuryRiskInput = {
    acwr: acwr ?? undefined,
    gpsSpike,
    sleepZ,
    runningAsymmetryZ: asym.z,
    footstrikesZ: foot.z,
    rhieBoutsZ: rhie.z,
    cmjSlopeZ: cmj.cmjSlopeZ,
    cmjRecoveryDeficit: cmj.cmjRecoveryDeficit,
  };
  const injury = buildInjuryRiskDecision(injuryInput);

  return computeRobustnessWatch({
    asOf,
    playerId,
    playerName,
    signalPack: packBundle?.pack ?? { contributors: [], flaggedCount: 0, citation: "" },
    injury,
    cmj: cmj.read,
    trend: trend.direction,
    mechanical: {
      runningAsymmetryZ: asym.z,
      runningAsymmetryPct: asym.latest,
      footstrikesZ: foot.z,
      rhieBoutsZ: rhie.z,
      hasLoadSpike,
    },
    coverage: { loadDays, cmjTests: cmj.nTests },
  });
}
