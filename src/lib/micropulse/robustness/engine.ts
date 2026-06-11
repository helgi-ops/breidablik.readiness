/**
 * Robustness engine — turns a player's OWN movement profile into a short,
 * individualised set of capacity-building drills. Deterministic; rules decide.
 *
 *  1. For each load QUALITY (decel, cod, sprint, jumps, accel) we take the
 *     player's recent training-day mean and z-score it against the SQUAD, so a
 *     "dominant demand" = a quality he carries more of than his teammates.
 *  2. We also read his change-of-direction L/R asymmetry — a weakness to
 *     correct, not just a demand to build.
 *  3. Top demands + an asymmetry corrective are matched to catalog drills.
 *
 * This is capacity-building keyed to HIS load — explicitly NOT Unfamiliar Load
 * (which only flags drift vs his own norm). The two are complementary.
 */

import {
  type LoadQuality, type RobustnessDrill,
  QUALITY_META, drillsForQuality, ROBUSTNESS_DRILLS,
} from "./catalog";

export const QUALITIES: LoadQuality[] = ["decel", "cod", "sprint", "jumps", "accel"];

export type DayRow = {
  date: string;
  decel: number;   // high-intensity decel efforts
  cod: number;     // total change-of-direction (L+R, all tiers)
  sprint: number;  // high-speed + sprint distance (m)
  jumps: number;
  accel: number;   // high-intensity accel efforts
  codLeft: number;
  codRight: number;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[], m: number) => (xs.length < 2 ? 0 : Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length));

/** Player's mean per quality over his TRAINING days (value > 0). */
export function playerQualityMeans(rows: DayRow[]): Record<LoadQuality, number> {
  const pick = (f: (r: DayRow) => number) => { const v = rows.map(f).filter((x) => x > 0); return v.length ? mean(v) : 0; };
  return {
    decel: pick((r) => r.decel),
    cod: pick((r) => r.cod),
    sprint: pick((r) => r.sprint),
    jumps: pick((r) => r.jumps),
    accel: pick((r) => r.accel),
  };
}

export type SquadStat = { mean: number; sd: number; n: number };

/** Build squad mean+sd per quality from every player's per-quality mean. */
export function squadStats(allPlayerMeans: Record<LoadQuality, number>[]): Record<LoadQuality, SquadStat> {
  const out = {} as Record<LoadQuality, SquadStat>;
  for (const q of QUALITIES) {
    const vals = allPlayerMeans.map((m) => m[q]).filter((v) => v > 0);
    const mu = mean(vals);
    out[q] = { mean: mu, sd: sd(vals, mu), n: vals.length };
  }
  return out;
}

/** L/R change-of-direction asymmetry over the window (0–100%). */
export function codAsymmetry(rows: DayRow[]): { pct: number | null; harderSide: "left" | "right" | null } {
  const l = rows.map((r) => r.codLeft).reduce((a, b) => a + b, 0);
  const r = rows.map((x) => x.codRight).reduce((a, b) => a + b, 0);
  const hi = Math.max(l, r);
  if (hi <= 0) return { pct: null, harderSide: null };
  const pct = Math.round((Math.abs(l - r) / hi) * 100);
  return { pct, harderSide: l >= r ? "left" : "right" };
}

export type QualityScore = { quality: LoadQuality; value: number; z: number | null };
export type Recommendation = {
  kind: "demand" | "asymmetry";
  quality: LoadQuality | null;
  label: { en: string; is: string };
  why: { en: string; is: string };
  drills: RobustnessDrill[];
};
export type RobustnessPlan = {
  demands: QualityScore[];
  asymmetryPct: number | null;
  asymmetryFlag: boolean;
  recommendations: Recommendation[];
  confident: boolean;       // enough days + squad context to trust ranking
  trainingDays: number;
};

const ASYMMETRY_THRESHOLD = 15; // %

/**
 * Build the player's robustness plan: top 2 demands (built for) + an asymmetry
 * corrective when L/R CoD imbalance exceeds threshold.
 */
export function buildRobustnessPlan(
  rows: DayRow[],
  pMeans: Record<LoadQuality, number>,
  squad: Record<LoadQuality, SquadStat>,
): RobustnessPlan {
  const trainingDays = rows.filter((r) => r.decel > 0 || r.cod > 0 || r.sprint > 0 || r.jumps > 0 || r.accel > 0).length;

  const demands: QualityScore[] = QUALITIES.map((q) => {
    const s = squad[q];
    const z = s && s.sd > 0 ? Math.round(((pMeans[q] - s.mean) / s.sd) * 10) / 10 : null;
    return { quality: q, value: Math.round(pMeans[q]), z };
  }).sort((a, b) => (b.z ?? -99) - (a.z ?? -99) || b.value - a.value);

  // Dominant demands = above the squad average (z >= 0.5). Always surface at
  // least his single top demand so every player gets something personal.
  const above = demands.filter((d) => d.z != null && d.z >= 0.5);
  const top = (above.length ? above : demands.slice(0, 1)).slice(0, 2);

  const asym = codAsymmetry(rows);
  const asymmetryFlag = asym.pct != null && asym.pct >= ASYMMETRY_THRESHOLD;

  const recommendations: Recommendation[] = [];
  for (const d of top) {
    const meta = QUALITY_META[d.quality];
    recommendations.push({
      kind: "demand", quality: d.quality,
      label: meta.label, why: meta.why,
      drills: drillsForQuality(d.quality).slice(0, 2),
    });
  }

  if (asymmetryFlag) {
    // Corrective = two unilateral drills, preferring the player's top demand,
    // else any unilateral drill. Builds the weaker side's capacity.
    const topQ = top[0]?.quality;
    const uni = [
      ...ROBUSTNESS_DRILLS.filter((x) => x.unilateral && x.quality === topQ),
      ...ROBUSTNESS_DRILLS.filter((x) => x.unilateral && x.quality !== topQ),
    ];
    const seen = new Set<string>();
    const drills = uni.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).slice(0, 2);
    const sideEn = asym.harderSide === "left" ? "right" : "left"; // weaker = the side doing LESS
    const sideIs = sideEn === "left" ? "vinstri" : "hægri";
    recommendations.push({
      kind: "asymmetry", quality: null,
      label: { en: "Left/right balance", is: "Vinstri/hægri jafnvægi" },
      why: {
        en: `His change-of-direction is ${asym.pct}% lopsided — single-leg work on the ${sideEn} side evens it out.`,
        is: `Stefnubreytingar hans eru ${asym.pct}% ójafnar — einfætt vinna á ${sideIs} hlið jafnar það út.`,
      },
      drills,
    });
  }

  return {
    demands,
    asymmetryPct: asym.pct,
    asymmetryFlag,
    recommendations,
    confident: trainingDays >= 6 && squad.decel.n >= 4,
    trainingDays,
  };
}
