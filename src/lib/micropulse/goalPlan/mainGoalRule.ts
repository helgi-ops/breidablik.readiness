/**
 * Priority between the add-ons and the goal (brief §6, 2026-11-22), checked when a goal plan is approved or started.
 *
 *   1. Injury-prevention add-ons (Nordic, Copenhagen, the test add-ons of §4b) always apply. They are not a goal and
 *      never compete with one.
 *   2. Then one main goal: the one the player chose, with their data as the argument. Never two main goals at once.
 *
 * Pure: the store reads the player's other open plans and calls `oneMainGoalCheck`. The database index
 * `player_goal_plans_one_open_uq` holds the same line underneath; this check says it in words first and logs the rule
 * on the approval event.
 */

import type { AppliedAdaptation } from "@/lib/micropulse/strengthProgramming/types";
import { QUALITY_LABEL } from "./common";
import type { GoalQuality } from "./types";
import type { GoalPlanStatus } from "./requests";

export const GOAL_PRIORITY_RULE = "GOAL_PRIORITY";

export const GOAL_PRIORITY_EVIDENCE =
  "MicroPulse rule (the coach's brief, 2026-11-22): injury-prevention add-ons (Nordic, Copenhagen, the test add-ons) " +
  "always apply first; then one main goal, chosen by the player with their own data as the argument. Two main goals " +
  "at once would split the same gym days between them. Nordic programmes cut hamstring injuries (van Dyk et al. 2019) " +
  "and Copenhagen adduction work cuts groin problems (Harøy et al. 2019), which is why they stay whatever the goal.";

export type OpenGoal = { id: string; quality: GoalQuality; status: GoalPlanStatus };

const STATUS_WORD: Record<string, { en: string; is: string }> = {
  requested: { en: "waiting for the coach", is: "bíður eftir þjálfara" },
  approved: { en: "running", is: "í gangi" },
  paused: { en: "paused", is: "í bið" },
};

export type MainGoalCheck =
  | { ok: true; adaptation: AppliedAdaptation }
  | { ok: false; en: string; is: string };

/**
 * One main goal at a time. `open` = the player's open plans (requested / approved / paused); `planId` = the plan being
 * approved (it does not count against itself), or null for a new plan.
 */
export function oneMainGoalCheck(open: OpenGoal[], planId: string | null, quality: GoalQuality): MainGoalCheck {
  const other = open.find((g) => g.id !== planId);
  if (other) {
    const q = QUALITY_LABEL[other.quality];
    const st = STATUS_WORD[other.status] ?? { en: other.status, is: other.status };
    return {
      ok: false,
      en: `This player already has a main goal (${q.en}, ${st.en}). One main goal at a time: stop that plan first.`,
      is: `Leikmaðurinn er nú þegar með aðalmarkmið (${q.is}, ${st.is}). Eitt aðalmarkmið í einu: stöðvaðu það plan fyrst.`,
    };
  }
  const q = QUALITY_LABEL[quality];
  return {
    ok: true,
    adaptation: {
      ruleId: GOAL_PRIORITY_RULE,
      triggerEN: `Goal plan approved: ${q.en}`,
      triggerIS: `Markmiðsplan samþykkt: ${q.is}`,
      actionEN: `${q.en} is the one main goal. The injury-prevention add-ons (Nordic, Copenhagen, test add-ons) still apply first.`,
      actionIS: `${q.is} er eina aðalmarkmiðið. Meiðslaforvörnin (Nordic, Copenhagen, viðbætur eftir próf) gildir áfram fyrst.`,
      evidence: GOAL_PRIORITY_EVIDENCE,
    },
  };
}
