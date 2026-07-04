/**
 * Auto-flex for the shareable match card: pick which of the three player stats
 * (Top Speed / Distance / Sprints) gets the hero slot, and whether it earns a
 * truthful badge.
 *
 * Rules (deterministic, explainability-first — a badge is only shown when true):
 *  1. If the match value EQUALS the player's season best for a metric → that
 *     metric is the hero, badge = "seasonBest" (⭐). Ties: Top Speed > Distance
 *     > Sprints.
 *  2. Otherwise feature the metric with the highest matchValue / seasonBest
 *     ratio. Badge = "matchHigh" (📈) only if the match is also top-N of the
 *     season for that metric; else no badge (just the number).
 *
 * All values are match TOTALS (not per-90) and top speed is already glitch-
 * clamped (≤45 km/h) upstream. Season bests are computed over the passed set,
 * which must include the current match.
 */

export type ShareMetric = "topSpeed" | "distance" | "sprints";
export type ShareStats = { topSpeed: number; distance: number; sprints: number };
export type HeroBadge = "seasonBest" | "matchHigh" | null;
export type HeroPick = { heroKey: ShareMetric; badge: HeroBadge };

/** Priority order for tie-breaks (a top-speed brag beats a distance brag). */
const PRIORITY: ShareMetric[] = ["topSpeed", "distance", "sprints"];
/** A non-best match still earns "match high" if it's within this rank of the season. */
const TOP_N = 3;

const clean = (v: number | null | undefined): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** Per-metric season best across all the player's matches (this match included). */
export function seasonBests(all: ShareStats[]): ShareStats {
  const best = { topSpeed: 0, distance: 0, sprints: 0 };
  for (const s of all) {
    best.topSpeed = Math.max(best.topSpeed, clean(s.topSpeed));
    best.distance = Math.max(best.distance, clean(s.distance));
    best.sprints = Math.max(best.sprints, clean(s.sprints));
  }
  return best;
}

/** 1-based rank of `value` among `all` (descending); ties share the better rank. */
function rankOf(value: number, all: number[]): number {
  const sorted = [...all].sort((a, b) => b - a);
  const idx = sorted.findIndex((v) => v <= value);
  return idx === -1 ? sorted.length + 1 : idx + 1;
}

export function pickHeroStat(match: ShareStats, all: ShareStats[]): HeroPick {
  const set = all.length ? all : [match];
  const best = seasonBests(set);

  // 1. Season best (match equals the max, and is a real value).
  const isBest = (k: ShareMetric) => clean(match[k]) > 0 && clean(match[k]) >= best[k];
  const bestMetric = PRIORITY.find(isBest);
  if (bestMetric) return { heroKey: bestMetric, badge: "seasonBest" };

  // 2. Highest ratio to the season best; PRIORITY breaks ties (strict >).
  const ratio = (k: ShareMetric) => (best[k] > 0 ? clean(match[k]) / best[k] : 0);
  let hero: ShareMetric = PRIORITY[0];
  for (const k of PRIORITY) if (ratio(k) > ratio(hero)) hero = k;

  // "Match high" only when the match is top-N of the season for the hero metric.
  const values = set.map((s) => clean(s[hero])).filter((v) => v > 0);
  const rank = rankOf(clean(match[hero]), values);
  const badge: HeroBadge = clean(match[hero]) > 0 && values.length > 1 && rank <= TOP_N ? "matchHigh" : null;
  return { heroKey: hero, badge };
}
