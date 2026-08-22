/**
 * Basketball "Win Factors" — pure, no IO.
 *
 * What wins games in a league, from the per-game team box scores already stored in
 * basketball_fiba_games (FIBA LiveStats). Computes the Four Factors (Oliver 2004) + core
 * box rates per team-game, then:
 *   - GAME level: point-biserial r of each factor with the win flag (n = 2·games).
 *   - TEAM level: Pearson r of each team's season average with its win% (n = teams),
 *     including defence (points allowed, opponent eFG%) and net rating.
 * Ships a plain-language verdict + 2-3 supporting facts (explainability-first) with the
 * jargon and full ranked tables kept behind a details toggle.
 *
 * Descriptive analytics only — never touches the readiness colour or the daily decision.
 */

export type Bi = { en: string; is: string };

export type TeamBox = {
  pts: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  oreb: number; dreb: number; tov: number; stl: number; blk: number; ast: number;
};
export type TeamGame = { gameId: string; team: string; win: boolean; box: TeamBox; oppBox: TeamBox };

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/** Build a TeamBox from a FIBA totals object (own_totals / opp_totals jsonb). */
export function boxFromTotals(t: Record<string, unknown> | null | undefined): TeamBox {
  const o = t ?? {};
  return {
    pts: n(o.points), fgm: n(o.fgm), fga: n(o.fga), tpm: n(o.tpm), tpa: n(o.tpa), ftm: n(o.ftm), fta: n(o.fta),
    oreb: n(o.oreb), dreb: n(o.dreb), tov: n(o.tov), stl: n(o.stl), blk: n(o.blk), ast: n(o.ast),
  };
}

/** One stored game (own/opp in a single row) → two team-games (each side's perspective). */
export function teamGamesFromFibaGame(g: { own_name?: string | null; opp_name?: string | null; own_totals?: Record<string, unknown> | null; opp_totals?: Record<string, unknown> | null; match_id?: string | number | null }): TeamGame[] {
  const own = boxFromTotals(g.own_totals), opp = boxFromTotals(g.opp_totals);
  if (!own.fga || !opp.fga) return []; // need shooting totals for the factors
  const id = String(g.match_id ?? "");
  const ownName = g.own_name ?? "own", oppName = g.opp_name ?? "opp";
  return [
    { gameId: id, team: ownName, win: own.pts > opp.pts, box: own, oppBox: opp },
    { gameId: id, team: oppName, win: opp.pts > own.pts, box: opp, oppBox: own },
  ];
}

// ── Four Factors + rates (Oliver 2004) ──────────────────────────────────────
const eFG = (b: TeamBox) => (b.fga > 0 ? (b.fgm + 0.5 * b.tpm) / b.fga : 0);
const tovPct = (b: TeamBox) => { const d = b.fga + 0.44 * b.fta + b.tov; return d > 0 ? b.tov / d : 0; };
const orebPct = (b: TeamBox, opp: TeamBox) => { const d = b.oreb + opp.dreb; return d > 0 ? b.oreb / d : 0; };
const ftRate = (b: TeamBox) => (b.fga > 0 ? b.ftm / b.fga : 0);
const tp3Pct = (b: TeamBox) => (b.tpa > 0 ? b.tpm / b.tpa : 0);

type FactorDef = { key: string; label: Bi; higherIsBetter: boolean; tip?: Bi; of: (g: TeamGame) => number };

// Game-level factors (per team-game).
const GAME_FACTORS: FactorDef[] = [
  { key: "efg", label: { en: "eFG% (offense)", is: "eFG% (sókn)" }, higherIsBetter: true, tip: { en: "Effective field-goal %: shooting that credits threes their extra value.", is: "Virkt skotnýtingarhlutfall: gefur þristum aukavægi." }, of: (g) => eFG(g.box) },
  { key: "oppEfg", label: { en: "Opponent eFG% (defense)", is: "Andstæðings eFG% (vörn)" }, higherIsBetter: false, tip: { en: "How well you stop the other team from shooting.", is: "Hversu vel þú stöðvar skot andstæðingsins." }, of: (g) => eFG(g.oppBox) },
  { key: "tp3", label: { en: "3-point %", is: "3ja stiga %" }, higherIsBetter: true, of: (g) => tp3Pct(g.box) },
  { key: "ast", label: { en: "Assists", is: "Stoðsendingar" }, higherIsBetter: true, of: (g) => g.box.ast },
  { key: "stl", label: { en: "Steals", is: "Stolnir boltar" }, higherIsBetter: true, of: (g) => g.box.stl },
  { key: "orebPct", label: { en: "Offensive rebound %", is: "Sóknarfráköst % (OREB%)" }, higherIsBetter: true, of: (g) => orebPct(g.box, g.oppBox) },
  { key: "tovPct", label: { en: "Turnover %", is: "Tapaðir % (TOV%)" }, higherIsBetter: false, of: (g) => tovPct(g.box) },
  { key: "ftRate", label: { en: "FT rate (FTM/FGA)", is: "Vítasókn (FTM/FGA)" }, higherIsBetter: true, of: (g) => ftRate(g.box) },
  { key: "blk", label: { en: "Blocks", is: "Varin skot" }, higherIsBetter: true, of: (g) => g.box.blk },
];

// Team-level factors (season averages), incl. scoring + defence + net rating.
const TEAM_FACTORS: FactorDef[] = [
  { key: "net", label: { en: "Net rating (pts − allowed)", is: "Nettó stig (skor − fengin)" }, higherIsBetter: true, of: (g) => g.box.pts - g.oppBox.pts },
  { key: "pts", label: { en: "Points scored", is: "Stig skoruð" }, higherIsBetter: true, of: (g) => g.box.pts },
  { key: "pa", label: { en: "Points allowed (defense)", is: "Stig fengin (vörn)" }, higherIsBetter: false, of: (g) => g.oppBox.pts },
  { key: "efg", label: { en: "eFG% (offense)", is: "eFG% sókn" }, higherIsBetter: true, of: (g) => eFG(g.box) },
  { key: "oppEfg", label: { en: "Opponent eFG% (defense)", is: "eFG% vörn (andst.)" }, higherIsBetter: false, of: (g) => eFG(g.oppBox) },
  { key: "tp3", label: { en: "3-point %", is: "3ja% sókn" }, higherIsBetter: true, of: (g) => tp3Pct(g.box) },
  { key: "ast", label: { en: "Assists", is: "Stoðsendingar" }, higherIsBetter: true, of: (g) => g.box.ast },
  { key: "stl", label: { en: "Steals", is: "Stolnir" }, higherIsBetter: true, of: (g) => g.box.stl },
  { key: "blk", label: { en: "Blocks", is: "Varin skot" }, higherIsBetter: true, of: (g) => g.box.blk },
  { key: "orebPct", label: { en: "Offensive rebound %", is: "Sóknarfráköst%" }, higherIsBetter: true, of: (g) => orebPct(g.box, g.oppBox) },
  { key: "tovPct", label: { en: "Turnover %", is: "Tapaðir%" }, higherIsBetter: false, of: (g) => tovPct(g.box) },
  { key: "ftRate", label: { en: "FT rate", is: "Vítasókn" }, higherIsBetter: true, of: (g) => ftRate(g.box) },
];

function pearson(xs: number[], ys: number[]): number {
  const m = xs.length; if (m < 2) return 0;
  const ax = xs.reduce((s, x) => s + x, 0) / m, ay = ys.reduce((s, y) => s + y, 0) / m;
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < m; i++) { const dx = xs[i] - ax, dy = ys[i] - ay; sxy += dx * dy; sx += dx * dx; sy += dy * dy; }
  return sx > 0 && sy > 0 ? sxy / Math.sqrt(sx * sy) : 0;
}

// Two-tailed p<.05 critical |r| for a sample of n (via a small t-table).
function tCrit(df: number): number {
  const tbl: Array<[number, number]> = [[1, 12.71], [2, 4.30], [3, 3.18], [4, 2.78], [5, 2.57], [6, 2.45], [7, 2.36], [8, 2.31], [9, 2.26], [10, 2.23], [11, 2.20], [12, 2.18], [15, 2.13], [20, 2.09], [30, 2.04], [40, 2.02], [60, 2.00], [120, 1.98]];
  if (df <= 1) return 12.71;
  if (df >= 200) return 1.97;
  for (let i = tbl.length - 1; i >= 0; i--) if (df >= tbl[i][0]) return tbl[i][1];
  return 12.71;
}
export function criticalR(sampleN: number): number {
  const df = sampleN - 2; if (df < 1) return 1;
  const t = tCrit(df);
  return t / Math.sqrt(df + t * t);
}

export type FactorR = { key: string; label: Bi; tip?: Bi; r: number; higherIsBetter: boolean; significant: boolean };
export type NetRatingRow = { team: string; wins: number; losses: number; gp: number; pf: number; pa: number; net: number; winPct: number };

export type WinFactorsRead = {
  games: number; teamGames: number; teams: number;
  gameCritical: number; teamCritical: number;
  eFGDiffR: number;
  gameLevel: FactorR[];
  teamLevel: FactorR[];
  netRating: NetRatingRow[];
  verdict: Bi;
  facts: Bi[];
  confidence: Bi;
};

function rank(factors: FactorDef[], xsOf: (f: FactorDef) => number[], ys: number[], crit: number): FactorR[] {
  return factors
    .map((f) => { const r = pearson(xsOf(f), ys); return { key: f.key, label: f.label, tip: f.tip, r: Math.round(r * 100) / 100, higherIsBetter: f.higherIsBetter, significant: Math.abs(r) >= crit }; })
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

/** The whole league read. Input = every team-game (both perspectives of every game). */
export function computeWinFactors(teamGames: TeamGame[]): WinFactorsRead {
  const games = new Set(teamGames.map((g) => g.gameId)).size;
  const tg = teamGames.length;

  // Game level.
  const wins = teamGames.map((g) => (g.win ? 1 : 0));
  const gameCritical = Math.round(criticalR(tg) * 100) / 100;
  const gameLevel = rank(GAME_FACTORS, (f) => teamGames.map(f.of), wins, gameCritical);
  const eFGDiffR = Math.round(pearson(teamGames.map((g) => eFG(g.box) - eFG(g.oppBox)), wins) * 100) / 100;

  // Team level — aggregate per team.
  const byTeam = new Map<string, TeamGame[]>();
  for (const g of teamGames) { const a = byTeam.get(g.team) ?? []; a.push(g); byTeam.set(g.team, a); }
  const teams = [...byTeam.keys()];
  const teamCritical = Math.round(criticalR(teams.length) * 100) / 100;
  const mean = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
  const winPct = teams.map((t) => mean(byTeam.get(t)!.map((g) => (g.win ? 1 : 0))));
  const teamLevel = rank(TEAM_FACTORS, (f) => teams.map((t) => mean(byTeam.get(t)!.map(f.of))), winPct, teamCritical);

  const netRating: NetRatingRow[] = teams.map((t) => {
    const gs = byTeam.get(t)!; const w = gs.filter((g) => g.win).length;
    const pf = mean(gs.map((g) => g.box.pts)), pa = mean(gs.map((g) => g.oppBox.pts));
    return { team: t, wins: w, losses: gs.length - w, gp: gs.length, pf: Math.round(pf * 10) / 10, pa: Math.round(pa * 10) / 10, net: Math.round((pf - pa) * 10) / 10, winPct: gs.length ? w / gs.length : 0 };
  }).sort((a, b) => b.net - a.net);

  const { verdict, facts } = deriveVerdict(teamLevel, gameLevel, netRating);
  const confidence: Bi = {
    en: `${games} games · ${tg} team-games (game-level significant at |r| ≥ ${gameCritical}); ${teams.length} teams (team-level significant at |r| ≥ ${teamCritical}, small sample).`,
    is: `${games} leikir · ${tg} liða-leikir (marktækt á leikja-stigi við |r| ≥ ${gameCritical}); ${teams.length} lið (marktækt á liða-stigi við |r| ≥ ${teamCritical}, lítið úrtak).`,
  };
  return { games, teamGames: tg, teams: teams.length, gameCritical, teamCritical, eFGDiffR, gameLevel, teamLevel, netRating, verdict, facts, confidence };
}

// ── Plain-language verdict (rules decide; theme mapping keeps it jargon-free) ──
type ThemeName = "defense" | "movement" | "scoring" | "rebounding" | "care";
const THEME: Record<string, { theme: ThemeName; fact: Bi }> = {
  net: { theme: "scoring", fact: { en: "outscore opponents by the most", is: "skora mest umfram andstæðinga" } },
  pa: { theme: "defense", fact: { en: "give up the fewest points", is: "gefa fæst stig" } },
  oppEfg: { theme: "defense", fact: { en: "make opponents shoot the worst", is: "láta andstæðinga skjóta verst" } },
  ast: { theme: "movement", fact: { en: "share the ball the most", is: "deila boltanum mest" } },
  efg: { theme: "scoring", fact: { en: "shoot the most efficiently", is: "skjóta skilvirkast" } },
  tp3: { theme: "scoring", fact: { en: "shoot threes the best", is: "hitta best af þristum" } },
  pts: { theme: "scoring", fact: { en: "score the most", is: "skora mest" } },
  orebPct: { theme: "rebounding", fact: { en: "win the offensive glass", is: "vinna sóknarfráköstin" } },
  tovPct: { theme: "care", fact: { en: "protect the ball best", is: "passa boltann best" } },
  stl: { theme: "defense", fact: { en: "force the most turnovers", is: "þvinga fram flest töp" } },
  ftRate: { theme: "scoring", fact: { en: "get to the free-throw line the most", is: "komast mest á vítalínuna" } },
};
const THEME_LABEL: Record<string, Bi> = {
  defense: { en: "defense", is: "vörn" }, movement: { en: "ball movement", is: "boltahreyfingu" },
  scoring: { en: "scoring", is: "skorun" }, rebounding: { en: "rebounding", is: "fráköst" }, care: { en: "ball security", is: "boltavörslu" },
};

function deriveVerdict(teamLevel: FactorR[], gameLevel: FactorR[], netRating: NetRatingRow[]): { verdict: Bi; facts: Bi[] } {
  const sig = teamLevel.filter((f) => f.significant && f.key !== "net" && f.key !== "pts");
  const themes: ThemeName[] = [];
  for (const f of sig) { const th = THEME[f.key]?.theme; if (th && !themes.includes(th)) themes.push(th); if (themes.length >= 2) break; }
  if (themes.length === 0) themes.push("scoring");
  const themeEn = themes.map((t) => THEME_LABEL[t].en), themeIs = themes.map((t) => THEME_LABEL[t].is);
  const joinEn = themeEn.join(" and "), joinIs = themeIs.join(" og ");
  const verdict: Bi = { en: `This league is won on ${joinEn}.`, is: `Þessi deild vinnst á ${joinIs}.` };

  const facts: Bi[] = [];
  const top = sig.slice(0, 2);
  const rTxt = (f: FactorR) => `${f.r > 0 ? "+" : ""}${f.r.toFixed(2)}`;
  for (const f of top) {
    const ph = THEME[f.key]?.fact;
    facts.push({
      en: `Winners ${ph?.en ?? f.label.en} (${f.label.en} r ${rTxt(f)}).`,
      is: `Sigurlið ${ph?.is ?? f.label.is} (${f.label.is} r ${rTxt(f)}).`,
    });
  }
  // Contrast: shooting % less decisive over a season than game-to-game.
  const teamEfg = teamLevel.find((f) => f.key === "efg"), gameEfg = gameLevel.find((f) => f.key === "efg");
  if (teamEfg && gameEfg && Math.abs(gameEfg.r) - Math.abs(teamEfg.r) >= 0.15) {
    facts.push({ en: "Shooting % swings individual games but matters less over a full season.", is: "Skotnýting ræður einstökum leikjum en skiptir minna máli yfir heilt tímabil." });
  }
  // Named exception: the best record also owning the best defense.
  const bestRecord = [...netRating].sort((a, b) => b.winPct - a.winPct)[0];
  const bestDefense = [...netRating].sort((a, b) => a.pa - b.pa)[0];
  if (bestRecord && bestDefense && bestRecord.team === bestDefense.team) {
    facts.push({ en: `${bestRecord.team} top the table on the league's best defense (${bestDefense.pa} allowed/game).`, is: `${bestRecord.team} tróna á toppnum á bestu vörn deildarinnar (${bestDefense.pa} fengin/leik).` });
  }
  return { verdict, facts: facts.slice(0, 3) };
}
