/**
 * Basketball Opponent Scouting report — a detailed read of an opponent from their
 * OWN full-season box scores (pulled free from the KKÍ widget or uploaded from Instat).
 *
 * Pure, IO-free. Produces a team season profile, a per-player threat breakdown, and
 * rule-based "how to defend them" flags — each citing the numbers that fired it.
 * Descriptive scouting context only: it never touches the readiness colour, load, or the
 * daily decision. Rules compute everything; any AI layer only phrases it.
 */

export type OppPlayerGame = {
  gameId: string; gameDate: string | null; opponent: string | null; homeAway: "home" | "away" | null;
  playerName: string; playerRef: string;
  minutes: number | null; points: number | null;
  fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null; ftm: number | null; fta: number | null;
  oreb: number | null; dreb: number | null; reb: number | null;
  assists: number | null; steals: number | null; blocks: number | null; turnovers: number | null; fouls: number | null;
};

// ── Tunables (transparent) ──────────────────────────────────────────────────
export const SCORER_SHARE = 0.28;   // a player's PPG ÷ team PPG above this → "primary scorer"
export const TP_VOLUME = 20;        // team 3PA/game above this → "lives behind the arc"
export const TP_GOOD = 35;          // team 3P% above this → shoots it well
export const TOV_HIGH = 15;         // team turnovers/game above this → pressable
export const OREB_HIGH = 12;        // team offensive rebounds/game above this → crashes the glass
export const P_SCORER_PPG = 14;     // player PPG for a scorer tag
export const P_SHOOTER_TPA = 4;     // player 3PA/game for a shooter tag
export const P_SHOOTER_PCT = 34;    // and 3P% to call it a threat
export const P_PLAYMAKER_APG = 4;
export const P_GLASS_RPG = 7;
export const MIN_PLAYER_GAMES = 3;

const r1 = (v: number) => Math.round(v * 10) / 10;
const avg = (xs: number[]): number | null => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pct = (m: number, a: number): number | null => (a > 0 ? Math.round((m / a) * 1000) / 10 : null);

export type OppTeamProfile = {
  games: number;
  ppg: number | null; fgPct: number | null; tpPct: number | null; ftPct: number | null;
  tpaPg: number | null; reb: number | null; oreb: number | null; ast: number | null; tov: number | null; stl: number | null; blk: number | null;
  homePpg: number | null; awayPpg: number | null;
};

export type OppPlayer = {
  name: string; ref: string; games: number;
  mpg: number | null; ppg: number | null; rpg: number | null; apg: number | null;
  fgPct: number | null; tpPct: number | null; tpaPg: number | null; spg: number | null; bpg: number | null; topg: number | null;
  scoreShare: number | null; // ppg ÷ team ppg
  tags: string[];            // e.g. "primary_scorer", "three_point_threat", "playmaker", "glass"
  descriptor: { en: string; is: string }; // plain-language "how he plays", composed from the numbers
  // Shooting profile from the box scores (NO shot locations exist in the KKÍ feed, so this
  // is a make/attempt/percentage split, not a court chart) + a per-game points series.
  shooting: { twoPct: number | null; twoPaPg: number | null; threePct: number | null; threePaPg: number | null; ftPct: number | null; ftaPg: number | null; ptsSeries: number[] };
  recentGames: RecentGame[]; // most-recent first (for the pop-up game log)
};

export type RecentGame = {
  date: string | null; opponent: string | null; homeAway: "home" | "away" | null;
  min: number | null; pts: number | null; reb: number | null; ast: number | null;
  fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null;
};

/**
 * Compose a plain-language scouting sentence for one player from his own numbers —
 * rule-based and cited (no AI), so it never invents anything. Lead clause = his primary
 * role/volume; trailing clauses add the secondary skills the tags flagged.
 */
function describePlayer(p: Pick<OppPlayer, "tags" | "scoreShare" | "ppg" | "tpPct" | "tpaPg" | "fgPct" | "apg" | "rpg" | "spg">): { en: string; is: string } {
  const en: string[] = []; const is: string[] = [];
  const isScorer = p.tags.includes("primary_scorer");
  const isShooter = p.tags.includes("three_point_threat");
  const isPlaymaker = p.tags.includes("playmaker");
  const isGlass = p.tags.includes("glass");
  const share = p.scoreShare != null ? Math.round(p.scoreShare * 100) : null;
  const shootClause = { en: `${p.tpPct ?? "?"}% from three on ${p.tpaPg ?? "?"}/g`, is: `${p.tpPct ?? "?"}% af þristum á ${p.tpaPg ?? "?"}/leik` };

  // Lead clause — primary identity.
  if (isScorer && isShooter) {
    en.push(`Volume scorer who spaces the floor — ${p.ppg ?? "?"} PPG${share ? ` (${share}% of their offense)` : ""} and a live shooter (${shootClause.en})`);
    is.push(`Magn-skorari sem opnar völlinn — ${p.ppg ?? "?"} stig/leik${share ? ` (${share}% af sókninni)` : ""} og virk skytta (${shootClause.is})`);
  } else if (isScorer) {
    en.push(`Go-to scorer at ${p.ppg ?? "?"} PPG${share ? ` (${share}% of their offense)` : ""}${(p.fgPct ?? 0) >= 50 ? `, efficient inside (${p.fgPct}% FG)` : ""}`);
    is.push(`Aðal-skorari með ${p.ppg ?? "?"} stig/leik${share ? ` (${share}% af sókninni)` : ""}${(p.fgPct ?? 0) >= 50 ? `, skilvirkur inni (${p.fgPct}% skotnýting)` : ""}`);
  } else if (isShooter) {
    en.push(`Off-ball shooter — ${shootClause.en}; find him in transition and off screens`);
    is.push(`Skytta án bolta — ${shootClause.is}; finndu hann í hraðaupphlaupum og af blokkum`);
  } else if (isPlaymaker) {
    en.push(`Primary creator — ${p.apg ?? "?"} assists a game`);
    is.push(`Aðal-skapari — ${p.apg ?? "?"} stoðsendingar á leik`);
  } else if (isGlass) {
    en.push(`Works the glass — ${p.rpg ?? "?"} rebounds a game`);
    is.push(`Vinnur fráköst — ${p.rpg ?? "?"} fráköst á leik`);
  } else {
    en.push(`Role player at ${p.ppg ?? "?"} PPG`);
    is.push(`Hlutverksleikmaður með ${p.ppg ?? "?"} stig/leik`);
  }

  // Trailing skills the lead clause didn't already cover.
  const playmakerIsLead = isPlaymaker && !isScorer && !isShooter && !isGlass;
  const glassIsLead = isGlass && !isScorer && !isShooter && !isPlaymaker;
  if (isPlaymaker && !playmakerIsLead) { en.push(`also creates for others (${p.apg} AST)`); is.push(`skapar líka fyrir aðra (${p.apg} stoðsendingar)`); }
  if (isGlass && !glassIsLead) { en.push(`and crashes the boards (${p.rpg} REB)`); is.push(`og sækir í fráköstin (${p.rpg} fráköst)`); }
  if ((p.spg ?? 0) >= 1.5) { en.push(`active in the passing lanes (${p.spg} STL/g)`); is.push(`virkur í sendilínum (${p.spg} stolnir/leik)`); }

  return { en: `${en.join(", ")}.`, is: `${is.join(", ")}.` };
}

export type DefendFlag = { id: string; en: string; is: string; evidence: string };

export type BasketballOpponentReport = {
  opponentName: string;
  games: number;
  team: OppTeamProfile;
  players: OppPlayer[];       // by PPG desc
  keyPlayers: OppPlayer[];    // top scorers (share of offense)
  howToDefend: DefendFlag[];
};

type GameTotals = { pts: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; oreb: number; reb: number; ast: number; tov: number; stl: number; blk: number; homeAway: "home" | "away" | null };

function teamProfile(rows: OppPlayerGame[]): { profile: OppTeamProfile; teamPpg: number } {
  const byGame = new Map<string, GameTotals>();
  for (const r of rows) {
    let g = byGame.get(r.gameId);
    if (!g) { g = { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, oreb: 0, reb: 0, ast: 0, tov: 0, stl: 0, blk: 0, homeAway: r.homeAway }; byGame.set(r.gameId, g); }
    g.pts += r.points ?? 0; g.fgm += r.fgm ?? 0; g.fga += r.fga ?? 0; g.tpm += r.tpm ?? 0; g.tpa += r.tpa ?? 0;
    g.ftm += r.ftm ?? 0; g.fta += r.fta ?? 0; g.oreb += r.oreb ?? 0; g.reb += r.reb ?? 0; g.ast += r.assists ?? 0;
    g.tov += r.turnovers ?? 0; g.stl += r.steals ?? 0; g.blk += r.blocks ?? 0;
  }
  const games = [...byGame.values()];
  const home = games.filter((g) => g.homeAway === "home"), away = games.filter((g) => g.homeAway === "away");
  const sum = (gs: GameTotals[], f: (g: GameTotals) => number) => gs.reduce((a, g) => a + f(g), 0);
  const profile: OppTeamProfile = {
    games: games.length,
    ppg: avg(games.map((g) => g.pts)),
    fgPct: pct(sum(games, (g) => g.fgm), sum(games, (g) => g.fga)),
    tpPct: pct(sum(games, (g) => g.tpm), sum(games, (g) => g.tpa)),
    ftPct: pct(sum(games, (g) => g.ftm), sum(games, (g) => g.fta)),
    tpaPg: avg(games.map((g) => g.tpa)),
    reb: avg(games.map((g) => g.reb)), oreb: avg(games.map((g) => g.oreb)),
    ast: avg(games.map((g) => g.ast)), tov: avg(games.map((g) => g.tov)),
    stl: avg(games.map((g) => g.stl)), blk: avg(games.map((g) => g.blk)),
    homePpg: avg(home.map((g) => g.pts)), awayPpg: avg(away.map((g) => g.pts)),
  };
  return { profile, teamPpg: profile.ppg ?? 0 };
}

function players(rows: OppPlayerGame[], teamPpg: number): OppPlayer[] {
  const byRef = new Map<string, OppPlayerGame[]>();
  for (const r of rows) { const k = r.playerRef || r.playerName; (byRef.get(k) ?? byRef.set(k, []).get(k)!).push(r); }
  const out: OppPlayer[] = [];
  for (const [ref, rs] of byRef) {
    if (rs.length < MIN_PLAYER_GAMES) continue;
    const ppg = avg(rs.map((r) => r.points ?? 0));
    const tpaPg = avg(rs.map((r) => r.tpa ?? 0));
    const apg = avg(rs.map((r) => r.assists ?? 0));
    const rpg = avg(rs.map((r) => r.reb ?? 0));
    const tpPct = pct(rs.reduce((a, r) => a + (r.tpm ?? 0), 0), rs.reduce((a, r) => a + (r.tpa ?? 0), 0));
    const fgPct = pct(rs.reduce((a, r) => a + (r.fgm ?? 0), 0), rs.reduce((a, r) => a + (r.fga ?? 0), 0));
    const scoreShare = teamPpg > 0 && ppg != null ? Math.round((ppg / teamPpg) * 100) / 100 : null;
    const tags: string[] = [];
    if ((scoreShare ?? 0) >= SCORER_SHARE || (ppg ?? 0) >= P_SCORER_PPG) tags.push("primary_scorer");
    if ((tpaPg ?? 0) >= P_SHOOTER_TPA && (tpPct ?? 0) >= P_SHOOTER_PCT) tags.push("three_point_threat");
    if ((apg ?? 0) >= P_PLAYMAKER_APG) tags.push("playmaker");
    if ((rpg ?? 0) >= P_GLASS_RPG) tags.push("glass");
    // Chronological (oldest→newest) for the points series; reversed for "recent" games.
    const chron = [...rs].sort((a, b) => String(a.gameDate ?? "").localeCompare(String(b.gameDate ?? "")));
    const twoM = rs.reduce((a, r) => a + ((r.fgm ?? 0) - (r.tpm ?? 0)), 0);
    const twoA = rs.reduce((a, r) => a + ((r.fga ?? 0) - (r.tpa ?? 0)), 0);
    const shooting = {
      twoPct: pct(twoM, twoA), twoPaPg: avg(rs.map((r) => (r.fga ?? 0) - (r.tpa ?? 0))),
      threePct: tpPct, threePaPg: tpaPg,
      ftPct: pct(rs.reduce((a, r) => a + (r.ftm ?? 0), 0), rs.reduce((a, r) => a + (r.fta ?? 0), 0)),
      ftaPg: avg(rs.map((r) => r.fta ?? 0)),
      ptsSeries: chron.map((r) => r.points ?? 0),
    };
    const recentGames: RecentGame[] = [...chron].reverse().slice(0, 5).map((r) => ({
      date: r.gameDate, opponent: r.opponent, homeAway: r.homeAway,
      min: r.minutes, pts: r.points, reb: r.reb, ast: r.assists, fgm: r.fgm, fga: r.fga, tpm: r.tpm, tpa: r.tpa,
    }));
    const base = {
      name: rs[rs.length - 1].playerName, ref, games: rs.length,
      mpg: avg(rs.map((r) => r.minutes ?? 0)), ppg, rpg, apg, fgPct, tpPct, tpaPg,
      spg: avg(rs.map((r) => r.steals ?? 0)), bpg: avg(rs.map((r) => r.blocks ?? 0)), topg: avg(rs.map((r) => r.turnovers ?? 0)),
      scoreShare, tags,
    };
    out.push({ ...base, descriptor: describePlayer(base), shooting, recentGames });
  }
  return out.sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0));
}

function howToDefend(team: OppTeamProfile, ps: OppPlayer[]): DefendFlag[] {
  const flags: DefendFlag[] = [];
  const top = ps[0];
  if (top && (top.scoreShare ?? 0) >= SCORER_SHARE) {
    flags.push({
      id: "one_scorer", en: `One dominant scorer — build the plan around stopping ${top.name}.`,
      is: `Einn ráðandi skorari — byggðu vörnina á að stöðva ${top.name}.`,
      evidence: `${top.name} ${top.ppg}/g = ${Math.round((top.scoreShare ?? 0) * 100)}% of their points`,
    });
  }
  if ((team.tpaPg ?? 0) >= TP_VOLUME || (team.tpPct ?? 0) >= TP_GOOD) {
    flags.push({
      id: "three_point", en: "They live behind the arc — chase them off the three-point line.",
      is: "Þeir treysta á þriggja-stiga skot — rektu þá af þriggja-stiga línunni.",
      evidence: `${team.tpaPg}/g 3PA at ${team.tpPct}%`,
    });
  }
  if ((team.tov ?? 0) >= TOV_HIGH) {
    flags.push({
      id: "turnovers", en: "Turnover-prone — pressure the ball and they will give it away.",
      is: "Tapa boltanum oft — pressaðu boltann og þeir gefa hann.",
      evidence: `${team.tov} turnovers/g`,
    });
  }
  if ((team.oreb ?? 0) >= OREB_HIGH) {
    flags.push({
      id: "oreb", en: "Strong on the offensive glass — box out and end possessions.",
      is: "Sterkir í sóknarfráköstum — lokaðu af og kláraðu sóknir.",
      evidence: `${team.oreb} offensive rebounds/g`,
    });
  }
  const shooters = ps.filter((p) => p.tags.includes("three_point_threat")).slice(0, 3);
  if (shooters.length) {
    flags.push({
      id: "shooters", en: `Track their shooters off the ball: ${shooters.map((s) => s.name).join(", ")}.`,
      is: `Fylgdu skyttunum án bolta: ${shooters.map((s) => s.name).join(", ")}.`,
      evidence: shooters.map((s) => `${s.name} ${s.tpPct}% on ${s.tpaPg}/g`).join(" · "),
    });
  }
  return flags;
}

export function buildBasketballOpponentReport(opponentName: string, rows: OppPlayerGame[]): BasketballOpponentReport {
  const gameIds = new Set(rows.map((r) => r.gameId));
  const { profile, teamPpg } = teamProfile(rows);
  const ps = players(rows, teamPpg);
  return {
    opponentName,
    games: gameIds.size,
    team: profile,
    players: ps,
    keyPlayers: ps.filter((p) => p.tags.includes("primary_scorer")).slice(0, 4),
    howToDefend: howToDefend(profile, ps),
  };
}
