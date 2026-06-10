/**
 * Directional Signature — the IMA "clock" movement fingerprint and its drift.
 *
 * Phase 5 of docs/unfamiliar-load.md, powered by the ima_clock_gen2 grid now
 * flowing from Catapult (ima_band{1,2,3}_direction{1..12}_count). For each day
 * we collapse the grid to a 12-direction distribution (each clock position's
 * SHARE of that day's directional events). A player's "fingerprint" is his
 * usual distribution; drift = is the shape of his movement shifting (e.g. more
 * lateral cutting than normal) — the high-resolution form of "is he still
 * moving like himself?" (Virtanen / Catapult 2026).
 *
 * Per-direction comparison reuses recentVsBaseline (recent micro-cycle vs the
 * player's own prior norm), so this is consistent with the rest of Unfamiliar
 * Load. Plus an overall shape-change magnitude (total variation distance).
 * Pure + deterministic.
 */

import { recentVsBaseline } from "@/lib/micropulse/movementSignature";

/** One clock cell (matches catapult ImaClock). */
export type ClockCell = { high: number | null; medium: number | null; low: number | null };
/** keys "1".."12" → cell. */
export type ClockGrid = Record<string, ClockCell>;

export const DIRECTIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Plain-language label for a clock direction (12 = straight forward). */
export const DIRECTION_LABEL: Record<string, string> = {
  "12": "forward", "1": "forward-right", "2": "right-forward", "3": "right",
  "4": "right-back", "5": "back-right", "6": "backward", "7": "back-left",
  "8": "left-back", "9": "left", "10": "left-forward", "11": "forward-left",
};

const cellSum = (c?: ClockCell): number => (Number(c?.high) || 0) + (Number(c?.medium) || 0) + (Number(c?.low) || 0);

/** Total directional events in a grid. */
export function gridTotal(grid: ClockGrid | null | undefined): number {
  if (!grid) return 0;
  let t = 0;
  for (const d of DIRECTIONS) t += cellSum(grid[d]);
  return t;
}

/** Normalized 12-vector (each direction's share of the day's events). null if empty. */
export function gridShares(grid: ClockGrid | null | undefined): Record<string, number> | null {
  const total = gridTotal(grid);
  if (total <= 0) return null;
  const out: Record<string, number> = {};
  for (const d of DIRECTIONS) out[d] = cellSum(grid![d]) / total;
  return out;
}

export type DirectionDrift = {
  dir: Direction;
  label: string;
  recent: number;   // recent share (0-1)
  usual: number;    // baseline share
  sd: number;
  z: number | null; // (recent - usual)/sd, two-sided
  n: number;
};

export type DirectionalSignature = {
  date: string;
  confident: boolean;
  calibrating: boolean;
  baselineDays: number;
  tvd: number | null;         // total variation distance recent vs usual (0-1)
  driftScore: number;         // ranking magnitude (max |z| among directions)
  flagged: boolean;
  directions: DirectionDrift[];     // all 12, ordered 1..12 (for the chart)
  drifting: DirectionDrift[];       // |z| >= threshold, most concerning first
  usualVector: Record<string, number>;  // baseline fingerprint (for the chart)
  recentVector: Record<string, number>; // recent fingerprint (for the chart)
  headline: string | null;
  counterfactual: string | null;
};

const MIN_DAYS = 8;
const ACTIVE_DAYS = 14;
const round = (n: number, d = 3) => { const f = 10 ** d; return Math.round(n * f) / f; };

/**
 * @param grids most-recent-first list of a player's daily clock grids.
 */
export function computeDirectionalSignature(grids: Array<ClockGrid | null>, refDateIso: string): DirectionalSignature {
  // Per-day share vectors (skip empty days), most-recent-first.
  const dayShares: Array<Record<string, number>> = [];
  for (const g of grids ?? []) { const s = gridShares(g); if (s) dayShares.push(s); }

  const directions: DirectionDrift[] = [];
  const usualVector: Record<string, number> = {};
  const recentVector: Record<string, number> = {};
  let maxDays = 0;

  for (const dir of DIRECTIONS) {
    const series = dayShares.map((s) => s[dir] ?? 0);
    const rb = recentVsBaseline(series); // recent micro-cycle vs prior norm
    if (!rb) {
      directions.push({ dir, label: DIRECTION_LABEL[dir], recent: 0, usual: 0, sd: 0, z: null, n: series.length });
      usualVector[dir] = 0; recentVector[dir] = 0;
      continue;
    }
    maxDays = Math.max(maxDays, rb.n);
    usualVector[dir] = round(rb.mean);
    recentVector[dir] = round(rb.recent);
    const z = rb.sd > 1e-6 ? round((rb.recent - rb.mean) / rb.sd, 1) : null;
    directions.push({ dir, label: DIRECTION_LABEL[dir], recent: round(rb.recent), usual: round(rb.mean), sd: round(rb.sd), z, n: rb.n });
  }

  // Total variation distance between recent and usual fingerprints.
  let tvd: number | null = null;
  if (maxDays > 0) {
    let s = 0;
    for (const dir of DIRECTIONS) s += Math.abs((recentVector[dir] ?? 0) - (usualVector[dir] ?? 0));
    tvd = round(s / 2, 3);
  }

  const confident = maxDays >= ACTIVE_DAYS;
  const calibrating = maxDays >= MIN_DAYS && maxDays < ACTIVE_DAYS;
  const flagEligible = maxDays >= MIN_DAYS;

  // Primary signal = the shape-change magnitude (TVD between recent and his own
  // usual fingerprint), which is personal and robust even when a direction has
  // ~zero day-to-day variance (where a per-direction z-score can't be formed).
  // Per-direction share deltas explain WHICH directions drove the shift.
  const TVD_FLAG = calibrating ? 0.28 : 0.2; // 20% of movement redistributed
  const flagged = flagEligible && tvd != null && tvd >= TVD_FLAG;
  const driftScore = round(tvd ?? 0, 2);

  // Directions that moved most (by absolute share change), as the explanation.
  const drifting = directions
    .filter((d) => flagEligible && Math.abs(d.recent - d.usual) >= 0.04)
    .sort((a, b) => Math.abs(b.recent - b.usual) - Math.abs(a.recent - a.usual));

  const top = drifting[0] ?? null;

  let headline: string | null = null;
  let counterfactual: string | null = null;
  if (flagged && top) {
    const more = top.recent > top.usual;
    const tvdPct = tvd != null ? Math.round(tvd * 100) : 0;
    headline = `Movement shape shifted ~${tvdPct}% from his usual — mainly ${more ? "more" : "less"} ${top.label} (${Math.round(top.usual * 100)}% → ${Math.round(top.recent * 100)}% of his moves).`;
    counterfactual = `If his recent direction mix were within ~${TVD_FLAG * 100}% of his usual fingerprint, this would not flag.`;
  }

  return {
    date: refDateIso,
    confident, calibrating, baselineDays: maxDays,
    tvd, driftScore, flagged,
    directions, drifting,
    usualVector, recentVector,
    headline, counterfactual,
  };
}
