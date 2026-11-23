/**
 * MISSED_DAY_NOT_SHIFTED (brief §5, 2026-11-23). Pure.
 *
 * A missed MD-4 session is not moved to MD-3 or later: MD-3, MD-2 and MD-1 keep their own sessions. The engine builds
 * every day from that day's MD context alone, so nothing is ever carried over; this rule makes that a stated rule and
 * says so in the session's audit when the coach's preview knows MD-4 was missed (`PlayerStrengthSnapshot.missedDay`).
 * It never changes a block, and never reads or writes the readiness colour.
 */

import type { AppliedAdaptation, MdContext } from "./types";

export const MISSED_DAY_RULE = "MISSED_DAY_NOT_SHIFTED" as const;

export const MISSED_DAY_EVIDENCE =
  "MicroPulse rule (the coach's plan, 2026-11-22): a missed heavy day is not made up later in the week. Stacking it " +
  "onto MD-3 or closer to the match would put two heavy days together and heavy work near the match (taper: " +
  "Buchheit et al. 2024, microcycle principles).";

/** A session the player was sent and did not do (no "done", no set logged). */
export type MissedDay = { md: "MD-4"; date: string };

/** The days after MD-4 in the same week, with how many days after MD-4 they are. */
const DAYS_AFTER_MD4: Partial<Record<MdContext, number>> = { "MD-3": 1, "MD-2": 2, "MD-1": 3 };

/** The MD-4 date of this week, seen from a later day (MD-3 → yesterday). Null on other days. */
export function md4DateBefore(todayIso: string, md: MdContext): string | null {
  const back = DAYS_AFTER_MD4[md];
  if (!back) return null;
  const d = new Date(`${todayIso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** The audit line on MD-3 / MD-2 / MD-1 after a missed MD-4 of the same week; null otherwise. */
export function missedDayAudit(todayIso: string, md: MdContext, missed: MissedDay | null | undefined): AppliedAdaptation | null {
  if (!missed || missed.md !== "MD-4") return null;
  if (md4DateBefore(todayIso, md) !== missed.date) return null;
  return {
    ruleId: MISSED_DAY_RULE,
    triggerEN: `The MD-4 session (${missed.date}) was not done.`,
    triggerIS: `MD-4 æfingin (${missed.date}) var ekki gerð.`,
    actionEN: `Not moved: ${md} keeps its own session. The missed heavy work is not added to this or a later day.`,
    actionIS: `Ekki fært: ${md} heldur sinni æfingu. Þunga vinnan sem missti af bætist ekki við þennan dag eða síðari.`,
    evidence: MISSED_DAY_EVIDENCE,
  };
}
