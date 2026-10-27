/**
 * InStat (Hudl) basketball OPPONENT season export → scouting payload.
 *
 * The opponent-scouting feature already stores a full-season header per source and
 * builds a report from it; the KKÍ pull walks the free widget. This adapter is the
 * third source: the three InStat season tables a coach downloads for an opponent —
 *   • Games   → per-game TEAM box + FG playtypes (PnR, iso, cuts, posts up, drives…)
 *   • Players → per-player SEASON averages (scoring/shooting + usage + drive split)
 *   • Lineups → season 5-man units (+/−, minutes, shooting)
 * — parsed into one payload we persist on scout_basketball_season.payload (source
 * 'instat'). `buildInstatOpponentScout` turns the payload into the SAME report shape
 * the KKÍ path produces (via buildOpponentReportFromSeason) plus the playtype /
 * lineup extras this richer feed carries. Pure (no IO). Purely descriptive — never
 * touches the readiness colour, load, or the daily decision.
 */

import { num, mmddToIso } from "./statsInstatGamesCsv";
import { minutesToNumber } from "./statsInstatPlayersCsv";
import { parseInstatLineups, type ParsedLineup } from "./statsInstatLineupsCsv";
import { aggregateAdvancedShots, type ShotTypeAgg } from "./instatAggregate";
import {
  buildOpponentReportFromSeason,
  type BasketballOpponentReport,
  type OppTeamProfile,
  type SeasonPlayerInput,
} from "../basketballOpponentReport";

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function cell(row: Record<string, unknown>, aliases: string[]): unknown {
  const wanted = new Set(aliases.map(norm));
  for (const [k, v] of Object.entries(row)) if (wanted.has(norm(k))) return v;
  return undefined;
}
const foldName = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** FG-playtype columns (made, attempted) → the shotLabels `pt_*` key. */
const PT_COLUMNS: Record<string, [string, string]> = {
  transition: ["Transitions made", "Transitions attempted"],
  catchShoot: ["Catch and shoot made", "Catch and shoot attempted"],
  catchDrive: ["Catch and drive made", "Catch and drive attempted"],
  screenOff: ["Screens off made", "Screens off attempted"],
  postUp: ["Posts up made", "Posts up attempted"],
  iso: ["Isolations made", "Isolations attempted"],
  handOff: ["Hand off made", "Hand off attempted"],
  cut: ["Cuts made", "Cuts attempted"],
  pnrHandler: ["PnR Handlers made", "PnR Handlers attempted"],
  pnrRoller: ["PnR Rollers made", "PnR Rollers attempted"],
  pnp: ["PnP made", "PnP attempted"],
  drive: ["Drives made", "Drives with shot"],
};
/** Contested vs uncontested FG → the shotLabels `eff_*` key. */
const EFF_COLUMNS: Record<string, [string, string]> = {
  uncontestedFg: ["Uncontested field goals made", "Uncontested field goals"],
  contestedFg: ["Contested field goals made", "Contested field goals"],
};

export type ScoutTeamGame = {
  date: string | null; opponent: string | null; homeAway: "home" | "away" | null;
  points: number | null; pointsAgainst: number | null; result: "W" | "L" | "D" | null;
  fgm: number | null; fga: number | null; tpm: number | null; tpa: number | null; ftm: number | null; fta: number | null;
  oreb: number | null; dreb: number | null; reb: number | null;
  assists: number | null; steals: number | null; turnovers: number | null; blocks: number | null;
  offRating: number | null; defRating: number | null; netRating: number | null; ppp: number | null;
  efgPct: number | null; tsPct: number | null;
  /** pt_<key>_m/a + eff_<key>_m/a — consumed by aggregateAdvancedShots. */
  advanced: Record<string, number>;
};

export type ScoutSeasonPlayer = {
  name: string; ref: string; jersey: string | null; games: number;
  mpg: number | null; ppg: number | null; rpg: number | null; apg: number | null;
  spg: number | null; bpg: number | null; topg: number | null;
  fgPct: number | null; tpPct: number | null; tpaPg: number | null;
  twoPct: number | null; twoPaPg: number | null; ftPct: number | null; ftaPg: number | null;
  usagePct: number | null; plusMinus: number | null;
  driveLeftPct: number | null; driveRightPct: number | null;
};

export type ScoutLineup = {
  members: string[]; minutes: number | null; plusMinus: number | null;
  possessions: number | null; points: number | null; fgPct: number | null; tpPct: number | null;
};

export type InstatOpponentPayload = {
  season: string;
  teamGames: ScoutTeamGame[];
  players: ScoutSeasonPlayer[];
  lineups: ScoutLineup[];
};

/** A real team-game row: has an opponent-or-score and isn't the "Average per game" row. */
function isGameRow(opp: string, score: string): boolean {
  const f = `${opp} ${score}`.toLowerCase();
  if (/average per game|averages?\b/.test(f)) return false;
  return opp.trim().length > 0 || /\d+\s*[:-]\s*\d+/.test(score);
}
function parseOpponent(raw: string): { homeAway: "home" | "away" | null; opponent: string | null } {
  const s = raw.trim();
  if (!s) return { homeAway: null, opponent: null };
  if (/^vs\b/i.test(s)) return { homeAway: "home", opponent: s.replace(/^vs\s*/i, "").trim() || null };
  if (/^@/.test(s)) return { homeAway: "away", opponent: s.replace(/^@\s*/, "").trim() || null };
  return { homeAway: null, opponent: s };
}
function parseScore(raw: string): { pf: number | null; pa: number | null } {
  const m = /^(\d+)\s*[:-]\s*(\d+)$/.exec(String(raw).trim());
  return m ? { pf: Number(m[1]), pa: Number(m[2]) } : { pf: null, pa: null };
}

/** Parse the InStat "Games" sheet → per-game team box + FG playtypes. */
export function parseScoutGames(rows: Record<string, unknown>[], season: string): ScoutTeamGame[] {
  const out: ScoutTeamGame[] = [];
  for (const row of rows) {
    const oppRaw = String(cell(row, ["Opponent"]) ?? "").trim();
    const scoreRaw = String(cell(row, ["Score"]) ?? "").trim();
    if (!isGameRow(oppRaw, scoreRaw)) continue;
    const { homeAway, opponent } = parseOpponent(oppRaw);
    const { pf, pa } = parseScore(scoreRaw);
    const points = num(cell(row, ["Points"]));
    const advanced: Record<string, number> = {};
    for (const [key, [mH, aH]] of Object.entries(PT_COLUMNS)) {
      const m = num(cell(row, [mH])), a = num(cell(row, [aH]));
      if (m != null) advanced[`pt_${key}_m`] = m;
      if (a != null) advanced[`pt_${key}_a`] = a;
    }
    for (const [key, [mH, aH]] of Object.entries(EFF_COLUMNS)) {
      const m = num(cell(row, [mH])), a = num(cell(row, [aH]));
      if (m != null) advanced[`eff_${key}_m`] = m;
      if (a != null) advanced[`eff_${key}_a`] = a;
    }
    out.push({
      date: mmddToIso(String(cell(row, ["Date"]) ?? ""), season),
      opponent, homeAway,
      points: points ?? pf, pointsAgainst: pa,
      result: pf == null || pa == null ? null : pf > pa ? "W" : pf < pa ? "L" : "D",
      fgm: num(cell(row, ["Field goals made"])), fga: num(cell(row, ["Field goals attempted"])),
      tpm: num(cell(row, ["3-pt field goals made"])), tpa: num(cell(row, ["3-pt field goals attempted"])),
      ftm: num(cell(row, ["Free throws made"])), fta: num(cell(row, ["Free throws attempted"])),
      oreb: num(cell(row, ["Offensive rebounds"])), dreb: num(cell(row, ["Defensive rebounds"])), reb: num(cell(row, ["Rebounds"])),
      assists: num(cell(row, ["Assists"])), steals: num(cell(row, ["Steals"])), turnovers: num(cell(row, ["Turnovers"])), blocks: num(cell(row, ["Blocks"])),
      offRating: num(cell(row, ["Offensive rating"])), defRating: num(cell(row, ["Defensive rating"])),
      netRating: num(cell(row, ["Net rating"])), ppp: num(cell(row, ["Points per possession"])),
      efgPct: num(cell(row, ["Effective field goal percentage"])), tsPct: num(cell(row, ["True shooting percentage"])),
      advanced,
    });
  }
  return out;
}

const isPlayerRow = (name: string): boolean => {
  const f = name.toLowerCase().trim();
  return f.length > 0 && !["total", "totals", "team", "opponent", "average", "averages", "average per game"].includes(f);
};

/** Parse the InStat "Players" sheet → per-player season averages + scouting tendencies. */
export function parseScoutPlayers(rows: Record<string, unknown>[]): ScoutSeasonPlayer[] {
  const out: ScoutSeasonPlayer[] = [];
  for (const row of rows) {
    const name = String(cell(row, ["Player"]) ?? "").trim();
    if (!isPlayerRow(name)) continue;
    const jerseyRaw = cell(row, ["Jersey number", "Jersey", "Number"]);
    out.push({
      name,
      ref: `instat:${foldName(name)}`,
      jersey: jerseyRaw == null || String(jerseyRaw).trim() === "" ? null : String(jerseyRaw).trim(),
      games: num(cell(row, ["Games played"])) ?? 0,
      mpg: minutesToNumber(cell(row, ["Minutes"])),
      ppg: num(cell(row, ["Points"])),
      rpg: num(cell(row, ["Rebounds"])),
      apg: num(cell(row, ["Assists"])),
      spg: num(cell(row, ["Steals"])),
      bpg: num(cell(row, ["Blocks"])),
      topg: num(cell(row, ["Turnovers"])),
      fgPct: num(cell(row, ["Field goals, %", "Field goals %"])),
      tpPct: num(cell(row, ["3-pt field goals, %", "3-pt field goals %"])),
      tpaPg: num(cell(row, ["3-pt field goals attempted"])),
      twoPct: num(cell(row, ["2-pt field goals, %", "2-pt field goals %"])),
      twoPaPg: num(cell(row, ["2-pt field goals attempted"])),
      ftPct: num(cell(row, ["Free throws, %", "Free throws %"])),
      ftaPg: num(cell(row, ["Free throws attempted"])),
      usagePct: num(cell(row, ["Usage Percentage"])),
      plusMinus: num(cell(row, ["Plus/Minus", "Plus Minus", "+/-"])),
      driveLeftPct: num(cell(row, ["Left drives made, %", "Left drives made %"])),
      driveRightPct: num(cell(row, ["Right drives made, %", "Right drives made %"])),
    });
  }
  return out;
}

/** Parse the InStat "Lineups" sheet → season 5-man units (reuses the own-team parser). */
export function parseScoutLineups(rows: Record<string, unknown>[]): ScoutLineup[] {
  const { lineups } = parseInstatLineups(rows);
  return lineups
    .map((l: ParsedLineup) => ({
      members: l.members.map((m) => (m.jersey ? `${m.jersey} ${m.name}` : m.name)),
      minutes: l.minutes, plusMinus: l.plusMinus, possessions: l.possessions,
      points: l.points, fgPct: l.fgPct, tpPct: l.tpPct,
    }))
    .sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0));
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const avg = (xs: number[]): number | null => (xs.length ? r1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const pct = (m: number, a: number): number | null => (a > 0 ? Math.round((m / a) * 1000) / 10 : null);

/** Team season profile from the per-game box (same shape/rounding as the KKÍ engine). */
export function teamProfileFromGames(games: ScoutTeamGame[]): OppTeamProfile {
  const home = games.filter((g) => g.homeAway === "home");
  const away = games.filter((g) => g.homeAway === "away");
  const sum = (gs: ScoutTeamGame[], f: (g: ScoutTeamGame) => number | null) => gs.reduce((a, g) => a + (f(g) ?? 0), 0);
  return {
    games: games.length,
    ppg: avg(games.map((g) => g.points ?? 0)),
    fgPct: pct(sum(games, (g) => g.fgm), sum(games, (g) => g.fga)),
    tpPct: pct(sum(games, (g) => g.tpm), sum(games, (g) => g.tpa)),
    ftPct: pct(sum(games, (g) => g.ftm), sum(games, (g) => g.fta)),
    tpaPg: avg(games.map((g) => g.tpa ?? 0)),
    reb: avg(games.map((g) => g.reb ?? 0)), oreb: avg(games.map((g) => g.oreb ?? 0)),
    ast: avg(games.map((g) => g.assists ?? 0)), tov: avg(games.map((g) => g.turnovers ?? 0)),
    stl: avg(games.map((g) => g.steals ?? 0)), blk: avg(games.map((g) => g.blocks ?? 0)),
    homePpg: avg(home.map((g) => g.points ?? 0)), awayPpg: avg(away.map((g) => g.points ?? 0)),
  };
}

export type InstatOpponentScout = {
  report: BasketballOpponentReport;
  playtypes: ShotTypeAgg[];   // team FG playtypes (how they score), ranked by volume
  efficiency: ShotTypeAgg[];  // contested vs uncontested FG
  lineups: ScoutLineup[];
};

/** Turn a stored InStat opponent payload into the scouting bundle the UI/PDF/AI read. */
export function buildInstatOpponentScout(opponentName: string, payload: InstatOpponentPayload): InstatOpponentScout {
  const team = teamProfileFromGames(payload.teamGames);
  const playersIn: SeasonPlayerInput[] = payload.players.map((p) => ({
    name: p.name, ref: p.ref, games: p.games,
    mpg: p.mpg, ppg: p.ppg, rpg: p.rpg, apg: p.apg, fgPct: p.fgPct, tpPct: p.tpPct, tpaPg: p.tpaPg,
    spg: p.spg, bpg: p.bpg, topg: p.topg,
    twoPct: p.twoPct, twoPaPg: p.twoPaPg, threePct: p.tpPct, threePaPg: p.tpaPg, ftPct: p.ftPct, ftaPg: p.ftaPg,
  }));
  const report = buildOpponentReportFromSeason(opponentName, team, playersIn);
  const advRows = payload.teamGames.map((g) => ({ advanced: g.advanced }));
  return {
    report,
    playtypes: aggregateAdvancedShots(advRows, "pt"),
    efficiency: aggregateAdvancedShots(advRows, "eff"),
    lineups: payload.lineups,
  };
}
