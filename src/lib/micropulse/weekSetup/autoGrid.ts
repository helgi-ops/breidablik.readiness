/**
 * The football Week setup auto grid ("Fill from match (MD)"): seeds each day of the week from the match days.
 * Pure and client-safe. Never reads or writes the readiness colour.
 *
 * INSEASON_MD2_OFF (the coach's rule, 2026-11-23): in season the day 48 h after a match (MD+2) is a day off, and the
 * day after a match (MD+1) is the top-up / recovery day. A match in the last two days of the week before counts, so a
 * Monday after a Sunday match reads MD+1 and the Tuesday MD+2. MD-1 (activation before a match) is never turned off.
 * The week's Sunday stays a day off when no match is on it, as before.
 * Out of season the grid is unchanged: the taper to the next match first, then the recovery days after one.
 */

import { addDays, daysBetween } from "@/lib/micropulse/goalPlan/today";
import { threeInARowApplies } from "./weekRules";

export type AutoGridIntent =
  | "FORCE"
  | "NEURAL_VELOCITY"
  | "POLISH_CALM"
  | "ACTIVATION"
  | "RECOVERY_MD1"
  | "RECOVERY_MD2"
  | "RECOVERY_PLUS"
  | "GAME"
  | "OFF";

type Bi = { en: string; is: string };

export const MD2_OFF_RULE = "INSEASON_MD2_OFF" as const;

export const MD2_OFF_EVIDENCE =
  "MicroPulse rule (the coach's in-season plan, 2026-11-23): MD+2 is a day off. A day off at MD+2 is linked with a " +
  "lower non-contact injury rate (Buchheit et al. 2023b, 56 team-seasons; clearest in 3- and 7-day turnarounds).";

export type AutoGrid = {
  intents: AutoGridIntent[];
  /** Plain lines for the coach about what the rule did (empty when it did nothing). */
  notes: Bi[];
};

/**
 * `matchDates` may include matches before the week (only the last two days before it matter). Returns null when no
 * match falls inside the week (the caller seeds its no-match default). `phase` is the week's season phase; with no
 * phase known a week with a match counts as in season (the same reading as the three-in-a-row rule).
 */
export function matchAnchoredGrid(weekStart: string, matchDates: (string | null | undefined)[], phase: string | null | undefined): AutoGrid | null {
  const weekEnd = addDays(weekStart, 6);
  const all = [...new Set(matchDates.map((d) => (d ?? "").trim()).filter(Boolean))].sort();
  const inWeek = all.filter((d) => d >= weekStart && d <= weekEnd);
  if (inWeek.length === 0) return null;
  const inSeason = threeInARowApplies(phase, [{ date: inWeek[0], kind: "match" }]);
  // Out of season the grid keeps its old reading: only the matches inside the week.
  const games = inSeason ? all.filter((d) => d >= addDays(weekStart, -2) && d <= weekEnd) : inWeek;
  const set = new Set(games);
  const nextMatch = (day: string) => games.find((m) => m > day) ?? null;
  const prevMatch = (day: string) => {
    for (let i = games.length - 1; i >= 0; i--) if (games[i] < day) return games[i];
    return null;
  };
  const md2Off: string[] = [];

  const intents = Array.from({ length: 7 }).map((_, i): AutoGridIntent => {
    const day = addDays(weekStart, i);
    if (set.has(day)) return "GAME";
    const next = nextMatch(day);
    const toNext = next ? daysBetween(day, next) : null;
    const prev = prevMatch(day);
    const sincePrev = prev ? daysBetween(prev, day) : null;
    if (inSeason) {
      if (toNext === 1) return "ACTIVATION";
      if (sincePrev === 1 && i !== 6) return "RECOVERY_MD1"; // the week's Sunday stays a day off, as before
      if (sincePrev === 2) { md2Off.push(day); return "OFF"; }
    }
    if (toNext != null) {
      if (toNext >= 4) return (toNext - 4) % 2 === 0 ? "FORCE" : "NEURAL_VELOCITY"; // MD-4 force, MD-5 neural…
      if (toNext === 3) return "NEURAL_VELOCITY";
      if (toNext === 2) return "POLISH_CALM";
      if (toNext === 1) return "ACTIVATION";
    }
    if (sincePrev != null && sincePrev >= 1 && i !== 6) {
      return sincePrev === 1 ? "RECOVERY_MD1" : sincePrev === 2 ? "RECOVERY_MD2" : "RECOVERY_PLUS";
    }
    return i === 6 ? "OFF" : "FORCE";
  });

  const notes: Bi[] = md2Off.length
    ? [{
      en: "MD+2 is a day off: in season the day 48 h after a match is rest (MicroPulse's rule; a day off at MD+2 went with fewer non-contact injuries, Buchheit 2023b).",
      is: "MD+2 er frídagur: á keppnistímabili er hvíld 48 klst. eftir leik (regla MicroPulse; frídegi á MD+2 fylgdu færri meiðsli án snertingar, Buchheit 2023b).",
    }]
    : [];
  return { intents, notes };
}
