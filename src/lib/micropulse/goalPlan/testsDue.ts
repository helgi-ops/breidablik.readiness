/**
 * Goal plan, lota 6: which approved plans need a test from the coach. Pure and client-safe; rules only, no AI.
 *
 * Without a start test and a retest there is no outcome, only the sessions ticked. So the coach is reminded in the
 * morning digest, on the Today chips ("Goal plan tests") and on the Goal requests page. Nothing goes to players.
 *
 *   - Start test missing: plan approved, from its start date through week 3 (start + 20 days), and no start result
 *     on any of the plan's tests. After week 3 a start test no longer describes the start, so it stops asking.
 *   - Retest due: plan approved from week 7 (start + 42 days), or finished within the 3 weeks a retest can still be
 *     entered (RESULT_AFTER_END_DAYS), and no retest on any of the plan's tests. Retest wins if both are missing.
 *   - Paused (injured / coming back), stopped, declined: never asked for.
 * Jump height counts when VALD has it (read live), so a jump plan with a fresh CMJ needs nothing typed.
 */

import { RESULT_AFTER_END_DAYS, QUALITY_MEASURES, type GoalResult } from "./outcome";
import type { GoalPlanStatus } from "./requests";
import type { Bi, GoalQuality } from "./types";

export type GoalTestNeed = "baseline" | "retest";

/** Last day (start + n) a missing start test is still asked for: the end of week 3. */
export const BASELINE_ASK_UNTIL_DAY = 20;
/** First day (start + n) a retest is asked for: the start of week 7. */
export const RETEST_ASK_FROM_DAY = 42;

const DAY_MS = 86_400_000;
const ms = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);
const daysBetween = (from: string, to: string) => Math.round((ms(to) - ms(from)) / DAY_MS);

type PlanLite = { status: GoalPlanStatus; quality: GoalQuality; start_date: string | null; end_date: string | null };

/** Could this plan need a test today? (Cheap pre-filter before reading results.) */
export function inTestWindow(p: PlanLite, todayIso: string): boolean {
  if (!p.start_date || !p.end_date) return false;
  const day = daysBetween(p.start_date, todayIso);
  if (p.status === "approved") return day >= 0 && (day <= BASELINE_ASK_UNTIL_DAY || day >= RETEST_ASK_FROM_DAY);
  if (p.status === "completed") return daysBetween(p.end_date, todayIso) <= RESULT_AFTER_END_DAYS;
  return false;
}

/** The test the coach still has to enter, or null. */
export function goalTestNeed(p: PlanLite, results: GoalResult[], todayIso: string): GoalTestNeed | null {
  if (!inTestWindow(p, todayIso) || !p.start_date) return null;
  const measures = new Set(QUALITY_MEASURES[p.quality]);
  const has = (phase: GoalResult["phase"]) => results.some((r) => r.phase === phase && measures.has(r.measure));
  const day = daysBetween(p.start_date, todayIso);
  if ((p.status === "completed" || day >= RETEST_ASK_FROM_DAY) && !has("retest")) return "retest";
  if (p.status === "approved" && day <= BASELINE_ASK_UNTIL_DAY && !has("baseline")) return "baseline";
  return null;
}

export type GoalTestDue = {
  planId: string;
  playerId: string;
  name: string;
  quality: GoalQuality;
  need: GoalTestNeed;
  startDate: string;
  endDate: string;
  /** Days until the plan's last day (negative once it has ended). */
  daysToEnd: number;
};

export function buildGoalTestDue(
  p: PlanLite & { id: string; player_id: string; name: string | null },
  results: GoalResult[],
  todayIso: string,
): GoalTestDue | null {
  const need = goalTestNeed(p, results, todayIso);
  if (!need || !p.start_date || !p.end_date) return null;
  return {
    planId: p.id, playerId: p.player_id, name: p.name ?? "Player", quality: p.quality, need,
    startDate: p.start_date, endDate: p.end_date, daysToEnd: daysBetween(todayIso, p.end_date),
  };
}

export const TEST_NEED_LABEL: Record<GoalTestNeed, Bi> = {
  baseline: { en: "Start test missing", is: "Upphafspróf vantar" },
  retest: { en: "Retest due", is: "Endurpróf á dagskrá" },
};

/** "4 days left" / "ends today" / "ended 3 days ago" for a retest. */
export function retestWhen(daysToEnd: number): Bi {
  // Icelandic: numbers ending in 1 (not 11) take the singular ("21 dagur", "fyrir 21 degi").
  const one = (n: number) => n % 10 === 1 && n % 100 !== 11;
  if (daysToEnd > 1) return { en: `${daysToEnd} days left`, is: `${daysToEnd} ${one(daysToEnd) ? "dagur" : "dagar"} eftir` };
  if (daysToEnd === 1) return { en: "ends tomorrow", is: "lýkur á morgun" };
  if (daysToEnd === 0) return { en: "ends today", is: "lýkur í dag" };
  const n = -daysToEnd;
  return { en: `ended ${n} day${n === 1 ? "" : "s"} ago`, is: `lauk fyrir ${n} ${one(n) ? "degi" : "dögum"}` };
}
