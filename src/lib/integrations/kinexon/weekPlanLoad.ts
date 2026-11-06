/**
 * Per-player Kinexon load for the Week plan PDF, split into a training baseline and the player's own
 * recorded matches. Pure and IO-free: the route reads the rows (and the raw payload) and hands compact
 * numbers here.
 *
 * Training = mean per session over the recent non-match days, so a week's training line doesn't quietly
 * include match load. A player with no training rows falls back to every recent row.
 * Match = mean over the match days the sensor captured for that player. It already reflects how much the
 * player actually plays, so it needs no minutes scaling. Kinexon is arena-fixed, so away games are usually
 * missing, and `matches` says how many matches the mean rests on.
 */

export const KINEXON_WEEK_VARS = ["pl", "distance", "hsr", "cod", "coo", "exertions", "mechLoad"] as const;
export type KinexonWeekVar = (typeof KINEXON_WEEK_VARS)[number];
export type KinexonWeekValues = Record<KinexonWeekVar, number | null>;

export type KinexonLoadRow = KinexonWeekValues & { playerId: string; date: string; duration: number | null };

export type KinexonPlayerLoad = {
  training: KinexonWeekValues & { duration: number | null; sessions: number };
  match: (KinexonWeekValues & { matches: number }) | null;
};

const mean = (xs: Array<number | null>): number | null => {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
};
const meansOf = (rows: KinexonLoadRow[]): KinexonWeekValues =>
  Object.fromEntries(KINEXON_WEEK_VARS.map((k) => [k, mean(rows.map((r) => r[k]))])) as KinexonWeekValues;

/**
 * @param rows        the player rows to read: recent days, plus any older match days
 * @param matchDates  the team's match dates
 * @param trainSince  ISO date; only rows on or after it count toward the training baseline
 */
export function aggregateKinexonWeekPlanLoad(rows: KinexonLoadRow[], matchDates: Set<string>, trainSince: string): Map<string, KinexonPlayerLoad> {
  const byPlayer = new Map<string, KinexonLoadRow[]>();
  for (const r of rows) {
    if (!r.playerId) continue;
    const list = byPlayer.get(r.playerId) ?? [];
    // One row per player-day: a re-read of the same day must not weigh double.
    if (!list.some((x) => x.date === r.date)) list.push(r);
    byPlayer.set(r.playerId, list);
  }
  const out = new Map<string, KinexonPlayerLoad>();
  for (const [pid, list] of byPlayer) {
    const recent = list.filter((r) => r.date >= trainSince);
    const trainRows = recent.filter((r) => !matchDates.has(r.date));
    const base = trainRows.length ? trainRows : recent;
    const matchRows = list.filter((r) => matchDates.has(r.date));
    out.set(pid, {
      training: { ...meansOf(base), duration: mean(base.map((r) => (r.duration != null && r.duration > 0 ? r.duration : null))), sessions: base.length },
      match: matchRows.length ? { ...meansOf(matchRows), matches: matchRows.length } : null,
    });
  }
  return out;
}

/** The week's match contribution: the player's own match mean × the matches in the week. */
export function kinexonMatchLine(match: KinexonPlayerLoad["match"] | null | undefined, matchCount: number): KinexonWeekValues | null {
  if (!match || matchCount <= 0) return null;
  return Object.fromEntries(KINEXON_WEEK_VARS.map((k) => [k, match[k] == null ? null : (match[k] as number) * matchCount])) as KinexonWeekValues;
}
