/**
 * Basketball Opponent Scouting report — a detailed read of an opponent from their
 * OWN full-season box scores (pulled free from the KKÍ widget or uploaded from Instat).
 *
 * Pure, IO-free. Produces a team season profile, a per-player threat breakdown, and
 * rule-based "how to defend them" flags — each citing the numbers that fired it.
 * Descriptive scouting context only: it never touches the readiness colour, load, or the
 * daily decision. Rules compute everything; any AI layer only phrases it.
 */

import { shotLabel, type Lang } from "./basketballStats/shotLabels";

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
  // Richer season tendencies (InStat season export only; null for the KKÍ box path).
  season?: SeasonTendencies | null;
};

export type DefenseShot = { key: string; made: number; att: number };
export type SeasonTendencies = {
  usagePct: number | null; plusMinus: number | null;
  driveRightShare: number | null; drivesPg: number | null;
  ftaPg?: number | null; tpaPg?: number | null;
  offenseMix?: DefenseShot[];   // this player's own shot mix (attempts/g) — rim-vs-jumper read
  oppFgPctAllowed: number | null; oppFgaPg: number | null;
  defense?: DefenseShot[];      // opponents' shot mix against this player
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

// ── Pre-aggregated season input (InStat season export) ───────────────────────
// The KKÍ pull gives raw per-player-per-game rows that `buildBasketballOpponentReport`
// aggregates. An InStat season export is ALREADY aggregated (per-player season
// averages + a team game log), so this second entry builds the SAME report shape from
// those averages — reusing the identical tag thresholds, `describePlayer` and
// `howToDefend` so both sources read the same. No per-game points series / game log
// exists in the averages, so those are empty (the shooting split + tags carry it).

export type SeasonPlayerInput = {
  name: string; ref: string; games: number;
  mpg: number | null; ppg: number | null; rpg: number | null; apg: number | null;
  fgPct: number | null; tpPct: number | null; tpaPg: number | null;
  spg: number | null; bpg: number | null; topg: number | null;
  twoPct: number | null; twoPaPg: number | null; threePct: number | null; threePaPg: number | null;
  ftPct: number | null; ftaPg: number | null;
  tendencies?: SeasonTendencies | null;
};

function seasonPlayer(p: SeasonPlayerInput, teamPpg: number): OppPlayer {
  const scoreShare = teamPpg > 0 && p.ppg != null ? Math.round((p.ppg / teamPpg) * 100) / 100 : null;
  const tags: string[] = [];
  if ((scoreShare ?? 0) >= SCORER_SHARE || (p.ppg ?? 0) >= P_SCORER_PPG) tags.push("primary_scorer");
  if ((p.tpaPg ?? 0) >= P_SHOOTER_TPA && (p.tpPct ?? 0) >= P_SHOOTER_PCT) tags.push("three_point_threat");
  if ((p.apg ?? 0) >= P_PLAYMAKER_APG) tags.push("playmaker");
  if ((p.rpg ?? 0) >= P_GLASS_RPG) tags.push("glass");
  const base = {
    name: p.name, ref: p.ref, games: p.games,
    mpg: p.mpg, ppg: p.ppg, rpg: p.rpg, apg: p.apg, fgPct: p.fgPct, tpPct: p.tpPct, tpaPg: p.tpaPg,
    spg: p.spg, bpg: p.bpg, topg: p.topg, scoreShare, tags,
  };
  return {
    ...base,
    descriptor: describePlayer(base),
    shooting: {
      twoPct: p.twoPct, twoPaPg: p.twoPaPg, threePct: p.threePct, threePaPg: p.threePaPg,
      ftPct: p.ftPct, ftaPg: p.ftaPg, ptsSeries: [],
    },
    recentGames: [],
    season: p.tendencies ?? null,
  };
}

/** Build the opponent report from a pre-aggregated InStat season (team profile +
 *  per-player season averages). Mirrors `buildBasketballOpponentReport` output so the
 *  same UI/PDF/AI consume it. Players below MIN_PLAYER_GAMES are dropped, as in the
 *  per-game path. */
export function buildOpponentReportFromSeason(
  opponentName: string,
  team: OppTeamProfile,
  playersIn: SeasonPlayerInput[],
): BasketballOpponentReport {
  const teamPpg = team.ppg ?? 0;
  const ps = playersIn
    .filter((p) => p.games >= MIN_PLAYER_GAMES)
    .map((p) => seasonPlayer(p, teamPpg))
    .sort((a, b) => (b.ppg ?? 0) - (a.ppg ?? 0));
  return {
    opponentName,
    games: team.games,
    team,
    players: ps,
    keyPlayers: ps.filter((p) => p.tags.includes("primary_scorer")).slice(0, 4),
    howToDefend: howToDefend(team, ps),
  };
}

// ── Plain-language player tendencies (explainability L1) ─────────────────────
// Turn the raw InStat season tendencies (usage %, on-court +/-, drive direction, and
// the defensive shot mix) into short plain sentences a non-S&C coach reads at a glance
// — the number stays in parentheses so the raw value is never hidden. Rule-based and
// bilingual; shared by the on-screen modal and the PDF so both read identically.

const r1t = (v: number) => Math.round(v * 10) / 10;
const makePct = (d: DefenseShot): number | null => (d.att > 0 ? Math.round((d.made / d.att) * 1000) / 10 : null);

export function playerTendencyNotes(p: OppPlayer, lang: Lang): { offense: string[]; defense: string[] } {
  const s = p.season;
  const offense: string[] = [];
  const defense: string[] = [];
  if (!s) return { offense, defense };
  const isIS = lang === "IS";

  if (s.usagePct != null) {
    const u = Math.round(s.usagePct);
    if (s.usagePct >= 28) offense.push(isIS ? `Dríf sóknarinnar — fer með boltann í ~${u}% af sóknum liðsins` : `Carries the offense — ends ~${u}% of the team's possessions`);
    else if (s.usagePct >= 22) offense.push(isIS ? `Mikið í sókninni (${u}% notkun)` : `Heavily involved (${u}% usage)`);
    else if (s.usagePct >= 14) offense.push(isIS ? `Fast sóknarhlutverk (${u}% notkun)` : `Steady role (${u}% usage)`);
    else offense.push(isIS ? `Lítið með boltann (${u}% notkun)` : `Low-usage role player (${u}% usage)`);
  }

  if (s.plusMinus != null) {
    const v = r1t(Math.abs(s.plusMinus));
    if (s.plusMinus > 0) offense.push(isIS ? `Liðið skorar ${v} stigum meira en það fær á sig með viðkomandi inná (per leik)` : `Team outscores opponents by ${v}/game with them on court`);
    else if (s.plusMinus < 0) offense.push(isIS ? `Liðinu gengur verr með viðkomandi inná (−${v} per leik)` : `Team is outscored by ${v}/game with them on court`);
  }

  // Scoring style — does the shot get to the rim or settle for a jumper, and is it
  // self-created or off the ball. Derived from the player's own playtype mix + FTA/3PA.
  const mix = Array.isArray(s.offenseMix) ? s.offenseMix : [];
  const att = (k: string) => mix.find((m) => m.key === k)?.att ?? 0;
  const drives = s.drivesPg ?? att("drive");
  const fta = s.ftaPg ?? 0;
  const tpa = s.tpaPg ?? 0;
  const created = att("iso") + att("pnrHandler") + drives;
  const offBall = att("catchShoot") + att("screenOff") + att("cut") + att("handOff");
  if (drives >= 4 || fta >= 4.5) {
    const en: string[] = [], is: string[] = [];
    if (drives >= 1) { en.push(`${r1t(drives)} drives/g`); is.push(`${r1t(drives)} drif/leik`); }
    if (fta >= 1) { en.push(`gets to the line (${r1t(fta)} FTA/g)`); is.push(`sækir vítalínuna (${r1t(fta)} vítatilr./leik)`); }
    offense.push(isIS ? `Fer alla leið að körfunni — ${is.join(" og ")}` : `Attacks the rim — ${en.join(" and ")}`);
  } else if (tpa >= 3.5 && att("catchShoot") >= Math.max(att("iso"), att("pnrHandler"), drives)) {
    offense.push(isIS
      ? `Stökkskytta — grípur og skýtur frekar en að fara að körfunni (${r1t(tpa)} þristatilr./leik)`
      : `Spot-up shooter — settles for the jumper rather than driving (${r1t(tpa)} 3PA/g)`);
  } else if (created > 0 && created >= offBall * 1.3) {
    offense.push(isIS ? `Býr til eigin skot (einn-á-einn / skýlingar)` : `Creates his own shot (iso / pick-and-roll)`);
  } else if (offBall > 0 && offBall >= created * 1.3) {
    offense.push(isIS ? `Skorar án bolta (spot-up, skýlingar, skurðir)` : `Scores off the ball (spot-ups, screens, cuts)`);
  }

  if (s.driveRightShare != null && (s.drivesPg ?? 0) >= 1) {
    const share = Math.round(s.driveRightShare);
    if (s.driveRightShare >= 65) offense.push(isIS ? `Drífur nær alltaf til hægri (${share}%) — bjóddu vinstri hönd` : `Almost always drives right (${share}%) — force left`);
    else if (s.driveRightShare >= 58) offense.push(isIS ? `Hallar á hægri drif (${share}%)` : `Prefers driving right (${share}%)`);
    else if (s.driveRightShare <= 35) offense.push(isIS ? `Drífur nær alltaf til vinstri (${100 - share}%) — bjóddu hægri hönd` : `Almost always drives left (${100 - share}%) — force right`);
    else if (s.driveRightShare <= 42) offense.push(isIS ? `Hallar á vinstri drif (${100 - share}%)` : `Prefers driving left (${100 - share}%)`);
    else offense.push(isIS ? `Drífur báðum megin (${share}% hægri)` : `Drives both ways (${share}% right)`);
  }

  if (s.oppFgPctAllowed != null) {
    const vol = s.oppFgaPg != null ? (isIS ? ` á ${r1t(s.oppFgaPg)} skot/leik` : ` on ${r1t(s.oppFgaPg)} shots/g`) : "";
    defense.push(isIS ? `Andstæðingar skjóta ${r1t(s.oppFgPctAllowed)}% þegar viðkomandi ver${vol}` : `Opponents shoot ${r1t(s.oppFgPctAllowed)}% with them defending${vol}`);
  }
  const defMix = Array.isArray(s.defense) ? s.defense : [];
  const attacked = defMix.filter((d) => d.att >= 1)[0] ?? defMix[0];
  if (attacked) {
    const mp = makePct(attacked);
    defense.push(isIS
      ? `Sóttur mest með ${shotLabel(attacked.key, lang)} (${r1t(attacked.att)}/leik${mp != null ? `, andst. ${mp}%` : ""})`
      : `Attacked most off ${shotLabel(attacked.key, lang)} (${r1t(attacked.att)}/g${mp != null ? `, opp ${mp}%` : ""})`);
  }
  // Weak spot: the most-made action opponents get (with a little volume), if it isn't the
  // one already named and they actually score on it.
  const weak = [...defMix]
    .filter((d) => d.att >= 0.8 && d.key !== attacked?.key && (makePct(d) ?? 0) >= 50)
    .sort((a, b) => (makePct(b) ?? 0) - (makePct(a) ?? 0))[0];
  if (weak) {
    const mp = makePct(weak);
    defense.push(isIS
      ? `Gefur eftir í ${shotLabel(weak.key, lang)} (andst. ${mp}% á ${r1t(weak.att)}/leik)`
      : `Concedes ${shotLabel(weak.key, lang)} (opp ${mp}% on ${r1t(weak.att)}/g)`);
  }

  return { offense, defense };
}

// ── Where-to-attack board ────────────────────────────────────────────────────
// For each FG-playtype, the opponent's WEAKEST defender — the player who concedes the
// highest shooting% on that action (with enough volume to be real). Reads the per-player
// defensive shot mix (season.defense). Ranked by how exploitable the action is (highest
// conceded % first), so the coach reads the best attack off the top. InStat season only.

export type AttackTarget = { key: string; defender: string; oppPct: number; att: number };

const ATTACK_MIN_ATT = 1; // per-game shots against this defender needed to count

export function buildAttackBoard(players: OppPlayer[]): AttackTarget[] {
  const byAction = new Map<string, AttackTarget>();
  for (const p of players) {
    const def = p.season?.defense;
    if (!Array.isArray(def)) continue;
    for (const d of def) {
      if (d.att < ATTACK_MIN_ATT) continue;
      const mp = makePct(d);
      if (mp == null) continue;
      const cur = byAction.get(d.key);
      // Weakest = highest conceded %; tie-break on volume (more shots = more reliable).
      if (!cur || mp > cur.oppPct || (mp === cur.oppPct && d.att > cur.att)) {
        byAction.set(d.key, { key: d.key, defender: p.name, oppPct: mp, att: r1t(d.att) });
      }
    }
  }
  return [...byAction.values()].sort((a, b) => b.oppPct - a.oppPct);
}
