/**
 * Return-to-training engine (pure, testable).
 *
 * Builds an individualised return-to-training plan for one player:
 *   • Ceiling = his own HEALTHY baseline — robust load from healthy-window,
 *     non-match, real sessions only (a high-but-not-freak percentile, never the
 *     single freak session, never a squad average, never injured-window time).
 *   • Floor = where he is NOW — his most recent real sessions (may be rehab).
 *   • Plan = bridges floor → ceiling over N weeks, quality-by-quality in a fixed
 *     clinical order (volume → distance → HSR → sprint → change-of-direction
 *     LAST — the most re-injury-prone quality), each unlocked only after the
 *     previous, under an ACWR guardrail (load ramp capped so ACWR ≤ ~1.3).
 *
 * Rules decide; a narrative layer (if any) only explains. ACWR is a spike-size
 * descriptor (Gabbett/Williams), not an injury predictor. For head injuries the
 * load plan is a CEILING, not a stage trigger — graded return is symptom-limited.
 */

export type QualityKey = "volume" | "distance" | "hsr" | "sprint" | "cod";
export const QUALITY_ORDER: QualityKey[] = ["volume", "distance", "hsr", "sprint", "cod"];

export type RttSession = {
  date: string;
  injured: boolean;
  isMatch: boolean;
  estimated: boolean;
  load: number;      // total_player_load
  distance: number;  // total_distance (m)
  hsr: number;       // high_speed_distance (m)
  sprint: number;    // sprint_distance (m)
  cod: number;       // change-of-direction load (IMA CoD, or accel/decel efforts)
  topSpeed: number;  // max_velocity (km/h)
};

export type RttInput = {
  sessions: RttSession[];       // all real catapult sessions (both windows)
  refDate: string;              // "today" (YYYY-MM-DD)
  rttStartDate?: string | null; // graded-return start; null → not started yet
  currentlyInjured: boolean;    // an OPEN injury with no return date
  weeks?: number;               // default 5
  headInjury?: boolean;         // load is a ceiling, not a stage trigger
};

export type RttBaseline = Record<QualityKey, number> & { builtFromHealthySessions: number; topSpeed: number };
export type RttFloor = Record<QualityKey, number> & { topSpeed: number };
export type RttWeekTarget = {
  week: number; quality: QualityKey;
  target: number; pctOfHealthy: number; wow: number; acwr: number;
  locked: boolean; unlockWeek: number; why: string;
};
export type RttResult = {
  currentlyInjured: boolean;
  baseline: RttBaseline;
  floor: RttFloor;
  matchDemand: Record<QualityKey, number> & { topSpeed: number };
  plan: { verdict: string; weeks: RttWeekTarget[] } | null;
  confidence: "high" | "medium" | "low";
};

const RAMP = 1.10;          // ≤10%/week keeps the load ACWR under ~1.3
const P_CEILING = 0.85;     // "robust" reference percentile (not the freak max)
const REINTRO_FRAC = 0.30;  // reintroduce a dormant quality at 30% of its ceiling

const QLABEL: Record<QualityKey, { en: string; is: string; unit: string; dp: number }> = {
  volume:   { en: "Player load", is: "Álag", unit: "", dp: 0 },
  distance: { en: "Distance", is: "Vegalengd", unit: "m", dp: 0 },
  hsr:      { en: "High-speed running", is: "Háhraðahlaup", unit: "m", dp: 0 },
  sprint:   { en: "Sprinting", is: "Sprettur", unit: "m", dp: 0 },
  cod:      { en: "Change of direction", is: "Stefnubreytingar", unit: "", dp: 0 },
};

const QFIELD: Record<QualityKey, keyof RttSession> = { volume: "load", distance: "distance", hsr: "hsr", sprint: "sprint", cod: "cod" };
const val = (s: RttSession, q: QualityKey): number => s[QFIELD[q]] as number;

function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = p * (sortedAsc.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sortedAsc[lo] : sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}
const round = (v: number, dp = 0) => { const f = 10 ** dp; return Math.round(v * f) / f; };
const fmt = (v: number) => Math.round(v).toLocaleString("en-US");

/** Per-quality robust reference (p85) over a session set. */
function ceilingOf(sessions: RttSession[], q: QualityKey): number {
  const vals = sessions.map((s) => val(s, q)).filter((v) => v > 0).sort((a, b) => a - b);
  return round(percentile(vals, P_CEILING), QLABEL[q].dp);
}
function peakOf(sessions: RttSession[]): number {
  const vals = sessions.map((s) => s.topSpeed).filter((v) => v > 0 && v <= 45).sort((a, b) => a - b);
  return round(percentile(vals, P_CEILING), 1);
}

export function computeReturnToTraining(inp: RttInput): RttResult {
  const weeks = inp.weeks ?? 5;
  const real = inp.sessions.filter((s) => !s.estimated);
  const healthyTraining = real.filter((s) => !s.injured && !s.isMatch);
  const healthyMatches = real.filter((s) => !s.injured && s.isMatch);

  // Ceiling = healthy, non-match sessions only. Fall back to his best healthy
  // sessions if thin — NEVER to injured-window or squad data.
  const baseline = { builtFromHealthySessions: healthyTraining.length, topSpeed: peakOf(healthyTraining) } as RttBaseline;
  for (const q of QUALITY_ORDER) baseline[q] = ceilingOf(healthyTraining, q);

  // Match demand (separate target) from healthy match sessions.
  const matchDemand = { topSpeed: peakOf(healthyMatches) } as RttResult["matchDemand"];
  for (const q of QUALITY_ORDER) matchDemand[q] = ceilingOf(healthyMatches, q);

  // Floor = where he is now (his most recent real sessions, any window).
  const recent = [...real].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const floor = { topSpeed: peakOf(recent) } as RttFloor;
  for (const q of QUALITY_ORDER) {
    const vals = recent.map((s) => val(s, q)).filter((v) => v >= 0).sort((a, b) => a - b);
    floor[q] = round(percentile(vals, 0.5), QLABEL[q].dp); // median of recent
  }

  const confidence: RttResult["confidence"] =
    baseline.builtFromHealthySessions >= 8 ? "high" : baseline.builtFromHealthySessions >= 3 ? "medium" : "low";

  // No plan while an open injury has no graded-return start date — the coach
  // starts the plan; it never auto-runs on an injured athlete.
  if (inp.currentlyInjured && !inp.rttStartDate) {
    return { currentlyInjured: true, baseline, floor, matchDemand, plan: null, confidence };
  }

  // Unlock schedule: one quality per step, in clinical order, COD last. Scaled
  // so the last quality unlocks in the final week even if weeks != 5.
  const unlockWeek = (qi: number) => Math.max(1, Math.round(1 + (qi * (weeks - 1)) / (QUALITY_ORDER.length - 1)));

  const targetsByQuality: Record<QualityKey, number[]> = { volume: [], distance: [], hsr: [], sprint: [], cod: [] };
  const weekTargets: RttWeekTarget[] = [];

  for (let w = 1; w <= weeks; w++) {
    for (let qi = 0; qi < QUALITY_ORDER.length; qi++) {
      const q = QUALITY_ORDER[qi];
      const uw = unlockWeek(qi);
      const ceiling = baseline[q] || 0;
      const locked = w < uw;
      const prevArr = targetsByQuality[q];
      const prev = prevArr.length ? prevArr[prevArr.length - 1] : floor[q];

      let target: number;
      if (locked) {
        target = floor[q]; // hold at current level until unlocked
      } else if (w === uw) {
        // Introduce: for a quality he's already doing, ramp the floor; for a
        // dormant quality (sprint/COD ≈ 0), reintroduce at a conservative %.
        const startFromFloor = floor[q] * RAMP;
        const reintro = ceiling * REINTRO_FRAC;
        target = Math.min(ceiling || startFromFloor, Math.max(startFromFloor, floor[q] > 0.05 * ceiling ? startFromFloor : reintro));
      } else {
        target = Math.min(ceiling, prev * RAMP); // ramp toward ceiling, ACWR-capped
      }
      target = round(target, QLABEL[q].dp);
      prevArr.push(target);

      // ACWR on the LOAD quality (the standard guardrail): this week vs the
      // trailing 4-week chronic of the same quality's planned targets.
      const trailing = prevArr.slice(Math.max(0, prevArr.length - 4));
      const chronic = trailing.reduce((a, b) => a + b, 0) / trailing.length;
      const acwr = chronic > 0 ? round(target / chronic, 2) : 0;

      const pctOfHealthy = ceiling > 0 ? Math.round((target / ceiling) * 100) : 0;
      const wow = prev > 0 ? Math.round((target / prev - 1) * 100) : 0;

      weekTargets.push({
        week: w, quality: q, target, pctOfHealthy, wow, acwr, locked, unlockWeek: uw,
        why: locked
          ? `Held — ${QLABEL[q].en} unlocks week ${uw}`
          : `${fmt(target)}${QLABEL[q].unit ? " " + QLABEL[q].unit : ""} = ${pctOfHealthy}% of healthy baseline (${fmt(ceiling)})` +
            `${prev > 0 ? `; last ${fmt(prev)}` : ""}${wow ? `; ${wow > 0 ? "+" : ""}${wow}% keeps ACWR at ${acwr.toFixed(2)}` : ""}`,
      });
    }
  }

  const w1Unlocked = QUALITY_ORDER.filter((_, qi) => unlockWeek(qi) <= 1).map((q) => QLABEL[q].en.toLowerCase());
  const verdict = `Week 1 of ${weeks} · rebuild ${w1Unlocked.join(" + ") || "volume"}` +
    (inp.headInjury ? " · load is a ceiling (symptom-limited return)" : "");

  return { currentlyInjured: inp.currentlyInjured, baseline, floor, matchDemand, plan: { verdict, weeks: weekTargets }, confidence };
}

export { QLABEL as RTT_QUALITY_LABELS };
