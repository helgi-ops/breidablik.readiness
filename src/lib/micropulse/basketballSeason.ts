/**
 * Basketball Season Match Analysis — the box-score season read (the basketball
 * counterpart of the football GPS/xG Season Match Analysis).
 *
 * Pure, IO-free. Given per-game OWN-team box-score totals (aggregated from the KKÍ /
 * Instat feed) and the coach-entered final scores, it computes season averages,
 * per-game trends, home/away splits, a per-opponent breakdown, and — where a result
 * has been entered — the record, margin, and the box score in wins vs losses.
 *
 * Descriptive context only. It never touches the readiness colour, load, or the daily
 * decision. Rules compute everything here; any AI layer only phrases it.
 */

export type GameTotals = {
  gameId: string;
  date: string | null;
  opponent: string | null;
  homeAway: "home" | "away" | null;
  pts: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  oreb: number; dreb: number; reb: number; ast: number; stl: number; blk: number; tov: number; fouls: number;
};

export type GameResult = { pointsFor: number | null; pointsAgainst: number | null };

export type SeasonInput = { games: GameTotals[]; results: Record<string, GameResult> };

export type Split = {
  games: number;
  pts: number | null; fgPct: number | null; tpPct: number | null; ftPct: number | null;
  reb: number | null; oreb: number | null; dreb: number | null;
  ast: number | null; stl: number | null; blk: number | null; tov: number | null; fouls: number | null;
};

export type PerGame = {
  gameId: string; date: string | null; opponent: string | null; homeAway: "home" | "away" | null;
  pts: number; fgPct: number | null; tpPct: number | null; tov: number;
  pointsFor: number | null; pointsAgainst: number | null; margin: number | null; result: "W" | "L" | "T" | null;
};

export type OpponentRow = {
  opponent: string; games: number; ptsFor: number | null; ptsAgainst: number | null;
  wins: number; losses: number; avgMargin: number | null;
};

export type BasketballSeason = {
  gamesPlayed: number;
  averages: Split;
  perGame: PerGame[];              // chronological
  homeAway: { home: Split; away: Split };
  byOpponent: OpponentRow[];       // most-played first
  resultsEntered: number;          // games with a coach-entered opponent score
  record: { wins: number; losses: number; ties: number } | null;
  winLoss: { win: Split; loss: Split } | null; // box score in wins vs losses
  marginSeries: Array<{ date: string | null; opponent: string | null; margin: number }>;
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const avg = (xs: number[]): number | null => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pct = (made: number, att: number): number | null => (att > 0 ? Math.round((made / att) * 1000) / 10 : null);
const round1 = (v: number) => Math.round(v * 10) / 10;
const sum = (games: GameTotals[], f: (g: GameTotals) => number) => games.reduce((a, g) => a + (isNum(f(g)) ? f(g) : 0), 0);

function summarize(games: GameTotals[]): Split {
  return {
    games: games.length,
    pts: avg(games.map((g) => g.pts)),
    fgPct: pct(sum(games, (g) => g.fgm), sum(games, (g) => g.fga)),
    tpPct: pct(sum(games, (g) => g.tpm), sum(games, (g) => g.tpa)),
    ftPct: pct(sum(games, (g) => g.ftm), sum(games, (g) => g.fta)),
    reb: avg(games.map((g) => g.reb)),
    oreb: avg(games.map((g) => g.oreb)),
    dreb: avg(games.map((g) => g.dreb)),
    ast: avg(games.map((g) => g.ast)),
    stl: avg(games.map((g) => g.stl)),
    blk: avg(games.map((g) => g.blk)),
    tov: avg(games.map((g) => g.tov)),
    fouls: avg(games.map((g) => g.fouls)),
  };
}

/** Resolve a game's for/against/result from the box score + the entered result. */
function resolveResult(g: GameTotals, r: GameResult | undefined): { pointsFor: number | null; pointsAgainst: number | null; margin: number | null; result: "W" | "L" | "T" | null } {
  const pointsFor = r?.pointsFor ?? (isNum(g.pts) ? g.pts : null);
  const pointsAgainst = r?.pointsAgainst ?? null;
  if (pointsFor == null || pointsAgainst == null) return { pointsFor, pointsAgainst, margin: null, result: null };
  const margin = pointsFor - pointsAgainst;
  return { pointsFor, pointsAgainst, margin, result: margin > 0 ? "W" : margin < 0 ? "L" : "T" };
}

export function buildBasketballSeason(input: SeasonInput): BasketballSeason {
  const games = input.games.slice().sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const results = input.results ?? {};

  const perGame: PerGame[] = games.map((g) => {
    const rr = resolveResult(g, results[g.gameId]);
    return {
      gameId: g.gameId, date: g.date, opponent: g.opponent, homeAway: g.homeAway,
      pts: g.pts, fgPct: pct(g.fgm, g.fga), tpPct: pct(g.tpm, g.tpa), tov: g.tov,
      pointsFor: rr.pointsFor, pointsAgainst: rr.pointsAgainst, margin: rr.margin, result: rr.result,
    };
  });

  const homeGames = games.filter((g) => g.homeAway === "home");
  const awayGames = games.filter((g) => g.homeAway === "away");

  // Per opponent.
  const oppMap = new Map<string, GameTotals[]>();
  for (const g of games) { const k = g.opponent ?? "—"; (oppMap.get(k) ?? oppMap.set(k, []).get(k)!).push(g); }
  const byOpponent: OpponentRow[] = Array.from(oppMap.entries()).map(([opponent, gs]) => {
    const rr = gs.map((g) => resolveResult(g, results[g.gameId]));
    const withResult = rr.filter((x) => x.result != null);
    const wins = withResult.filter((x) => x.result === "W").length;
    const losses = withResult.filter((x) => x.result === "L").length;
    const margins = withResult.map((x) => x.margin!).filter(isNum);
    return {
      opponent, games: gs.length,
      ptsFor: avg(gs.map((g) => g.pts)),
      ptsAgainst: withResult.length ? avg(withResult.map((x) => x.pointsAgainst!).filter(isNum)) : null,
      wins, losses, avgMargin: margins.length ? avg(margins) : null,
    };
  }).sort((a, b) => b.games - a.games || a.opponent.localeCompare(b.opponent));

  // Win/loss splits (only games with a decided result).
  const decided = games.map((g) => ({ g, rr: resolveResult(g, results[g.gameId]) })).filter((x) => x.rr.result === "W" || x.rr.result === "L");
  const wins = decided.filter((x) => x.rr.result === "W");
  const losses = decided.filter((x) => x.rr.result === "L");
  const ties = games.filter((g) => resolveResult(g, results[g.gameId]).result === "T").length;
  const resultsEntered = games.filter((g) => resolveResult(g, results[g.gameId]).pointsAgainst != null).length;

  return {
    gamesPlayed: games.length,
    averages: summarize(games),
    perGame,
    homeAway: { home: summarize(homeGames), away: summarize(awayGames) },
    byOpponent,
    resultsEntered,
    record: resultsEntered > 0 ? { wins: wins.length, losses: losses.length, ties } : null,
    winLoss: (wins.length > 0 || losses.length > 0) ? { win: summarize(wins.map((x) => x.g)), loss: summarize(losses.map((x) => x.g)) } : null,
    marginSeries: perGame.filter((p) => p.margin != null).map((p) => ({ date: p.date, opponent: p.opponent, margin: p.margin! })),
  };
}
