/**
 * smartDetect — classify ANY StatsBomb or Wyscout export from its header row alone,
 * so one "Smart Import" box can route a dropped file to the right ingester instead of
 * the coach guessing which of several upload boxes a file belongs in.
 *
 * Pure, no IO. Mirrors the header guards already used across the individual upload
 * routes (player-stats, team-match-stats, sb-match-summary, match-report, scouting) so
 * the classification and those routes never disagree. Descriptive football data only —
 * detection never touches the readiness colour.
 */

export type StatsKind =
  | "sb_squad_season" // per-player season aggregates (Squad / Player Stats export) → player_season_stats
  | "sb_player_match" // one file per player, one row per match → player_match_stats
  | "sb_match_report_squad" // one game, Team + Player rows (whole squad) → player_match_stats + team recap
  | "sb_team_match_single" // one game, team totals summary (one row per team) → sb_team_match_stats
  | "sb_team_match_season" // every fixture, one row per team per game → sb_team_match_stats
  | "sb_team_season" // Team Stats + League Average (season) → scouting / own-team season
  | "wyscout_player" // Wyscout player list (season) → player_season_stats
  | "wyscout_team" // Wyscout team stats (per match / season) → team_match_stats
  | "unknown";

export type Detection = {
  provider: "statsbomb" | "wyscout" | "unknown";
  kind: StatsKind;
  /** Plain-language name for the coach. */
  label: string;
  /** Can the Smart Import box import this itself, or does it need a dedicated flow? */
  autoImport: boolean;
  /** Where per-player rows land (for the coach's confidence). */
  target: string;
  /** If not autoImport, why / where to go instead. */
  routeHint?: string;
};

const clean = (s: unknown) => String(s ?? "").replace(/﻿/g, "").trim();

export function detectStatsFile(headersRaw: string[]): Detection {
  const H = headersRaw.map(clean);
  const has = (c: string) => H.some((h) => h.toLowerCase() === c.toLowerCase());
  const hasAny = (...cs: string[]) => cs.some((c) => has(c));

  // StatsBomb "tells" — columns Wyscout never has.
  const sbTell = hasAny("OBV", "Non Penalty xG", "Player SBD ID", "Set Piece xG", "xGChain", "Pass OBV");
  const hasPlayerName = has("Player") || has("Name") || (has("First Name") && has("Last Name"));
  const isMatchFile = has("Match") || has("Date");
  const teamMatchMarker = hasAny("Opposition Passes", "Opposition xG");

  // ── StatsBomb ────────────────────────────────────────────────────────────
  if (sbTell || has("Team Name") || has("Team name")) {
    // Season Team Stats (with League Average rows) — one row per team, season totals.
    if (has("Team Name") && sbTell && !isMatchFile) {
      return { provider: "statsbomb", kind: "sb_team_season", label: "StatsBomb Team Stats (season)", autoImport: false, target: "team season / scouting", routeHint: "Use Opponent Scouting (or the Team season report) — this is a whole-season team profile, not a per-player or per-match file." };
    }
    // Per-match TEAM totals across every fixture (one row per team per game).
    if (isMatchFile && !hasPlayerName && teamMatchMarker) {
      return { provider: "statsbomb", kind: "sb_team_match_season", label: "StatsBomb Match Stats (every fixture, team totals)", autoImport: false, target: "sb_team_match_stats (season)", routeHint: "Use Season Match Analysis → 'Import StatsBomb stats' — it maps each fixture's team rows to your schedule." };
    }
    // One player, one file, one row per match.
    if (isMatchFile && !hasPlayerName && !has("Team Name") && sbTell) {
      return { provider: "statsbomb", kind: "sb_player_match", label: "StatsBomb per-player Match Stats (one player)", autoImport: false, target: "player_match_stats", routeHint: "Use Single Match Analysis → 'One player' — it needs you to pick which player the file belongs to." };
    }
    // One game, whole squad (Team + Player rows) — needs the name-mapping review step.
    if (hasPlayerName && isMatchFile && sbTell) {
      return { provider: "statsbomb", kind: "sb_match_report_squad", label: "StatsBomb single-match squad (one game)", autoImport: false, target: "player_match_stats + team recap", routeHint: "Use Single Match Analysis → 'One match — whole squad' — it opens a name-mapping review before import." };
    }
    // One game, team summary (one row per team: Goals/xG/Possession…), no Match column.
    if ((has("Team name") || has("Team Name")) && hasAny("Possession %", "Pass Completion %") && !isMatchFile && !hasPlayerName) {
      return { provider: "statsbomb", kind: "sb_team_match_single", label: "StatsBomb single-match team totals", autoImport: false, target: "sb_team_match_stats (one game)", routeHint: "Use Single Match Analysis → 'One match — team totals' — it needs the match date." };
    }
    // Per-player SEASON aggregates (Squad / Player Stats export) — the common case.
    if (hasPlayerName && sbTell && !isMatchFile) {
      return { provider: "statsbomb", kind: "sb_squad_season", label: "StatsBomb Squad / Player Stats (season, per-90)", autoImport: true, target: "player_season_stats" };
    }
  }

  // ── Wyscout ──────────────────────────────────────────────────────────────
  // Wyscout player list: "Player" + "Team" + "Minutes played" (space), no SB tell.
  if (!sbTell && has("Player") && has("Team") && hasAny("Minutes played", "Accurate passes, %")) {
    return { provider: "wyscout", kind: "wyscout_player", label: "Wyscout player list (season)", autoImport: true, target: "player_season_stats" };
  }
  // Wyscout team stats: "Match" / "Date" + Wyscout team markers, no player identity.
  if (!sbTell && isMatchFile && !hasPlayerName && hasAny("Total shots", "PPDA", "Positional attacks")) {
    return { provider: "wyscout", kind: "wyscout_team", label: "Wyscout team stats", autoImport: false, target: "team_match_stats", routeHint: "Use Season Match Analysis (Wyscout) — it maps team rows to your fixtures." };
  }

  return { provider: "unknown", kind: "unknown", label: "Unrecognized file", autoImport: false, target: "—", routeHint: "This doesn't look like a StatsBomb or Wyscout export. Check you exported a CSV/XLSX from StatsBomb IQ or Wyscout." };
}
