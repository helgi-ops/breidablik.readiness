/**
 * Best Matches — pure engine, no IO.
 *
 * Ranks the team's OWN matches by how good the performance was, and for each says what we did well
 * (plain, from the team numbers vs our own season norm) and who was in the team. Not a per-player
 * breakdown — a "best games of the season" report.
 *
 * Ranking is transparent: result comes first (a win always beats a draw beats a loss), then goal
 * margin, then the xG battle. The score components are returned so the coach sees WHY a game ranked.
 *
 * Reads team-match rows (sb_team_match_stats) + the matchday lineups (player_match_stats). Descriptive
 * football data — never touches the readiness colour. Cite: StatsBomb IQ metric glossary.
 */

export type Bi = { en: string; is: string };
export type Outcome = "win" | "draw" | "loss";

export type TeamMatch = {
  matchDate: string;
  opponent: string | null;
  isHome: boolean | null;
  goals: number | null;
  goalsAgainst: number | null;
  xg: number | null;
  xgAgainst: number | null;
  obv: number | null;
  pressures: number | null;
  openPlayXg: number | null;
  setPieceXg: number | null;
  deepProgressions: number | null;
};

export type SeasonAvg = { xg: number; obv: number; pressures: number; setPieceXg: number; deepProgressions: number };

export type Strength = { key: string; label: Bi; priority: number; magnitude: number };
export type RankedMatch = {
  matchDate: string; opponent: string | null; isHome: boolean | null;
  goals: number; goalsAgainst: number; outcome: Outcome;
  xg: number | null; xgAgainst: number | null; obv: number | null;
  score: number; components: { points: number; goalDiff: number; xgDiff: number };
  strengths: Strength[];
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function outcomeOf(g: number, ga: number): Outcome { return g > ga ? "win" : g < ga ? "loss" : "draw"; }

/** Team season averages over the supplied matches (used as the "our norm" baseline for strengths). */
export function seasonAverages(rows: TeamMatch[]): SeasonAvg {
  const avg = (pick: (m: TeamMatch) => number | null) => {
    const xs = rows.map(pick).filter((v): v is number => v != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  };
  return { xg: avg((m) => m.xg), obv: avg((m) => m.obv), pressures: avg((m) => m.pressures), setPieceXg: avg((m) => m.setPieceXg), deepProgressions: avg((m) => m.deepProgressions) };
}

/** What we did well in this match — plain positives from the numbers vs our own season norm. */
export function matchStrengths(m: TeamMatch, avg: SeasonAvg): Strength[] {
  const g = m.goals ?? 0, ga = m.goalsAgainst ?? 0;
  const gd = g - ga;
  const xg = m.xg, xga = m.xgAgainst;
  const xgDiff = xg != null && xga != null ? xg - xga : null;
  const out: Strength[] = [];
  const push = (key: string, en: string, is: string, priority: number, magnitude: number) => out.push({ key, label: { en, is }, priority, magnitude });

  if (gd >= 3) push("bigwin", `Dominant win, ${g}–${ga}`, `Yfirburðasigur, ${g}–${ga}`, 5, gd);
  if (ga === 0 && g > 0) push("cleansheet", "Clean sheet — nothing conceded", "Hreinn skjöldur — ekkert á okkur", 5, 3);
  else if (ga === 0) push("cleansheet", "Clean sheet", "Hreinn skjöldur", 4, 2);
  if (xgDiff != null && xgDiff >= 0.5) push("xgbattle", `Controlled the chances (xG ${r1(xg!)}–${r1(xga!)})`, `Stjórnuðum færunum (xG ${r1(xg!)}–${r1(xga!)})`, 4, xgDiff);
  if (xg != null && xg >= 1.8 && xg >= avg.xg * 1.15) push("attack", `High chance creation (xG ${r1(xg)})`, `Mikil færasköpun (xG ${r1(xg)})`, 3, xg);
  if (xg != null && g >= xg + 1) push("clinical", `Clinical — ${g} goals from ${r1(xg)} xG`, `Klínískt — ${g} mörk úr ${r1(xg)} xG`, 3, g - xg);
  if (m.setPieceXg != null && m.setPieceXg >= 0.4 && m.setPieceXg >= avg.setPieceXg * 1.2) push("setpiece", `Set-piece threat (xG ${r2(m.setPieceXg)})`, `Ógn úr föstum (xG ${r2(m.setPieceXg)})`, 3, m.setPieceXg);
  if (m.pressures != null && avg.pressures > 0 && m.pressures >= avg.pressures * 1.15) push("press", `Aggressive press (${Math.round(m.pressures)} pressures)`, `Ágeng pressa (${Math.round(m.pressures)} pressur)`, 2, m.pressures / avg.pressures);
  if (m.deepProgressions != null && avg.deepProgressions > 0 && m.deepProgressions >= avg.deepProgressions * 1.2) push("progression", `Strong ball progression (${Math.round(m.deepProgressions)} deep progressions)`, `Sterk framfærsla (${Math.round(m.deepProgressions)} djúpar framfærslur)`, 2, m.deepProgressions / avg.deepProgressions);
  if (m.obv != null && avg.obv > 0 && m.obv >= avg.obv * 1.3) push("obv", `High on-ball value (OBV ${r1(m.obv)})`, `Hátt on-ball value (OBV ${r1(m.obv)})`, 2, m.obv / avg.obv);

  // Always give at least one takeaway so a scrappy win still reads.
  if (out.length === 0) {
    if (gd > 0) push("won", `Won the game, ${g}–${ga}`, `Unnum leikinn, ${g}–${ga}`, 1, gd);
    else if (gd === 0 && xgDiff != null && xgDiff > 0) push("edged", `Earned a point, edged the xG`, `Náðum stigi, betri í xG`, 1, 1);
    else push("result", `Result: ${g}–${ga}`, `Úrslit: ${g}–${ga}`, 0, 0);
  }

  out.sort((a, b) => (b.priority - a.priority) || (b.magnitude - a.magnitude));
  return out.slice(0, 4);
}

export type RankOpts = { topN?: number };

/** Rank matches best-first (result → goal margin → xG battle) and attach strengths. */
export function rankMatches(rows: TeamMatch[], opts: RankOpts = {}): RankedMatch[] {
  const avg = seasonAverages(rows);
  const scored = rows
    .filter((m) => m.goals != null && m.goalsAgainst != null)
    .map((m) => {
      const g = m.goals!, ga = m.goalsAgainst!;
      const outcome = outcomeOf(g, ga);
      const points = outcome === "win" ? 3 : outcome === "draw" ? 1 : 0;
      const goalDiff = g - ga;
      const xgDiff = m.xg != null && m.xgAgainst != null ? m.xg - m.xgAgainst : 0;
      const score = points * 100 + goalDiff * 10 + xgDiff * 2;
      return {
        matchDate: m.matchDate, opponent: m.opponent, isHome: m.isHome,
        goals: g, goalsAgainst: ga, outcome,
        xg: m.xg, xgAgainst: m.xgAgainst, obv: m.obv,
        score: r2(score), components: { points, goalDiff, xgDiff: r2(xgDiff) },
        strengths: matchStrengths(m, avg),
      } satisfies RankedMatch;
    });
  scored.sort((a, b) => b.score - a.score || (a.matchDate < b.matchDate ? 1 : -1));
  return scored.slice(0, opts.topN ?? 10);
}
