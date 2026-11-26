/**
 * What "one match" means in the hub's ×match tables, said in plain words, and where a weekly ×match
 * multiple lands against the research training:match range. Pure, no I/O.
 *
 * The team reference is `teamKpiAvg` (preseasonKpiMap.ts): the mean of each player's match unit, and a
 * player's match unit is the median of his near-full matches (`selectNearFullMatches`, index.ts). This file
 * only counts and words that — it never changes a number.
 */

import { NEAR_FULL_MIN_MINUTES, NEAR_FULL_MIN_SAMPLE, NEAR_FULL_WINDOW_DAYS, type MatchUnit } from "./index";

type Bi = { en: string; is: string };

export type TeamMatchReference = {
  /** Players whose match unit carries a value (they make up the team average). */
  nPlayers: number;
  /** Of those, players with fewer than NEAR_FULL_MIN_SAMPLE near-full matches in the window (season used instead). */
  nFellBack: number;
  minMinutes: number;
  windowWeeks: number;
  note: Bi;
};

type UnitLike = Pick<MatchUnit, "fellBack" | "load" | "distance">;

/** Says what the team's "one match" is built from: how many players, which matches, which window. */
export function teamMatchReference(units: UnitLike[]): TeamMatchReference {
  const counted = units.filter((u) => u.load.typical != null || u.distance.typical != null);
  const nPlayers = counted.length;
  const nFellBack = counted.filter((u) => u.fellBack).length;
  const minMinutes = NEAR_FULL_MIN_MINUTES;
  const windowWeeks = Math.round(NEAR_FULL_WINDOW_DAYS / 7);
  if (nPlayers === 0) {
    return {
      nPlayers, nFellBack, minMinutes, windowWeeks,
      note: { en: "No player has a near-full match with GPS yet.", is: "Enginn leikmaður á enn næstum-heilan leik með GPS." },
    };
  }
  const en = `One match = the team's typical full match: the average of ${nPlayers} player${nPlayers === 1 ? "" : "s"}, each player's median from matches of ${minMinutes}+ min in the last ${windowWeeks} weeks.`;
  const is = `Einn leikur = dæmigerður heill leikur liðsins: meðaltal ${nPlayers} leikmanna, miðgildi hvers úr leikjum með ${minMinutes}+ mín síðustu ${windowWeeks} vikur.`;
  const fbEn = nFellBack > 0 ? ` ${nFellBack} of them ${nFellBack === 1 ? "has" : "have"} fewer than ${NEAR_FULL_MIN_SAMPLE} such matches and use${nFellBack === 1 ? "s" : ""} the whole season.` : "";
  const fbIs = nFellBack > 0 ? ` ${nFellBack} ${nFellBack === 1 ? "þeirra á" : "þeirra eiga"} færri en ${NEAR_FULL_MIN_SAMPLE} slíka leiki og ${nFellBack === 1 ? "notar" : "nota"} allt tímabilið.` : "";
  return { nPlayers, nFellBack, minMinutes, windowWeeks, note: { en: en + fbEn, is: is + fbIs } };
}

export type TmBand = "below" | "in" | "above";

/** Where a weekly ×match multiple lands against the research training:match range (null = no range or value). */
export function tmRefBand(x: number | null | undefined, ref: [number, number] | null | undefined): TmBand | null {
  if (x == null || ref == null) return null;
  return x < ref[0] ? "below" : x > ref[1] ? "above" : "in";
}
