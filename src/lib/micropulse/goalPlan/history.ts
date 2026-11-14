/**
 * Goal plan, lota 5: the player's own history of earlier goals. Pure and client-safe; rules only, no AI.
 *
 * A history item is a plan that actually ran: finished after 8 weeks, or stopped by the coach after it was approved.
 * Requests the player withdrew or the coach declined never ran, so they are not history (the sheet already shows a
 * recent decline for 21 days).
 *
 * Layered read per item: (0) one-line verdict in the player's own numbers; (1) sessions ticked + the coach's note
 * to the player; (2) behind "Show details": every test line and how the change is read. Same words as the finished
 * card on Today. The coach's reason for stopping is the coach's own note (it was never labelled as a message to the
 * player), so it is not shown here. No GPS numbers and no colour on the player side.
 */

import { PLAN_WEEKS, QUALITY_LABEL } from "./common";
import type { Adherence, GoalOutcome } from "./outcome";
import type { GoalPlanStatus } from "./requests";
import type { Bi, GoalQuality } from "./types";

/** How many earlier goals the player sees (newest first). */
export const HISTORY_MAX = 8;

export type GoalHistoryItem = {
  id: string;
  quality: GoalQuality;
  status: "completed" | "stopped";
  title: Bi;
  startDate: string;
  endDate: string;
  /** The last day the plan ran (end date, or the day it was stopped). */
  lastDay: string;
  /** Plan week it stopped in (stopped plans only). */
  stoppedWeek: number | null;
  verdict: Bi;
  facts: Bi[];
  coachNote: string | null;
  details: Bi[];
};

/** A plan row counts as history only if it ran: finished, or stopped after approval (it has a start date). */
export function isHistoryRow(row: { status: GoalPlanStatus; start_date: string | null; end_date: string | null }): boolean {
  if (!row.start_date || !row.end_date) return false;
  return row.status === "completed" || row.status === "cancelled";
}

const dayMs = 86_400_000;
const toDay = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00Z`);

/** Plan week (1–8) a date falls in. */
export function planWeekOf(startDate: string, dateIso: string): number {
  const w = Math.floor((toDay(dateIso) - toDay(startDate)) / dayMs / 7) + 1;
  return Math.min(PLAN_WEEKS, Math.max(1, w));
}

export function buildGoalHistoryItem(input: {
  id: string;
  quality: GoalQuality;
  status: GoalPlanStatus;
  startDate: string;
  endDate: string;
  closedAt: string | null;
  coachNote: string | null;
  outcome: GoalOutcome;
  adherence: Adherence;
  /** What the plan's tests were (plan.tests.what) and how a change is read (plan.tests.change). */
  testsWhat: Bi | null;
  testsChange: Bi | null;
}): GoalHistoryItem {
  const { outcome } = input;
  const q = QUALITY_LABEL[input.quality];
  const stopped = input.status === "cancelled";
  const closed = input.closedAt?.slice(0, 10) ?? null;
  const lastDay = stopped && closed && closed < input.endDate ? closed : input.endDate;
  const stoppedWeek = stopped ? planWeekOf(input.startDate, lastDay) : null;

  const head: Bi = stopped
    ? { en: `Your coach stopped the plan in week ${stoppedWeek}.`, is: `Þjálfarinn stöðvaði áætlunina í viku ${stoppedWeek}.` }
    : { en: "All 8 weeks done.", is: "Allar 8 vikurnar búnar." };
  const verdict: Bi = outcome.state === "waiting"
    ? stopped
      ? head
      : { en: `${head.en} No retest was entered, so there is nothing to compare.`, is: `${head.is} Ekkert endurpróf var skráð, svo það er ekkert til að bera saman.` }
    : { en: `${head.en} ${outcome.verdict.en}`, is: `${head.is} ${outcome.verdict.is}` };

  const facts: Bi[] = [
    input.adherence.due ? input.adherence.line : { en: "No sessions were ticked.", is: "Engin æfing var merkt." },
  ];

  // The main test is already in the verdict (same rule as the finished card on Today).
  const tested = outcome.measures.filter((m) => (m.baseline || m.retest) && (outcome.state === "waiting" || m.measure !== outcome.main));
  const details: Bi[] = [
    ...tested.map((m) => m.line),
    ...(outcome.state === "waiting" && input.testsWhat ? [{ en: `Tests in the plan: ${input.testsWhat.en}`, is: `Próf áætlunarinnar: ${input.testsWhat.is}` }] : []),
    ...(input.testsChange ? [input.testsChange] : []),
    { en: "Rules compare the tests; there is no AI here. The plan never changed your check-in colour or the team's session.", is: "Reglur bera prófin saman; hér er engin gervigreind. Áætlunin breytti aldrei litnum þínum né æfingu liðsins." },
  ];

  return {
    id: input.id,
    quality: input.quality,
    status: stopped ? "stopped" : "completed",
    title: q,
    startDate: input.startDate,
    endDate: input.endDate,
    lastDay,
    stoppedWeek,
    verdict,
    facts,
    coachNote: input.coachNote,
    details,
  };
}
