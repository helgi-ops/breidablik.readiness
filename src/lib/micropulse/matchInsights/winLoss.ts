/**
 * Wins-vs-losses movement comparison for Match Insights.
 *
 * Pure, IO-free. Takes per-match team movement aggregates (per-minute or per-90
 * fingerprints, computed upstream from GPS/IMA) tagged with the match result, and
 * asks: do the movement numbers differ between wins and losses? For each metric it
 * reports the mean ± SD per result group and the effect size (Cohen's d) between
 * wins and losses, ranked by |d|.
 *
 * Descriptive context only — it never touches the readiness colour or the daily
 * decision, and it is an ASSOCIATION, not a claim that moving differently causes
 * wins. Honesty: a group with < MIN_MATCHES_PER_GROUP matches is not "confident";
 * a metric present in fewer than 2 matches of a group yields a null effect size —
 * never a fabricated number.
 */

export type MatchResult = "W" | "D" | "L";

/** One match's team aggregate: result + per-metric value (per-min or per-90). */
export type MatchMetricRow = {
  sessionDate: string;
  result: MatchResult;
  values: Record<string, number | null | undefined>;
};

export const MIN_MATCHES_PER_GROUP = 3;

export type GroupStat = { n: number; mean: number | null; sd: number | null };

export type MetricWinLoss = {
  metric: string;
  win: GroupStat;
  loss: GroupStat;
  draw: GroupStat;
  /** Cohen's d, wins vs losses (positive = higher in wins). null if too few. */
  cohenD: number | null;
  /** (winMean / lossMean − 1) × 100. null when not computable. */
  deltaPct: number | null;
};

export type WinLossResult = {
  nWin: number;
  nDraw: number;
  nLoss: number;
  /** Confident when both W and L groups have ≥ MIN_MATCHES_PER_GROUP matches. */
  confident: boolean;
  /** Per metric, sorted by |Cohen's d| (largest win/loss difference first). */
  metrics: MetricWinLoss[];
};

function meanOf(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function sdOf(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
}
function round(x: number, d: number): number { const f = 10 ** d; return Math.round(x * f) / f; }

function groupStat(vals: number[]): GroupStat {
  if (!vals.length) return { n: 0, mean: null, sd: null };
  const m = meanOf(vals);
  return { n: vals.length, mean: round(m, 3), sd: round(sdOf(vals, m), 3) };
}

/** Cohen's d with a pooled SD. null when either group has < 2 values or SD is 0. */
function cohensD(win: number[], loss: number[]): number | null {
  if (win.length < 2 || loss.length < 2) return null;
  const mw = meanOf(win), ml = meanOf(loss);
  const sw = sdOf(win, mw), sl = sdOf(loss, ml);
  const pooled = Math.sqrt(((win.length - 1) * sw * sw + (loss.length - 1) * sl * sl) / (win.length + loss.length - 2));
  if (!(pooled > 0)) return null;
  return round((mw - ml) / pooled, 2);
}

export function winLossMovement(
  rows: MatchMetricRow[],
  metricKeys: string[],
  minPerGroup: number = MIN_MATCHES_PER_GROUP,
): WinLossResult {
  const nWin = rows.filter((r) => r.result === "W").length;
  const nDraw = rows.filter((r) => r.result === "D").length;
  const nLoss = rows.filter((r) => r.result === "L").length;

  const valsFor = (key: string, res: MatchResult) =>
    rows.filter((r) => r.result === res)
      .map((r) => r.values[key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const metrics: MetricWinLoss[] = metricKeys.map((metric) => {
    const win = valsFor(metric, "W");
    const loss = valsFor(metric, "L");
    const draw = valsFor(metric, "D");
    const ws = groupStat(win), ls = groupStat(loss);
    const cohenD = cohensD(win, loss);
    const deltaPct = ws.mean != null && ls.mean != null && ls.mean > 0 ? round((ws.mean / ls.mean - 1) * 100, 1) : null;
    return { metric, win: ws, loss: ls, draw: groupStat(draw), cohenD, deltaPct };
  });

  // Largest win/loss separation first; metrics without a d sink to the bottom.
  metrics.sort((a, b) => Math.abs(b.cohenD ?? 0) - Math.abs(a.cohenD ?? 0));

  return { nWin, nDraw, nLoss, confident: nWin >= minPerGroup && nLoss >= minPerGroup, metrics };
}
