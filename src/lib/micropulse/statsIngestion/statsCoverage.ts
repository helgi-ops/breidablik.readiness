/**
 * statsCoverage — for a detected file, report which columns are PRESENT (what we'll
 * fill) and which known columns are MISSING (features that stay blank). This is the
 * "the system tells you what's not in your file" half of Smart Import.
 *
 * Pure, no IO. `present` is every real column in the file; `missing` is the catalog
 * for that file kind minus what the file has (alias-aware, so "Name" doesn't read as
 * a missing "Player"). `lostFeatures` flags the high-value gaps in plain language.
 * Descriptive football data only — never touches the readiness colour.
 */

import type { StatsKind } from "./smartDetect";

const clean = (s: unknown) => String(s ?? "").replace(/﻿/g, "").trim();
const norm = (s: string) => clean(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/** A catalog entry: canonical name + accepted aliases (any present ⇒ column present). */
type Cat = { name: string; aliases?: string[] };

// StatsBomb per-player season (Squad / Player Stats). Empty Iceland-360 families are
// intentionally excluded — they carry no data here, so their absence isn't a loss.
const SB_PLAYER_CAT: Cat[] = [
  { name: "Minutes" },
  { name: "Goals & Penalty Goals", aliases: ["Goals & Pen Goals", "Goals"] },
  { name: "Non Penalty Goals" }, { name: "Non Penalty xG" }, { name: "Non Penalty xG/Shot" },
  { name: "Non Penalty Shots" }, { name: "Shooting%" }, { name: "Goal Conversion%", aliases: ["Goal Conv%"] },
  { name: "Assists" }, { name: "xG Assisted" }, { name: "Key Passes" }, { name: "Open Play xG Assisted" },
  { name: "Passing%" }, { name: "Open Play Passes" }, { name: "Long Ball%" }, { name: "Deep Progressions" },
  { name: "xGBuildup" }, { name: "xGChain" }, { name: "Carries" }, { name: "Carry%" },
  { name: "Passes Into Box" }, { name: "Touches In Box" }, { name: "Through Balls" }, { name: "Crossing%" },
  { name: "Dribbles" }, { name: "Successful Dribbles" }, { name: "Dribble%" },
  { name: "Tackles" }, { name: "Tack&Int" }, { name: "Interceptions" }, { name: "PAdj Tackles" },
  { name: "Ball Recoveries" }, { name: "Aerial Win%" }, { name: "Aerial Wins" }, { name: "Blocks/Shot" },
  { name: "Pressures" }, { name: "PAdj Pressures" }, { name: "Pressure Regains" }, { name: "Counterpressures" },
  { name: "OBV" }, { name: "Pass OBV" }, { name: "Dribble & Carry OBV" }, { name: "Defensive Action OBV" }, { name: "Shot OBV" },
  { name: "Player SBD ID" },
];

// StatsBomb team-match (every fixture / one game) — matches the parser's OWN + AGAINST set.
const SB_TEAM_MATCH_CAT: Cat[] = [
  { name: "Goals" }, { name: "xG" }, { name: "xG/Shot" }, { name: "Open Play xG" }, { name: "Shots" },
  { name: "Passes" }, { name: "Passing%" }, { name: "Passes Into Box" }, { name: "Deep Progressions" },
  { name: "Crosses" }, { name: "Touches in box" }, { name: "Long Ball%" },
  { name: "OBV" }, { name: "Pass OBV" }, { name: "Shot OBV" }, { name: "Dribble & Carry OBV" }, { name: "Defensive Action OBV" },
  { name: "Pressures" }, { name: "Counterpressures" }, { name: "Pressures in Opposing Half%" }, { name: "Aggression" },
  { name: "Set Piece xG" }, { name: "Set Piece Goals" }, { name: "Set Piece Shots" },
  { name: "xG/Corner" }, { name: "Corner xG" }, { name: "Goals From Corners" },
  { name: "Goalkeeper Long Ball%" }, { name: "Goalkeeper Pass Length" }, { name: "Yellow Cards" }, { name: "Red Cards" },
  { name: "Goals Conceded" }, { name: "Opposition xG" }, { name: "Non Penalty Shots Faced" },
  { name: "Opposition OBV" }, { name: "Opposition Set Piece xG" }, { name: "Opposition Set Piece Goals" },
];

// Wyscout player list (season).
const WYSCOUT_PLAYER_CAT: Cat[] = [
  { name: "Minutes played" }, { name: "Goals" }, { name: "Assists" }, { name: "xG" }, { name: "Shots" },
  { name: "Shots on target, %" }, { name: "Accurate passes, %" }, { name: "Key passes" }, { name: "Passes" },
  { name: "Duels won, %" }, { name: "Interceptions" }, { name: "Successful dribbles, %" }, { name: "Aerial duels won, %" },
];

const CATALOG: Partial<Record<StatsKind, Cat[]>> = {
  sb_squad_season: SB_PLAYER_CAT,
  sb_team_match_season: SB_TEAM_MATCH_CAT,
  sb_team_match_single: SB_TEAM_MATCH_CAT,
  sb_match_report_squad: SB_PLAYER_CAT,
  wyscout_player: WYSCOUT_PLAYER_CAT,
};

// High-value columns → the feature that goes blank without them (plain language).
const LOST_FEATURE: Record<string, string> = {
  "OBV": "OBV read (on-ball value) — the value-of-actions column stays blank",
  "Set Piece xG": "set-piece xG for/against — the set-piece read stays blank",
  "Opposition Set Piece xG": "set-piece xG conceded — the against-side set-piece read stays blank",
  "xGChain": "build-up involvement (xGChain) — the build-up narrative is thinner",
  "xGBuildup": "build-up value (xGBuildup) — the build-up narrative is thinner",
  "Pressures": "pressing volume — the out-of-possession read stays blank",
  "xG Assisted": "chance creation (xG assisted) — the creativity percentile is missing",
  "Non Penalty xG": "shot quality (npxG) — the finishing/threat read stays blank",
};

// Index/identity columns that are never a "missing feature".
const IGNORE = new Set(["team", "name", "player", "first name", "last name", "team name", "team name ", "position", "id"].map(norm));

export type Coverage = {
  present: string[];
  missing: string[];
  lostFeatures: { column: string; note: string }[];
  presentCount: number;
  catalogCount: number;
};

export function computeCoverage(kind: StatsKind, headersRaw: string[]): Coverage {
  const headers = headersRaw.map(clean).filter((h) => h !== "");
  const fileNorms = new Set(headers.map(norm));

  // Present = the file's own real columns (minus pure index/blank), sorted.
  const present = headers.filter((h) => !IGNORE.has(norm(h))).sort((a, b) => a.localeCompare(b));

  const cat = CATALOG[kind] ?? [];
  const inFile = (c: Cat) => fileNorms.has(norm(c.name)) || (c.aliases ?? []).some((a) => fileNorms.has(norm(a)));
  const missing = cat.filter((c) => !inFile(c)).map((c) => c.name);
  const lostFeatures = missing
    .filter((m) => LOST_FEATURE[m])
    .map((m) => ({ column: m, note: LOST_FEATURE[m] }));

  return { present, missing, lostFeatures, presentCount: present.length, catalogCount: cat.length };
}
