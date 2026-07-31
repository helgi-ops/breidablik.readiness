/**
 * Sport dispatch for player-facing statistics.
 *
 * One entry point that picks the right catalog by sport, so every surface (the
 * player card, the coach page/modal, the AI summary) can be sport-aware without
 * knowing which catalog it's reading. Football lives in playerFootballStats
 * (canonical, unchanged); basketball in playerBasketballStats. Both emit the
 * exact same shapes, so callers stay identical across sports.
 *
 * Descriptive only — no catalog here touches the readiness colour or the daily
 * decision. Sport comes from resolveTeamSport() (team_settings.sport_type).
 */

import {
  pickPlayerFootballStats,
  seasonHeadline as footballHeadline,
  statIdsForPosition as footballStatIds,
  positionFamily as footballFamily,
  PROFILE_METRIC_KEYS as FOOTBALL_PROFILE_KEYS,
  type FootballStatInput,
  type PlayerFootballStat,
} from "../playerFootballStats";
import {
  pickBasketballStats,
  basketballSeasonHeadline,
  basketballStatIdsForPosition,
  basketballPositionFamily,
  BASKETBALL_PROFILE_METRIC_KEYS,
} from "../playerBasketballStats";

export type Sport = "football" | "basketball";

// Shared shapes (identical across sports).
export type SportStatInput = FootballStatInput;
export type PlayerSportStat = PlayerFootballStat;
export type SportHeadline = { primary: string; secondary: string | null };

function isBasketball(sport: Sport | string | null | undefined): boolean {
  return String(sport ?? "").toLowerCase() === "basketball";
}

/** The curated, position-aware, formatted, localized stat list for the sport. */
export function pickPlayerStats(
  sport: Sport | string | null | undefined,
  input: SportStatInput,
  position: string | null | undefined,
  lang: "EN" | "IS",
): PlayerSportStat[] {
  return isBasketball(sport)
    ? pickBasketballStats(input, position, lang)
    : pickPlayerFootballStats(input, position, lang);
}

/** The plain, positive season headline (Layer 0) for the sport. */
export function seasonHeadline(
  sport: Sport | string | null | undefined,
  input: SportStatInput,
  position: string | null | undefined,
  lang: "EN" | "IS",
): SportHeadline {
  return isBasketball(sport)
    ? basketballSeasonHeadline(input, position, lang)
    : footballHeadline(input, position, lang);
}

/** The ordered stat ids a given position should see, for the sport. */
export function statIdsForPosition(
  sport: Sport | string | null | undefined,
  position: string | null | undefined,
): string[] {
  return isBasketball(sport)
    ? basketballStatIdsForPosition(position)
    : footballStatIds(position);
}

/** The position family label (sport-specific taxonomy), as a plain string. */
export function sportPositionFamily(
  sport: Sport | string | null | undefined,
  position: string | null | undefined,
): string {
  return isBasketball(sport) ? basketballPositionFamily(position) : footballFamily(position);
}

/** Profile/bio metric keys to strip from the on-court/on-pitch "all stats" view. */
export function sportProfileMetricKeys(sport: Sport | string | null | undefined): Set<string> {
  return isBasketball(sport) ? BASKETBALL_PROFILE_METRIC_KEYS : FOOTBALL_PROFILE_KEYS;
}
