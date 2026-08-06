/**
 * Season-report aggregates for one team, from per-match Wyscout team stats.
 *
 * Pure, IO-free. Takes the own-team and opponent rows already stored in
 * team_match_stats (one own + one opponent per fixture) plus each match's result,
 * and rolls them into the season numbers a coach report is built on: results,
 * attack, defence, goalkeeping (goals saved = xG conceded − goals conceded),
 * pressing, and the wins-vs-losses split.
 *
 * Descriptive context only — nothing here touches the readiness colour. Every
 * figure is a plain aggregate of real ingested stats; no model, no xPTS, no
 * fabrication. The narrative layer (AI, labelled) only rephrases these numbers.
 */

export type MatchResult = "W" | "D" | "L";

/** One own-team match row (from team_match_stats, is_opponent=false). */
export type OwnMatchRow = {
  date: string;
  result: MatchResult | null;
  goals: number | null;
  xg: number | null;
  shots: number | null;
  possessionPct: number | null;
  ppda: number | null;
  defDuelsWonPct: number | null;
};
/** The opponent side of the same fixtures (is_opponent=true). */
export type OppMatchRow = { date: string; goals: number | null; xg: number | null; shots: number | null };

export type Mean = { n: number; mean: number | null };
export type GroupMean = { win: Mean; loss: Mean };

export type SeasonReport = {
  team: string;
  matches: number;
  graded: number;
  record: { w: number; d: number; l: number };
  points: number;
  ppg: number | null;
  perMatch: {
    goalsFor: number | null;
    goalsAgainst: number | null;
    goalDiff: number | null;
    xgFor: number | null;
    xgAgainst: number | null;
    xgDiff: number | null;
    shotsFor: number | null;
    shotsAgainst: number | null;
    possessionPct: number | null;
    ppda: number | null;
    defDuelsWonPct: number | null;
    /** goals − xG (per match): + = finishing above the chances created. */
    finishing: number | null;
    /** xG conceded − goals conceded (per match): + = keeper saving goals vs chances. */
    goalsSaved: number | null;
  };
  winsVsLosses: {
    xgAgainst: GroupMean;
    shotsAgainst: GroupMean;
    xgFor: GroupMean;
    ppda: GroupMean;
  };
  /** Confidence: few losses makes the split fragile. */
  confidence: { losses: number; lowSample: boolean };
  dateFrom: string | null;
  dateTo: string | null;
};

const clean = (xs: (number | null | undefined)[]): number[] =>
  xs.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
const round = (x: number | null, d = 2): number | null =>
  x == null ? null : Math.round(x * 10 ** d) / 10 ** d;
function mean(xs: (number | null | undefined)[], d = 2): number | null {
  const v = clean(xs);
  return v.length ? round(v.reduce((a, b) => a + b, 0) / v.length, d) : null;
}
function groupMean(own: OwnMatchRow[], pick: (r: OwnMatchRow) => number | null | undefined, d = 2): GroupMean {
  const wins = own.filter((r) => r.result === "W");
  const losses = own.filter((r) => r.result === "L");
  return {
    win: { n: clean(wins.map(pick)).length, mean: mean(wins.map(pick), d) },
    loss: { n: clean(losses.map(pick)).length, mean: mean(losses.map(pick), d) },
  };
}

export function buildSeasonReport(input: {
  team: string;
  own: OwnMatchRow[];
  opp: OppMatchRow[];
  minLossesForConfidence?: number;
}): SeasonReport {
  const { team, own, opp } = input;
  const oppByDate = new Map(opp.map((o) => [o.date, o]));
  const dates = own.map((r) => r.date).sort();

  const graded = own.filter((r) => r.result != null);
  const w = graded.filter((r) => r.result === "W").length;
  const d = graded.filter((r) => r.result === "D").length;
  const l = graded.filter((r) => r.result === "L").length;
  const points = w * 3 + d;

  const goalsAgainst = own.map((r) => oppByDate.get(r.date)?.goals ?? null);
  const xgAgainst = own.map((r) => oppByDate.get(r.date)?.xg ?? null);
  const shotsAgainst = own.map((r) => oppByDate.get(r.date)?.shots ?? null);

  const gf = mean(own.map((r) => r.goals));
  const ga = mean(goalsAgainst);
  const xgf = mean(own.map((r) => r.xg));
  const xga = mean(xgAgainst);

  // Per-match finishing / goals-saved: average the per-match differences (not the
  // difference of averages) so a missing side on one match doesn't distort it.
  const finishing = mean(own.map((r) => (r.goals != null && r.xg != null ? r.goals - r.xg : null)));
  const goalsSaved = mean(
    own.map((r) => {
      const oa = oppByDate.get(r.date);
      return oa?.xg != null && oa?.goals != null ? oa.xg - oa.goals : null;
    }),
  );

  const gmXgAgainst = groupMean(
    own,
    (r) => oppByDate.get(r.date)?.xg ?? null,
  );
  const gmShotsAgainst = groupMean(own, (r) => oppByDate.get(r.date)?.shots ?? null, 1);
  const gmXgFor = groupMean(own, (r) => r.xg);
  const gmPpda = groupMean(own, (r) => r.ppda);

  const minLosses = input.minLossesForConfidence ?? 3;

  return {
    team,
    matches: own.length,
    graded: graded.length,
    record: { w, d, l },
    points,
    ppg: graded.length ? round(points / graded.length, 2) : null,
    perMatch: {
      goalsFor: gf,
      goalsAgainst: ga,
      goalDiff: gf != null && ga != null ? round(gf - ga, 2) : null,
      xgFor: xgf,
      xgAgainst: xga,
      xgDiff: xgf != null && xga != null ? round(xgf - xga, 2) : null,
      shotsFor: mean(own.map((r) => r.shots), 1),
      shotsAgainst: mean(shotsAgainst, 1),
      possessionPct: mean(own.map((r) => r.possessionPct), 1),
      ppda: mean(own.map((r) => r.ppda), 2),
      defDuelsWonPct: mean(own.map((r) => r.defDuelsWonPct), 1),
      finishing,
      goalsSaved,
    },
    winsVsLosses: { xgAgainst: gmXgAgainst, shotsAgainst: gmShotsAgainst, xgFor: gmXgFor, ppda: gmPpda },
    confidence: { losses: l, lowSample: l < minLosses },
    dateFrom: dates[0] ?? null,
    dateTo: dates[dates.length - 1] ?? null,
  };
}
