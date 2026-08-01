/**
 * Sport-aware drill categories — one source for the session builder, the drill
 * library editor and the drill-library API validation. Football keeps its
 * possession/SSG/finishing set; basketball uses shooting/fast-break/half-court/
 * defense/conditioning. "warmup" and "other" are shared.
 */

export type FootballCategory =
  | "possession"
  | "ssg"
  | "transition"
  | "running"
  | "finishing"
  | "warmup"
  | "other";

export type BasketballCategory =
  | "shooting"
  | "fast_break"
  | "half_court_offense"
  | "defense"
  | "conditioning"
  | "warmup"
  | "other";

export type DrillCategory = FootballCategory | BasketballCategory;

export const FOOTBALL_CATEGORIES: FootballCategory[] = [
  "possession", "ssg", "transition", "running", "finishing", "warmup", "other",
];

export const BASKETBALL_CATEGORIES: BasketballCategory[] = [
  "shooting", "fast_break", "half_court_offense", "defense", "conditioning", "warmup", "other",
];

/** Every category across sports — used by the API to validate a create request. */
export const ALL_DRILL_CATEGORIES: DrillCategory[] = [
  "possession", "ssg", "transition", "running", "finishing",
  "shooting", "fast_break", "half_court_offense", "defense", "conditioning",
  "warmup", "other",
];

export const DRILL_CATEGORY_LABELS_EN: Record<DrillCategory, string> = {
  possession: "Possession", ssg: "SSG", transition: "Transition", running: "Running", finishing: "Finishing",
  shooting: "Shooting", fast_break: "Fast Break", half_court_offense: "Half-Court Offense", defense: "Defense", conditioning: "Conditioning",
  warmup: "Warm-up", other: "Other",
};

export const DRILL_CATEGORY_LABELS_IS: Record<DrillCategory, string> = {
  possession: "Bolthald", ssg: "SSG", transition: "Umskipti", running: "Hlaup", finishing: "Klárunaræfingar",
  shooting: "Skot", fast_break: "Hraðupphlaup", half_court_offense: "Sókn á hálfum velli", defense: "Vörn", conditioning: "Þrek",
  warmup: "Upphitun", other: "Annað",
};

export function getDrillCategoriesForSport(sport: string | null | undefined): DrillCategory[] {
  return String(sport ?? "").toLowerCase() === "basketball" ? BASKETBALL_CATEGORIES : FOOTBALL_CATEGORIES;
}

export function drillCategoryLabels(lang: "IS" | "EN"): Record<DrillCategory, string> {
  return lang === "IS" ? DRILL_CATEGORY_LABELS_IS : DRILL_CATEGORY_LABELS_EN;
}
