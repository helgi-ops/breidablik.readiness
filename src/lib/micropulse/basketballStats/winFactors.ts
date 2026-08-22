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
export type TeamGame = { gameId: string; team: string; win: boolean; box: TeamBox; oppBox: TeamBox; opponent?: string };

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

/** One stored game → the OWNER team's single team-game (own perspective only). */
export function ownTeamGameFromFibaGame(g: { own_name?: string | null; opp_name?: string | null; own_totals?: Record<string, unknown> | null; opp_totals?: Record<string, unknown> | null; match_id?: string | number | null }): TeamGame | null {
  const own = boxFromTotals(g.own_totals), opp = boxFromTotals(g.opp_totals);
  if (!own.fga || !opp.fga) return null;
  return { gameId: String(g.match_id ?? ""), team: g.own_name ?? "own", win: own.pts > opp.pts, box: own, oppBox: opp, opponent: g.opp_name ?? undefined };
}

/** One stored game → the team-game for a SPECIFIC team (own or opp side, whichever it is),
 *  or null if the game doesn't feature that team. Lets team form work even when a store
 *  holds a whole league (own side was set to team 1 at ingest, not the coach's team). */
export function teamGameForTeam(
  g: { own_name?: string | null; opp_name?: string | null; own_totals?: Record<string, unknown> | null; opp_totals?: Record<string, unknown> | null; match_id?: string | number | null },
  matches: (name: string | null | undefined) => boolean,
): TeamGame | null {
  const own = boxFromTotals(g.own_totals), opp = boxFromTotals(g.opp_totals);
  if (!own.fga || !opp.fga) return null;
  const id = String(g.match_id ?? "");
  if (matches(g.own_name)) return { gameId: id, team: g.own_name ?? "own", win: own.pts > opp.pts, box: own, oppBox: opp, opponent: g.opp_name ?? undefined };
  if (matches(g.opp_name)) return { gameId: id, team: g.opp_name ?? "opp", win: opp.pts > own.pts, box: opp, oppBox: own, opponent: g.own_name ?? undefined };
  return null;
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
  gameReliable: boolean; teamReliable: boolean;
  isLeague: boolean; dominantTeam: string | null;
  eFGDiffR: number;
  gameLevel: FactorR[];
  teamLevel: FactorR[];
  netRating: NetRatingRow[];
  verdict: Bi;
  facts: Bi[];
  confidence: Bi;
};

// Below this many data points a correlation is not interpretable (n<4 ⇒ df<2): never
// flag "significant", so a 2-team final can't produce a degenerate r=±1.00 headline.
const RELIABLE_MIN = 4;

function rank(factors: FactorDef[], xsOf: (f: FactorDef) => number[], ys: number[], crit: number, reliable: boolean): FactorR[] {
  return factors
    .map((f) => { const r = pearson(xsOf(f), ys); return { key: f.key, label: f.label, tip: f.tip, r: Math.round(r * 100) / 100, higherIsBetter: f.higherIsBetter, significant: reliable && Math.abs(r) >= crit }; })
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

/** The whole league read. Input = every team-game (both perspectives of every game). */
export function computeWinFactors(teamGames: TeamGame[]): WinFactorsRead {
  const games = new Set(teamGames.map((g) => g.gameId)).size;
  const tg = teamGames.length;

  // Game level.
  const wins = teamGames.map((g) => (g.win ? 1 : 0));
  const gameReliable = tg >= RELIABLE_MIN;
  const gameCritical = Math.round(criticalR(tg) * 100) / 100;
  const gameLevel = rank(GAME_FACTORS, (f) => teamGames.map(f.of), wins, gameCritical, gameReliable);
  const eFGDiffR = Math.round(pearson(teamGames.map((g) => eFG(g.box) - eFG(g.oppBox)), wins) * 100) / 100;

  // Team level — aggregate per team.
  const byTeam = new Map<string, TeamGame[]>();
  for (const g of teamGames) { const a = byTeam.get(g.team) ?? []; a.push(g); byTeam.set(g.team, a); }
  const teams = [...byTeam.keys()];
  const teamReliable = teams.length >= RELIABLE_MIN;
  const teamCritical = Math.round(criticalR(teams.length) * 100) / 100;
  const mean = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
  // Is this a real LEAGUE (every team plays many games) or one team's games (that team is
  // in ~every game, opponents appear once or twice)? If one team is in >60% of the games,
  // the cross-team correlations + net table are not a league read — flag it.
  const distinctGames = new Set(teamGames.map((g) => g.gameId)).size;
  const maxTeamGames = Math.max(0, ...teams.map((t) => byTeam.get(t)!.length));
  const dominantTeam = distinctGames > 0 && maxTeamGames / distinctGames > 0.6 ? [...byTeam.entries()].sort((a, b) => b[1].length - a[1].length)[0][0] : null;
  const isLeague = distinctGames >= 4 && dominantTeam == null;
  const winPct = teams.map((t) => mean(byTeam.get(t)!.map((g) => (g.win ? 1 : 0))));
  const teamLevel = rank(TEAM_FACTORS, (f) => teams.map((t) => mean(byTeam.get(t)!.map(f.of))), winPct, teamReliable ? teamCritical : Infinity, teamReliable);

  const netRating: NetRatingRow[] = teams.map((t) => {
    const gs = byTeam.get(t)!; const w = gs.filter((g) => g.win).length;
    const pf = mean(gs.map((g) => g.box.pts)), pa = mean(gs.map((g) => g.oppBox.pts));
    return { team: t, wins: w, losses: gs.length - w, gp: gs.length, pf: Math.round(pf * 10) / 10, pa: Math.round(pa * 10) / 10, net: Math.round((pf - pa) * 10) / 10, winPct: gs.length ? w / gs.length : 0 };
  }).sort((a, b) => b.net - a.net);

  const { verdict, facts } = deriveVerdict(teamLevel, gameLevel, netRating, teamReliable);
  const teamNote = teamReliable ? `${teams.length} ${teams.length === 1 ? "team" : "teams"} (team-level significant at |r| ≥ ${teamCritical}, small sample)` : `only ${teams.length} teams — too few for a reliable season correlation, results shown as-is`;
  const teamNoteIs = teamReliable ? `${teams.length} lið (marktækt á liða-stigi við |r| ≥ ${teamCritical}, lítið úrtak)` : `aðeins ${teams.length} lið — of fá fyrir áreiðanlega fylgni, úrslit sýnd eins og þau eru`;
  const confidence: Bi = {
    en: `${games} games · ${tg} team-games (game-level significant at |r| ≥ ${gameCritical}); ${teamNote}.`,
    is: `${games} leikir · ${tg} liða-leikir (marktækt á leikja-stigi við |r| ≥ ${gameCritical}); ${teamNoteIs}.`,
  };
  return { games, teamGames: tg, teams: teams.length, gameCritical, teamCritical, gameReliable, teamReliable, isLeague, dominantTeam, eFGDiffR, gameLevel, teamLevel, netRating, verdict, facts, confidence };
}

// ── Per-opponent tie-in: "to beat {team}, win these factors" ──────────────────
export type BeatItem = { key: string; label: Bi; r: number; oppValue: number; leagueAvg: number; higherIsBetter: boolean; note: Bi };
export type BeatPlan = { team: string; games: number; exploit: BeatItem[]; neutralize: BeatItem[]; note: Bi };

/** Advisory game plan for one league team: where they sit on the factors that decide
 *  games here — exploit where they are weak, neutralize where they are strong. The
 *  league win-factor r is the weighting layer. Advisory only; never a decision. */
export function beatTeamPlan(teamGames: TeamGame[], teamName: string): BeatPlan | null {
  const read = computeWinFactors(teamGames);
  const target = teamGames.filter((g) => g.team === teamName);
  if (!target.length) return null;
  const mean = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
  const teams = [...new Set(teamGames.map((g) => g.team))];
  // Tactical levers only — drop the aggregate outcomes (net rating, raw points).
  const levers = TEAM_FACTORS.filter((f) => f.key !== "net" && f.key !== "pts");
  const rByKey = new Map(read.teamLevel.map((f) => [f.key, f]));

  const exploit: BeatItem[] = [], neutralize: BeatItem[] = [];
  for (const f of levers) {
    const rr = rByKey.get(f.key); if (!rr || !rr.significant) continue;
    const leagueAvg = mean(teams.map((t) => mean(teamGames.filter((g) => g.team === t).map(f.of))));
    const oppValue = mean(target.map(f.of));
    const above = oppValue > leagueAvg;
    const onWinningSide = (rr.r > 0 && above) || (rr.r < 0 && !above); // strong on a winning dimension
    const item: BeatItem = { key: f.key, label: f.label, r: rr.r, oppValue: Math.round(oppValue * 1000) / 1000, leagueAvg: Math.round(leagueAvg * 1000) / 1000, higherIsBetter: f.higherIsBetter, note: { en: "", is: "" } };
    const noun = THEME[f.key]?.noun ?? f.label;
    const rStr = `${rr.r > 0 ? "+" : ""}${rr.r.toFixed(2)}`;
    if (onWinningSide) {
      item.note = { en: `Neutralize their ${noun.en} — a league-winning strength (r ${rStr}).`, is: `Takið frá þeim ${noun.is} — styrkur sem vinnur leiki í deildinni (r ${rStr}).` };
      neutralize.push(item);
    } else {
      item.note = { en: `Attack their ${noun.en} — they're on the losing side of it, and it decides games here (r ${rStr}).`, is: `Sækið ${noun.is} þeirra — þeir eru á tapandi hlið og það ræður leikjum hér (r ${rStr}).` };
      exploit.push(item);
    }
  }
  const byWeight = (a: BeatItem, b: BeatItem) => Math.abs(b.r) - Math.abs(a.r);
  exploit.sort(byWeight); neutralize.sort(byWeight);
  return {
    team: teamName, games: target.length,
    exploit: exploit.slice(0, 4), neutralize: neutralize.slice(0, 4),
    note: { en: "Advisory — the league's win-factors filtered to where this team is weak or strong. Descriptive; never a decision.", is: "Ráðgefandi — sigurþættir deildarinnar síaðir eftir því hvar liðið er veikt eða sterkt. Lýsandi; aldrei ákvörðun." },
  };
}

// ── Team form / season trajectory (single team — how their games are developing) ──
export type TeamFormGame = { gameId: string; opponent: string; win: boolean; pts: number; oppPts: number; margin: number; eFG: number; oppEFG: number; tovPct: number; orebPct: number; ftRate: number; ast: number };
export type TeamFormRead = {
  team: string; games: number; wins: number; losses: number;
  avg: { pf: number; pa: number; net: number; eFG: number; oppEFG: number; tovPct: number; orebPct: number; ftRate: number; ast: number };
  log: TeamFormGame[];
  trend: { splitN: number; earlierNet: number; recentNet: number; deltaNet: number; note: Bi } | null;
  verdict: Bi; facts: Bi[]; confidence: Bi;
};

const r1n = (n: number) => Math.round(n * 10) / 10;
const pctI = (n: number) => Math.round(n * 100);

/** How one team's games are developing: game log + Four-Factors averages + a recent-vs-
 *  earlier trend + a plain verdict. Ordered by gameid (no dates in the FIBA feed). */
export function computeTeamForm(ownGames: TeamGame[]): TeamFormRead {
  const games = [...ownGames].sort((a, b) => Number(a.gameId) - Number(b.gameId));
  const team = games[0]?.team ?? "—";
  const mean = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);

  const log: TeamFormGame[] = games.map((g) => ({
    gameId: g.gameId, opponent: g.opponent ?? "—", win: g.win, pts: g.box.pts, oppPts: g.oppBox.pts, margin: g.box.pts - g.oppBox.pts,
    eFG: pctI(eFG(g.box)), oppEFG: pctI(eFG(g.oppBox)), tovPct: pctI(tovPct(g.box)), orebPct: pctI(orebPct(g.box, g.oppBox)), ftRate: pctI(ftRate(g.box)), ast: g.box.ast,
  }));
  const wins = games.filter((g) => g.win).length;
  const avg = {
    pf: r1n(mean(games.map((g) => g.box.pts))), pa: r1n(mean(games.map((g) => g.oppBox.pts))),
    net: r1n(mean(games.map((g) => g.box.pts - g.oppBox.pts))),
    eFG: pctI(mean(games.map((g) => eFG(g.box)))), oppEFG: pctI(mean(games.map((g) => eFG(g.oppBox)))),
    tovPct: pctI(mean(games.map((g) => tovPct(g.box)))), orebPct: pctI(mean(games.map((g) => orebPct(g.box, g.oppBox)))),
    ftRate: pctI(mean(games.map((g) => ftRate(g.box)))), ast: r1n(mean(games.map((g) => g.box.ast))),
  };

  // Recent-vs-earlier trend (by load/id order) — only with enough games to split.
  let trend: TeamFormRead["trend"] = null;
  if (games.length >= 6) {
    const half = Math.floor(games.length / 2);
    const earlier = games.slice(0, half), recent = games.slice(half);
    const netOf = (gs: TeamGame[]) => mean(gs.map((g) => g.box.pts - g.oppBox.pts));
    const earlierNet = r1n(netOf(earlier)), recentNet = r1n(netOf(recent)), deltaNet = r1n(recentNet - earlierNet);
    const dir = deltaNet >= 3 ? "up" : deltaNet <= -3 ? "down" : "flat";
    const note: Bi = dir === "up"
      ? { en: `Trending up — ${recentNet >= 0 ? "+" : ""}${recentNet} net over the recent ${recent.length} games vs ${earlierNet >= 0 ? "+" : ""}${earlierNet} earlier.`, is: `Á uppleið — ${recentNet >= 0 ? "+" : ""}${recentNet} nettó í síðustu ${recent.length} leikjum móti ${earlierNet >= 0 ? "+" : ""}${earlierNet} áður.` }
      : dir === "down"
      ? { en: `Trending down — ${recentNet >= 0 ? "+" : ""}${recentNet} net over the recent ${recent.length} games vs ${earlierNet >= 0 ? "+" : ""}${earlierNet} earlier.`, is: `Á niðurleið — ${recentNet >= 0 ? "+" : ""}${recentNet} nettó í síðustu ${recent.length} leikjum móti ${earlierNet >= 0 ? "+" : ""}${earlierNet} áður.` }
      : { en: `Holding steady — ${recentNet >= 0 ? "+" : ""}${recentNet} net recently vs ${earlierNet >= 0 ? "+" : ""}${earlierNet} earlier.`, is: `Stöðugt — ${recentNet >= 0 ? "+" : ""}${recentNet} nettó nýlega móti ${earlierNet >= 0 ? "+" : ""}${earlierNet} áður.` };
    trend = { splitN: recent.length, earlierNet, recentNet, deltaNet, note };
  }

  // Verdict — their identity over these games.
  const verdict: Bi = avg.net >= 3
    ? { en: `${team} are outscoring opponents by +${avg.net} per game over these ${games.length} games.`, is: `${team} skora ${avg.net} stigum meira en andstæðingar að meðaltali í þessum ${games.length} leikjum.` }
    : avg.net <= -3
    ? { en: `${team} are being outscored by ${Math.abs(avg.net)} per game over these ${games.length} games.`, is: `${team} fá á sig ${Math.abs(avg.net)} stigum meira að meðaltali í þessum ${games.length} leikjum.` }
    : { en: `${team} are roughly even over these ${games.length} games (${avg.net >= 0 ? "+" : ""}${avg.net}/game) — decided at the margins.`, is: `${team} eru nokkurn veginn jöfn í þessum ${games.length} leikjum (${avg.net >= 0 ? "+" : ""}${avg.net}/leik) — ræðst á smáatriðum.` };

  const facts: Bi[] = [
    { en: `Record ${wins}-${games.length - wins}; scoring ${avg.pf}, allowing ${avg.pa} per game.`, is: `Staða ${wins}-${games.length - wins}; skora ${avg.pf}, fá á sig ${avg.pa} að meðaltali.` },
    { en: `Shooting ${avg.eFG}% eFG vs allowing ${avg.oppEFG}% — ${avg.eFG - avg.oppEFG >= 3 ? "their edge is offense" : avg.oppEFG - avg.eFG >= 3 ? "their edge is defense" : "balanced both ends"}.`, is: `Skjóta ${avg.eFG}% eFG móti ${avg.oppEFG}% — ${avg.eFG - avg.oppEFG >= 3 ? "styrkurinn er sókn" : avg.oppEFG - avg.eFG >= 3 ? "styrkurinn er vörn" : "jafnvægi á báðum endum"}.` },
  ];
  if (trend) facts.push(trend.note);

  const confidence: Bi = {
    en: `${games.length} loaded games, ordered by game id (the FIBA feed has no date). Load a single full season for a true season trajectory. Descriptive — never touches readiness.`,
    is: `${games.length} leikir hlaðnir, raðað eftir leik-id (FIBA-fóðrið hefur enga dagsetningu). Hladdu heilu tímabili fyrir rétta tímabils-þróun. Lýsandi — snertir aldrei readiness.`,
  };
  return { team, games: games.length, wins, losses: games.length - wins, avg, log, trend, verdict, facts, confidence };
}

// ── Plain-language verdict (rules decide; theme mapping keeps it jargon-free) ──
type ThemeName = "defense" | "movement" | "scoring" | "rebounding" | "care";
const THEME: Record<string, { theme: ThemeName; fact: Bi; noun: Bi }> = {
  net: { theme: "scoring", fact: { en: "outscore opponents by the most", is: "skora mest umfram andstæðinga" }, noun: { en: "scoring margin", is: "stigamun" } },
  pa: { theme: "defense", fact: { en: "give up the fewest points", is: "gefa fæst stig" }, noun: { en: "scoring defense", is: "varnarleik" } },
  oppEfg: { theme: "defense", fact: { en: "make opponents shoot the worst", is: "láta andstæðinga skjóta verst" }, noun: { en: "shot defense", is: "skotvörn" } },
  ast: { theme: "movement", fact: { en: "share the ball the most", is: "deila boltanum mest" }, noun: { en: "ball movement", is: "boltahreyfingu" } },
  efg: { theme: "scoring", fact: { en: "shoot the most efficiently", is: "skjóta skilvirkast" }, noun: { en: "shooting efficiency", is: "skotnýtingu" } },
  tp3: { theme: "scoring", fact: { en: "shoot threes the best", is: "hitta best af þristum" }, noun: { en: "three-point shooting", is: "þriggja stiga skot" } },
  pts: { theme: "scoring", fact: { en: "score the most", is: "skora mest" }, noun: { en: "scoring", is: "skorun" } },
  orebPct: { theme: "rebounding", fact: { en: "win the offensive glass", is: "vinna sóknarfráköstin" }, noun: { en: "offensive rebounding", is: "sóknarfráköst" } },
  tovPct: { theme: "care", fact: { en: "protect the ball best", is: "passa boltann best" }, noun: { en: "ball security", is: "boltavörslu" } },
  stl: { theme: "defense", fact: { en: "force the most turnovers", is: "þvinga fram flest töp" }, noun: { en: "ball pressure", is: "boltapressu" } },
  ftRate: { theme: "scoring", fact: { en: "get to the free-throw line the most", is: "komast mest á vítalínuna" }, noun: { en: "free-throw pressure", is: "vítasókn" } },
};
const THEME_LABEL: Record<string, Bi> = {
  defense: { en: "defense", is: "vörn" }, movement: { en: "ball movement", is: "boltahreyfingu" },
  scoring: { en: "scoring", is: "skorun" }, rebounding: { en: "rebounding", is: "fráköst" }, care: { en: "ball security", is: "boltavörslu" },
};

function deriveVerdict(teamLevel: FactorR[], gameLevel: FactorR[], netRating: NetRatingRow[], teamReliable: boolean): { verdict: Bi; facts: Bi[] } {
  // Too few teams to say what wins the LEAGUE — describe the sample honestly, don't overclaim.
  if (!teamReliable) {
    const top = [...netRating].sort((a, b) => b.winPct - a.winPct)[0];
    const facts: Bi[] = [];
    if (top) facts.push({ en: `${top.team} came out on top (${top.wins}-${top.losses}, ${top.net >= 0 ? "+" : ""}${top.net} net rating).`, is: `${top.team} stóð uppi sem sigurvegari (${top.wins}-${top.losses}, ${top.net >= 0 ? "+" : ""}${top.net} nettó).` });
    facts.push({ en: "Too small a sample for season-wide win-factor correlations — open a full league season for that read.", is: "Of lítið úrtak fyrir fylgni sigurþátta yfir tímabil — opnaðu heilt deildartímabil fyrir þá lesningu." });
    return { verdict: { en: "Too small a sample to say what wins here — showing the games only.", is: "Of lítið úrtak til að segja hvað vinnur hér — sýni aðeins leikina." }, facts };
  }
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
