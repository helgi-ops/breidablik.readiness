/**
 * ELITE route gating map — the single source of truth for which coach routes
 * require an ELITE plan, shared by the central gate in CoachShell and the lock
 * badges in CoachSidebar. Prefix-matched so dynamic segments (e.g.
 * /coach/rtp/[playerId]) are covered by their base path.
 *
 * These are the premium data-integration surfaces: StatsBomb / Wyscout football
 * analytics + the deep VALD assessment suite. CMJ monitoring is deliberately NOT
 * here — it stays LITE (VALD_CMJ_MONITORING). Basketball FIBA win-factors and the
 * game-plan-fit differentiator are intentionally excluded (free / graceful feeds).
 */

import type { MicroPulseFeatureKey } from "./types";

type Bilingual = { EN: string; IS: string };

export type EliteRouteRule = {
  /** Path prefix; the current pathname matches when it equals the prefix or starts with `prefix + "/"`. */
  prefix: string;
  feature: MicroPulseFeatureKey;
  name: Bilingual;
  description: Bilingual;
};

const OPP_NAME: Bilingual = { EN: "Match & opponent analytics", IS: "Leik- & andstæðingagreining" };
const OPP_DESC: Bilingual = {
  EN: "StatsBomb & Wyscout match, season and opponent analysis. Available on the Elite plan.",
  IS: "StatsBomb & Wyscout leik-, tímabils- og andstæðingagreining. Í boði á Elite-pakkanum.",
};
const PLAYER_NAME: Bilingual = { EN: "Player season analytics", IS: "Leikmanna-tímabilsgreining" };
const PLAYER_DESC: Bilingual = {
  EN: "Per-player StatsBomb & Wyscout season, transfer and form analytics. Available on the Elite plan.",
  IS: "StatsBomb & Wyscout tímabils-, félagaskipta- og form-greining per leikmann. Í boði á Elite-pakkanum.",
};
const VALD_NAME: Bilingual = { EN: "VALD assessment suite", IS: "VALD mælingapakki" };
const VALD_DESC: Bilingual = {
  EN: "Return-to-Play assessment, ForceFrame benchmark bands and Load-Velocity profiling. Available on the Elite plan.",
  IS: "Return-to-Play mat, ForceFrame viðmiðunarbönd og kraft-/hraðaprófun. Í boði á Elite-pakkanum.",
};

/**
 * Ordered so the FIRST match wins. Keep base prefixes here; a more specific path
 * is caught by its base (e.g. /coach/rtp catches /coach/rtp/<playerId>).
 */
export const ELITE_ROUTE_RULES: EliteRouteRule[] = [
  // Opposition & match analytics (StatsBomb / Wyscout)
  { prefix: "/coach/match-analysis", feature: "OPPOSITION_MATCH_ANALYTICS", name: OPP_NAME, description: OPP_DESC },
  { prefix: "/coach/match-insights", feature: "OPPOSITION_MATCH_ANALYTICS", name: OPP_NAME, description: OPP_DESC },
  { prefix: "/coach/best-matches", feature: "OPPOSITION_MATCH_ANALYTICS", name: OPP_NAME, description: OPP_DESC },
  { prefix: "/coach/opponent-scouting", feature: "OPPOSITION_MATCH_ANALYTICS", name: OPP_NAME, description: OPP_DESC },
  // Player season analytics (StatsBomb / Wyscout)
  { prefix: "/coach/stat-explorer", feature: "PLAYER_SEASON_ANALYTICS", name: PLAYER_NAME, description: PLAYER_DESC },
  { prefix: "/coach/player-analysis", feature: "PLAYER_SEASON_ANALYTICS", name: PLAYER_NAME, description: PLAYER_DESC },
  { prefix: "/coach/player-stats", feature: "PLAYER_SEASON_ANALYTICS", name: PLAYER_NAME, description: PLAYER_DESC },
  { prefix: "/coach/total-player-analysis", feature: "PLAYER_SEASON_ANALYTICS", name: PLAYER_NAME, description: PLAYER_DESC },
  { prefix: "/coach/transfer-report", feature: "PLAYER_SEASON_ANALYTICS", name: PLAYER_NAME, description: PLAYER_DESC },
  { prefix: "/coach/form-vs-state", feature: "PLAYER_SEASON_ANALYTICS", name: PLAYER_NAME, description: PLAYER_DESC },
  // Deep VALD (CMJ monitoring stays LITE and is NOT here)
  { prefix: "/coach/assessments", feature: "VALD_ASSESSMENT_SUITE", name: VALD_NAME, description: VALD_DESC },
  { prefix: "/coach/rtp", feature: "VALD_ASSESSMENT_SUITE", name: VALD_NAME, description: VALD_DESC },
  { prefix: "/coach/lv-profile", feature: "VALD_ASSESSMENT_SUITE", name: VALD_NAME, description: VALD_DESC },
];

/** True when `pathname` is at or under `prefix` (segment-boundary safe). */
export function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/** The ELITE rule governing this pathname, or null when the route is not gated. */
export function matchEliteRoute(pathname: string | null | undefined): EliteRouteRule | null {
  if (!pathname) return null;
  for (const rule of ELITE_ROUTE_RULES) {
    if (pathMatchesPrefix(pathname, rule.prefix)) return rule;
  }
  return null;
}

/** Feature required for a given coach href (for sidebar lock badges), or null. */
export function eliteFeatureForHref(href: string): MicroPulseFeatureKey | null {
  return matchEliteRoute(href)?.feature ?? null;
}
