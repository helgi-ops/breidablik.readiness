/**
 * Movement Style — linear ↔ multidirectional, combining the two IMA feeds.
 *
 * The IMA "clock" (direction-change events) reads almost identically for every player
 * (a systematic LF↔RB diagonal — it captures change-of-direction, not forward running),
 * so on its own it barely differentiates. IMA Free Running fills the gap: the fast stride
 * bands are the LINEAR running the clock misses. Their balance IS a player's style, and it
 * genuinely separates players (verified on Breiðablik: a ~3.7× spread, position-sensible).
 *
 * This is Andrew Gray's (ADI) linear-vs-multidirectional distinction, IMA-native:
 *   ratio = high-intensity direction-change load ÷ fast linear-running load
 * Higher ratio = more of his work is multidirectional (a cutter/turner); lower = a
 * straight-line runner. Read squad-relative (percentile) so it's "vs his peers", and it's
 * a STYLE descriptor, never a quality — a linear runner is not "worse" than a cutter.
 *
 * HONEST: a proxy from IMA counts + PlayerLoad, NOT mechanical power W/kg or complete-
 * acceleration vectors (those need the raw 10 Hz stream). Pure, no I/O. Descriptive load
 * context — it never touches the readiness colour, the load target, or the daily decision.
 *
 * Cite: Buchheit 2014 (IMA) · di Prampero (metabolic cost of accel/decel) · ADI / Gray 2025
 * (linear vs multidirectional work).
 */

export type Bi = { en: string; is: string };
export type StyleLabel = "linear" | "balanced" | "multidirectional" | "insufficient";

/** Per-player raw inputs (summed over the read window). */
export interface PlayerStyleInput {
  playerId: string;
  /** High-intensity direction-change events (sum of the clock's high tier, all directions). */
  codLoad: number | null;
  /** Fast linear-running PlayerLoad (IMA free-running bands 5–8 = high cadence/velocity). */
  linearFastLoad: number | null;
}

export interface StyleRead {
  playerId: string;
  ratio: number | null;          // codLoad ÷ linearFastLoad
  percentile: number | null;     // 0–100 within the squad (high = more multidirectional)
  label: StyleLabel;
  codLoad: number | null;
  linearFastLoad: number | null;
  verdict: Bi;
  citation: string;
  caveat: Bi;
}

/** Percentile boundaries for the style label (provisional; squad-relative). */
export const MULTIDIRECTIONAL_PCTL = 66;
export const LINEAR_PCTL = 33;
/** A squad needs at least this many players with a ratio for percentiles to mean anything. */
export const MIN_SQUAD = 5;

const CITATION = "Buchheit 2014 (IMA) · di Prampero (accel/decel cost) · ADI / Gray 2025 (linear vs multidirectional)";

const CAVEAT: Bi = {
  en: "Movement style is the balance of his high-intensity change-of-direction work (IMA clock) against his fast linear running (IMA free-running bands) — read as a percentile vs the squad. It's a STYLE, not a quality: a linear runner is not worse than a cutter. A proxy from IMA counts + PlayerLoad, not mechanical power W/kg. Descriptive — it never changes the readiness verdict or the daily plan.",
  is: "Hreyfistíll er jafnvægið milli há-ákafra stefnubreytinga hans (IMA-klukka) og hraðs línulegs hlaups (IMA free-running bönd) — lesið sem percentíl m.v. hópinn. Þetta er STÍLL, ekki gæði: línulegur hlaupari er ekki verri en sá sem sker. Proxy úr IMA-talningum + PlayerLoad, ekki mechanical power W/kg. Lýsandi — breytir aldrei readiness-dómnum eða dagsáætluninni.",
};

const num = (x: number | null | undefined): number | null => (typeof x === "number" && isFinite(x) ? x : null);

/** codLoad ÷ linearFastLoad. Null when the linear side is missing/zero (can't form a ratio). */
export function styleRatio(codLoad: number | null, linearFastLoad: number | null): number | null {
  const c = num(codLoad), l = num(linearFastLoad);
  if (c === null || l === null || l <= 0) return null;
  return c / l;
}

/** Percentile rank (0–100) of `target` within `pool` (fraction at or below). Null if pool < 2. */
export function percentileRank(target: number, pool: number[]): number | null {
  const vals = pool.filter((v) => typeof v === "number" && isFinite(v));
  if (vals.length < 2) return null;
  let below = 0, equal = 0;
  for (const v of vals) { if (v < target) below += 1; else if (v === target) equal += 1; }
  const rank = below + 0.5 * Math.max(0, equal - 1);
  return Math.round((rank / (vals.length - 1)) * 100);
}

export function labelFor(percentile: number | null): StyleLabel {
  if (percentile === null) return "insufficient";
  if (percentile >= MULTIDIRECTIONAL_PCTL) return "multidirectional";
  if (percentile <= LINEAR_PCTL) return "linear";
  return "balanced";
}

function verdictFor(label: StyleLabel, pct: number | null): Bi {
  const p = pct === null ? "—" : `${Math.round(pct)}`;
  switch (label) {
    case "multidirectional": return { en: `Multidirectional — more cutting & turning than most teammates (${p}th pct).`, is: `Fjölstefnu — meira um skurði og snúninga en flestir í liðinu (${p}. percentíl).` };
    case "linear": return { en: `Linear runner — more straight-line running than most teammates (${p}th pct).`, is: `Línulegur hlaupari — meira beint hlaup en flestir í liðinu (${p}. percentíl).` };
    case "balanced": return { en: `Balanced — an even mix of linear and multidirectional work (${p}th pct).`, is: `Jafnvægi — jöfn blanda af línulegu og fjölstefnu (${p}. percentíl).` };
    default: return { en: "Not enough IMA data yet to place his movement style.", is: "Ekki næg IMA-gögn enn til að staðsetja hreyfistílinn." };
  }
}

/**
 * Score every player's movement style against the squad. Players with a ratio are ranked;
 * those without enough data get "insufficient". Pure.
 */
export function computeSquadStyle(inputs: PlayerStyleInput[]): StyleRead[] {
  const ratios = new Map<string, number>();
  for (const i of inputs ?? []) {
    const r = styleRatio(i.codLoad, i.linearFastLoad);
    if (r !== null) ratios.set(i.playerId, r);
  }
  const pool = [...ratios.values()];
  const enough = pool.length >= MIN_SQUAD;
  return (inputs ?? []).map((i) => {
    const ratio = ratios.get(i.playerId) ?? null;
    const percentile = enough && ratio !== null ? percentileRank(ratio, pool) : null;
    const label = labelFor(percentile);
    return {
      playerId: i.playerId,
      ratio: ratio === null ? null : Math.round(ratio * 100) / 100,
      percentile, label,
      codLoad: num(i.codLoad), linearFastLoad: num(i.linearFastLoad),
      verdict: verdictFor(label, percentile), citation: CITATION, caveat: CAVEAT,
    };
  });
}
