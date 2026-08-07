/**
 * StatsBomb IQ "Team Stats" league export parser — pure, no IO.
 *
 * IQ exports a team's season aggregates split into category files (shooting,
 * set-pieces, passing, defensive-pressing, obv, summary, all-metrics). Every file
 * has exactly two rows keyed on `Team Name`: **`League Average`** and the team — so
 * benchmarking is built in. This parser takes any set of those category matrices,
 * merges the columns per team into one season profile, and returns both the teams
 * and the league-average reference.
 *
 * Output is provider-agnostic (`metrics`, keys aligned to the scouting engine's
 * Metrics) plus a `sb` bag of StatsBomb-only extras (OBV, set-piece for & against,
 * npxG, pressing). Descriptive context only — never touches the readiness colour.
 * StatsBomb has no possession%/defensive-duels — possession is proxied from
 * Passes/(Passes+Passes Conceded) and clearly labelled; PPDA IS present here.
 */

import { normTeam } from "./wyscoutTeamStats";

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim().replace("%", "");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** StatsBomb column → flat internal key. Percent-like columns are marked with `pct`. */
const RENAME: Record<string, string> = {
  // summary
  "Games": "games", "Goals": "gf", "Goals Conceded": "ga",
  "Non Penalty xG": "npxg", "Non Penalty xG Faced": "npxgAgainst", "Non Penalty xG Difference": "npxgDiff",
  "Non Penalty xG/Shot": "npxgPerShot", "Open Play xG": "openPlayXg", "Open Play xG Faced": "openPlayXgFaced",
  "Goal Difference": "goalDiff",
  // defensive-pressing
  "PPDA": "ppda", "Defensive Distance": "defensiveDistance", "Aggression": "aggression",
  "Aggressive Actions": "aggressiveActions", "Defensive Regains": "defensiveRegains",
  // set-pieces
  "Set Piece Goals": "setPieceGoals", "Set Piece Goals Conceded": "setPieceGoalsAgainst",
  "Set Piece xG": "setPieceXg", "Set Piece xG Faced": "setPieceXgAgainst",
  "Set Piece Shots": "setPieceShots", "Set Piece Shots Faced": "setPieceShotsAgainst",
  // obv
  "OBV": "obv", "OBV Conceded": "obvAgainst", "Pass OBV": "passObv", "Opposition Pass OBV": "oppPassObv",
  "Dribble & Carry OBV": "carryObv", "Dribble & Carry OBV Conceded": "carryObvConceded",
  "Defensive Action OBV": "defActionObv", "Shot OBV": "shotObv", "Shot OBV Faced": "shotObvFaced", "Goalkeeper OBV": "gkObv",
  // shooting
  "Non Penalty Shots": "shots", "Non Penalty Shots Faced": "shotsAgainst",
  "Shot Distance": "shotDistance", "Shot Distance Faced": "shotDistanceFaced",
  "Counter Attack Shots": "counterAttackShots", "High Press Shots Conceded": "highPressShotsConceded",
  "Open Play Shots Faced": "openPlayShotsFaced",
  // passing
  "Passing%": "passingPct", "Passes Inside Box": "passesInsideBox", "Passes Inside Box Conceded": "passesInsideBoxAgainst",
  "Deep Completions": "deepCompletions", "Opposition Deep Completions": "deepCompletionsAgainst",
  "Box Crosses": "boxCrosses", "Successful Box Cross%": "boxCrossPct",
  "GK Long Ball%": "gkLongBallPct", "GK Pass Length": "gkPassLength", "Passes": "passes", "Passes Conceded": "passesAgainst",
};

export type SbTeamSeason = {
  name: string; isLeagueAverage: boolean; games: number | null;
  /** provider-agnostic (keys align with the scouting engine's Metrics). */
  metrics: {
    xgf: number | null; xga: number | null; gf: number | null; ga: number | null;
    shots: number | null; shotsAgainst: number | null; possession: number | null; ppda: number | null;
    crosses: number | null; crossAccPct: number | null; passesFinalThird: number | null; passingPct: number | null;
  };
  possessionIsProxy: boolean;
  /** StatsBomb-only extras kept verbatim (flat internal keys). */
  sb: Record<string, number | null>;
};

export type SbLeagueParse = { teams: SbTeamSeason[]; leagueAverage: SbTeamSeason | null; categories: number; unknownColumns: string[] };

function buildSeason(name: string, values: Record<string, number | null>): SbTeamSeason {
  const passes = values.passes, passesAg = values.passesAgainst;
  const possession = passes != null && passesAg != null && passes + passesAg > 0 ? Math.round((passes / (passes + passesAg)) * 1000) / 10 : null;
  return {
    name, isLeagueAverage: normTeam(name) === normTeam("League Average"), games: values.games ?? null,
    metrics: {
      xgf: values.npxg ?? null, xga: values.npxgAgainst ?? null, gf: values.gf ?? null, ga: values.ga ?? null,
      shots: values.shots ?? null, shotsAgainst: values.shotsAgainst ?? null, possession, ppda: values.ppda ?? null,
      crosses: values.boxCrosses ?? null, crossAccPct: values.boxCrossPct ?? null,
      passesFinalThird: values.deepCompletions ?? null, passingPct: values.passingPct ?? null,
    },
    possessionIsProxy: possession != null,
    sb: values,
  };
}

/** Merge category matrices into per-team season profiles + the league-average row. */
export function parseStatsbombLeagueTeam(files: Array<{ matrix: string[][] }>): SbLeagueParse {
  const byTeam = new Map<string, { name: string; values: Record<string, number | null> }>();
  const unknown = new Set<string>();
  let categories = 0;

  for (const { matrix } of files) {
    if (!matrix.length) continue;
    const header = matrix[0].map((h) => String(h ?? "").replace(/\uFEFF/g, "").trim());
    const nameIdx = header.findIndex((h) => h === "Team Name");
    if (nameIdx < 0) continue;
    categories++;
    for (const row of matrix.slice(1)) {
      const name = String(row[nameIdx] ?? "").trim();
      if (!name) continue;
      const key = normTeam(name);
      const entry = byTeam.get(key) ?? { name, values: {} };
      header.forEach((h, i) => {
        if (h === "Team Name" || h === "Home Fixtures" || h === "Away Fixtures") return;
        const mapped = RENAME[h];
        if (!mapped) { if (String(row[i] ?? "").trim() !== "") unknown.add(h); return; }
        const v = num(row[i]);
        if (v != null) entry.values[mapped] = v;
      });
      byTeam.set(key, entry);
    }
  }

  const seasons = [...byTeam.values()].map((e) => buildSeason(e.name, e.values));
  return {
    teams: seasons.filter((s) => !s.isLeagueAverage),
    leagueAverage: seasons.find((s) => s.isLeagueAverage) ?? null,
    categories,
    unknownColumns: [...unknown],
  };
}
