/**
 * Squad vs its usual for one match — the numbers behind the Match Movement PDF (client-safe, pure).
 *
 * - This match = the match's rows minus touchline warm-up rows (a substitute's warm-up is real load
 *   but not match movement; the screen and the engine's norms leave it out too).
 * - Usual = every match row that is neither a warm-up row nor an estimate (as the per-player norms).
 * - "Different from usual" uses `significanceThreshold` (long runs 50%, accel:decel 30%, others 20%,
 *   left/right 10 pts).
 * - Long runs in plain numbers: runs of 18 s or more per 90 minutes, pooled (all runs ÷ all minutes),
 *   and how many of them at match pace (≥11 km/h, GPS only). Null without a count (rows before the
 *   June 2026 re-sync) — never shown as 0.
 */

import type { MatchMovementResult, MatchMovementRow, MovementDimension, MovementFingerprint } from "./types";
import { movementDimensions, significanceThreshold } from "./types";

export type SquadDimRead = {
  d: MovementDimension;
  cur: number | null;
  base: number | null;
  /** % (points for pct dims) away from usual. */
  rel: number | null;
  flagged: boolean;
};

export type LongRunsPer90 = {
  thisMatch: number | null;
  thisMatchMp: number | null;
  usual: number | null;
  usualMp: number | null;
};

export type SquadVsUsual = {
  dims: SquadDimRead[];
  /** Rows of this match that count (sorted by name). */
  counted: MatchMovementRow[];
  /** Rows of this match left out as touchline warm-up. */
  notCounted: MatchMovementRow[];
  longRuns: LongRunsPer90 | null;
};

/** Fewest rows with a run count before a per-90 figure is shown. */
const MIN_ROWS_FOR_RATE = 3;

/** % (or points, for pct-kind dims) that `cur` sits away from `base`. */
export function relDeviation(cur: number | null | undefined, base: number | null | undefined, kind: MovementDimension["kind"]): number | null {
  if (cur == null || base == null) return null;
  return kind === "pct" ? cur - base : base !== 0 ? ((cur - base) / base) * 100 : 0;
}

/** True when a deviation is outside the usual range for that dimension. */
export function isOutsideUsual(key: string, rel: number | null): boolean {
  return rel != null && Math.abs(rel) >= significanceThreshold(key);
}

function meanFp(rows: MatchMovementRow[], dims: MovementDimension[]): MovementFingerprint {
  const out: MovementFingerprint = {};
  for (const d of dims) {
    const vals = rows.map((r) => r.fingerprint[d.key]).filter((v): v is number => v != null);
    out[d.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  return out;
}

/** Pooled runs per 90 min over rows that carry the value: Σ runs ÷ Σ minutes × 90. */
function per90(rows: MatchMovementRow[], pick: (r: MatchMovementRow) => number | null): number | null {
  const withVal = rows.filter((r) => pick(r) != null && r.minutes > 0);
  if (withVal.length < MIN_ROWS_FOR_RATE) return null;
  const runs = withVal.reduce((s, r) => s + (pick(r) ?? 0), 0);
  const minutes = withVal.reduce((s, r) => s + r.minutes, 0);
  return minutes > 0 ? (runs / minutes) * 90 : null;
}

export function squadVsUsual(result: MatchMovementResult, matchDate: string): SquadVsUsual {
  const dims = movementDimensions(result.variant);
  const matchRows = result.rows
    .filter((r) => r.match_date === matchDate && Object.values(r.fingerprint).some((v) => v != null))
    .sort((a, b) => a.name.localeCompare(b.name));
  const counted = matchRows.filter((r) => !r.contaminated);
  const notCounted = matchRows.filter((r) => r.contaminated);
  const usualRows = result.rows.filter((r) => !r.contaminated && !r.estimated);

  const squadThis = meanFp(counted, dims);
  const squadUsual = meanFp(usualRows, dims);
  const reads = dims.map((d) => {
    const cur = squadThis[d.key] ?? null;
    const base = squadUsual[d.key] ?? null;
    const rel = relDeviation(cur, base, d.kind);
    return { d, cur, base, rel, flagged: isOutsideUsual(d.key, rel) };
  });

  let longRuns: LongRunsPer90 | null = null;
  if (result.variant === "ima") {
    const lr = {
      thisMatch: per90(counted, (r) => r.sub.longRuns),
      thisMatchMp: per90(counted, (r) => r.sub.longRunsMp),
      usual: per90(usualRows, (r) => r.sub.longRuns),
      usualMp: per90(usualRows, (r) => r.sub.longRunsMp),
    };
    if (lr.thisMatch != null) longRuns = lr;
  }

  return { dims: reads, counted, notCounted, longRuns };
}

/** One plain line for the long runs, EN / IS. Null when this match has no run count. */
export function longRunsLine(lr: LongRunsPer90 | null, is: boolean): string | null {
  if (!lr || lr.thisMatch == null) return null;
  const f = (v: number | null) => (v == null ? "—" : is ? v.toFixed(1).replace(".", ",") : v.toFixed(1));
  const mp = lr.thisMatchMp != null;
  if (is) {
    return `Löng hlaup (18 sek eða lengri): ${f(lr.thisMatch)} á 90 mín í þessum leik` +
      (mp ? `, ${f(lr.thisMatchMp)} á leikhraða` : "") +
      ` · venja ${f(lr.usual)}` + (mp ? ` og ${f(lr.usualMp)}` : "") + ".";
  }
  return `Long runs (18 s or more): ${f(lr.thisMatch)} per 90 min this match` +
    (mp ? `, ${f(lr.thisMatchMp)} at match pace` : "") +
    ` · usual ${f(lr.usual)}` + (mp ? ` and ${f(lr.usualMp)}` : "") + ".";
}
