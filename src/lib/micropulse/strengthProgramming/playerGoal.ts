/**
 * Player strength goal (lota 2, 2026-11-17) — engine step. Pure, mutates the session blocks in place.
 *
 * The player picked ONE goal in their app (or the coach set it). On the goal's days the matching exercise in
 * Today's session gets ONE more set:
 *   stronger → the main leg lift (bilateral or one-leg strength), MD-4
 *   power    → the first jump / fast lift / throw, MD-4 and MD-3
 *   robust   → the Nordic, MD-4
 *
 * No extra set (and a line saying why) when: today is a recovery or lighter day (readiness), it is a two-match
 * week, the player has a run of heavy braking days (Nordic goal), or a safety rule changed / ruled out that
 * exercise today. Safety rules, readiness and the coach's own changes always win. The +1 set is the coach's
 * limit, not from a study.
 *
 * Season (2026-11-17, coach's rule): the extra set is BUILDING, so it only comes in pre-season and off-season.
 * In season the session is maintenance (microdose) and the goal is kept for the next build phase. The phase is
 * read from the season plan (`snap.goalSeason`, set by the send routes from resolveCurrentBlock); without a plan,
 * from the week setup (`snap.seasonPhase`); unknown → maintenance. A light week (deload) or a taper block in the
 * plan → no extra set. With no match within 5 days (`snap.noMatchNearby`) in pre-/off-season, every strength
 * session is a goal day. Never more than +1 set: no goal set on a day the player's own data already added an
 * exercise (deficit ledger), and the Accumulation block's +1 skips the goal's exercise (blockEmphasis.ts).
 *
 * Runs AFTER the team list (which keeps the template's dose) and BEFORE the coach's manual swaps.
 */

import type { AppliedAdaptation, PlayerStrengthSnapshot, SessionBlock } from "./types";
import type { BlockGoalKey, SeasonPhaseKey } from "./seasonPhaseStrength";
import { SLOT_CATEGORIES } from "./palette";
import { GOAL_DAYS, STRENGTH_GOAL_LABEL, type StrengthGoal } from "./playerPicks";

const NORDIC = "ex_nordic_curl";

export type GoalSeason = "build" | "maintain" | "unknown";

/** Which part of the year the goal's extra set sees: the season plan first, then the week setup. */
export function goalSeasonOf(snap: Pick<PlayerStrengthSnapshot, "goalSeason" | "seasonPhase">): GoalSeason {
  const planned = snap.goalSeason?.phase ?? null;
  if (planned) return planned === "competitive" ? "maintain" : "build";
  const week = String(snap.seasonPhase ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (week === "preseason" || week === "offseason") return "build";
  if (week === "inseason" || week === "playoffs" || week === "competitive") return "maintain";
  return "unknown";
}

/** The snapshot with today's season-plan block on it, for the goal's extra set and the 8-week goal plan's gym
 *  session. Only for a player with either and a resolved block — otherwise the snapshot is returned unchanged. */
export function withGoalSeason<T extends PlayerStrengthSnapshot>(
  snap: T,
  block: { phase: SeasonPhaseKey; goalKey: BlockGoalKey | null } | null | undefined,
): T {
  if ((!snap.playerStrengthGoal && !snap.goalPlanGym) || !block) return snap;
  return { ...snap, goalSeason: { phase: block.phase, blockGoal: block.goalKey ?? null } };
}

/** True when today is one of the goal's days: in pre-/off-season with no match within 5 days, every strength
 *  session except a day the coach set as light (built as MD-2, 2026-11-17); otherwise the goal's MD days. */
export function isGoalDay(
  goal: StrengthGoal,
  snap: Pick<PlayerStrengthSnapshot, "mdContext" | "noMatchNearby">,
  season: GoalSeason,
): boolean {
  if (season === "build" && snap.noMatchNearby) return snap.mdContext !== "MD-2" && snap.mdContext !== "MD-1";
  return GOAL_DAYS[goal].includes(snap.mdContext);
}

const GOAL_EVIDENCE: Record<StrengthGoal, string> = {
  stronger: "Player's own goal within the coach's limits (+1 set on the week's heavy day, pre-season and off-season only; the limit is the coach's, not from a study). Choice may support motivation and adherence (Ntoumanis et al. 2021).",
  power: "Player's own goal within the coach's limits (+1 set of the first power exercise, MD-4/MD-3, pre-season and off-season only; the limit is the coach's, not from a study). Choice may support motivation and adherence (Ntoumanis et al. 2021).",
  robust: "Player's own goal within the coach's limits (+1 set of Nordics on MD-4, pre-season and off-season only). Nordic training is associated with fewer hamstring injuries (van Dyk et al. 2019 meta-analysis). Choice may support adherence (Ntoumanis et al. 2021).",
};

function targetCategories(goal: StrengthGoal): readonly string[] | null {
  if (goal === "stronger") return [...SLOT_CATEGORIES.bilateral_strength, ...SLOT_CATEGORIES.unilateral_strength];
  if (goal === "power") return SLOT_CATEGORIES.power_explosive;
  return null; // robust → the Nordic itself
}

/**
 * @param isRuledOut  today's safety rules rule this exercise out (banned / not suitable today)
 * @param isPinned    a safety rule put this exercise here (a safety swap) — never pump its volume
 */
export function applyPlayerGoal(
  blocks: SessionBlock[],
  snap: PlayerStrengthSnapshot,
  isRuledOut: (id: string) => boolean,
  isPinned: (id: string) => boolean,
): AppliedAdaptation[] {
  const goal = snap.playerStrengthGoal;
  if (!goal) return [];
  const season = goalSeasonOf(snap);
  if (!isGoalDay(goal, snap, season)) return []; // not one of the goal's days: nothing to say
  const label = STRENGTH_GOAL_LABEL[goal];

  const paused = (en: string, is: string): AppliedAdaptation[] => [{
    ruleId: "PLAYER_GOAL_PAUSED",
    triggerEN: `Player's goal: ${label.en}`,
    triggerIS: `Markmið leikmanns: ${label.is}`,
    actionEN: `No extra set today: ${en}.`,
    actionIS: `Ekkert aukasett í dag: ${is}.`,
    evidence: GOAL_EVIDENCE[goal],
  }];

  if (season === "maintain") {
    return paused(
      "in season the session is maintenance; the goal is kept for pre-season",
      "á tímabili er æfingin viðhald; markmiðið er geymt fyrir undirbúningstímabil",
    );
  }
  if (season === "unknown") {
    return paused(
      "the season plan doesn't say pre-season or off-season, so the session stays maintenance",
      "tímabilaplanið segir ekki undirbúnings- eða hvíldartímabil, svo æfingin er viðhald",
    );
  }
  const blockGoal = snap.goalSeason?.blockGoal ?? null;
  if (blockGoal === "deload") return paused("a light week in the season plan", "létt vika í tímabilaplaninu");
  if (blockGoal === "realize") {
    return paused("a taper block in the season plan (easing off before matches)", "niðurtröppun í tímabilaplaninu (léttir fyrir leiki)");
  }

  if (snap.verdict === "HOLD" || snap.verdict === "RECOVERY") return paused("today is a recovery day", "í dag er endurheimtardagur");
  if (snap.verdict === "MODIFIED" || snap.verdict === "REDUCED") return paused("readiness says keep it lighter today", "standið segir léttari dag í dag");
  if (snap.isCongestedWeek) return paused("two matches within 7 days", "tveir leikir á 7 dögum");
  if (goal === "robust" && snap.decelBurdenHighStreakDays >= 3) {
    return paused("several days in a row with a lot of braking", "nokkrir dagar í röð með mikla hemlun");
  }

  // Microdose: never more than one extra on a day. The player's own data (deficit ledger) already added one.
  if (blocks.some((b) => b.exercises.some((e) => e.isAdaptiveAddition))) {
    return paused("the player's data already added an exercise today", "gögn leikmannsins bættu þegar við æfingu í dag");
  }

  const cats = targetCategories(goal);
  for (const block of blocks) {
    for (let i = 0; i < block.exercises.length; i++) {
      const ex = block.exercises[i];
      const matches = cats ? cats.includes(ex.category) : ex.exerciseId === NORDIC;
      if (!matches) continue;
      // A safety swap or an engine addition is never pumped; an exercise today's safety rules rule out neither.
      // An 8-week goal plan lift already carries the plan's dose: never a second extra on it.
      if (ex.isAdaptiveAddition || ex.goalPlan || isPinned(ex.exerciseId) || isRuledOut(ex.exerciseId)) continue;
      block.exercises[i] = {
        ...ex,
        dose: { ...ex.dose, sets: ex.dose.sets + 1 },
        playerGoal: true,
        modificationReason: `${ex.modificationReason ? `${ex.modificationReason} · ` : ""}Player's goal (${label.en}): +1 set`,
      };
      return [{
        ruleId: "PLAYER_GOAL_APPLIED",
        triggerEN: `Player's goal: ${label.en}`,
        triggerIS: `Markmið leikmanns: ${label.is}`,
        actionEN: `One more set of ${ex.nameEN} (${ex.dose.sets} → ${ex.dose.sets + 1}).`,
        actionIS: `Eitt sett í viðbót af ${ex.nameIS || ex.nameEN} (${ex.dose.sets} → ${ex.dose.sets + 1}).`,
        evidence: GOAL_EVIDENCE[goal],
      }];
    }
  }
  return paused(
    "no matching exercise in today's session, or a safety rule changed it",
    "engin samsvarandi æfing í dag, eða öryggisregla breytti henni",
  );
}
