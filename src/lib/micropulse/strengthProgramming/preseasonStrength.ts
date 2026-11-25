/**
 * The strength work of each pre-season week AS IT IS SENT — for the hub's pre-season page. No new rule: it reads the
 * same pieces the daily delivery uses.
 *
 *   - the block's goal (the coach's per block, else the build-up order) → strengthForBlockGoal(goal, "preseason",
 *     the team's own block rule) — quality, %1RM, sets × reps, methods;
 *   - heavy reps a day (weekRule.ts): a week with a game → MATCH_WEEK_HEAVY_REPS.preseason on its MD days; a week
 *     without one → noMatchWeekRule over the team's weekday plan (the default plan when the team has none);
 *   - the method of a heavy day: the team's md_structures, else DEFAULT_STRUCTURE_BY_MD.
 *
 * The MD days come from the week as the Meso page lays it out (that week is written to Week Setup, which the delivery
 * reads the day's MD from). Descriptive — never the readiness colour. Pure.
 */

import { strengthForBlockGoal, type BlockGoalKey, type BlockStrengthScheme, type CoachStrengthRules } from "./seasonPhaseStrength";
import { MATCH_WEEK_HEAVY_REPS, NO_MATCH_WEEK_HEAVY_TOTAL, noMatchWeekRule } from "./weekRule";
import { DEFAULT_STRUCTURE_BY_MD, NO_MATCH_DAY_MD, effectiveNoMatchWeek, isRestDay, type MdStructures, type NoMatchWeek, type StructureKey } from "./structures";
import type { MdContext } from "./types";

export type PreseasonStrengthDay = {
  date: string;
  /** The MD day it is built as (a no-match heavy day: the MD day its kind is built as). */
  md: MdContext;
  heavyReps: number;
  structure: StructureKey | null;
};

export type PreseasonStrengthWeek = {
  weekStart: string;
  goalKey: BlockGoalKey;
  goalByCoach: boolean;
  scheme: BlockStrengthScheme;
  hasGame: boolean;
  /** The heavy days, in date order. */
  days: PreseasonStrengthDay[];
  weekHeavyReps: number;
  /** A week without a game and no weekday plan saved: the default plan was used (as the delivery does). */
  defaultPlan: boolean;
  cite: string;
};

export type PreseasonStrengthInput = {
  weeks: Array<{ weekStart: string; days: Array<{ date: string; type: string; md: string }> }>;
  blocks: Array<{ start: string; end: string; goalKey: BlockGoalKey; goalByCoach: boolean }>;
  coachRules?: CoachStrengthRules | null;
  mdStructures?: MdStructures | null;
  noMatchWeek?: NoMatchWeek | null;
};

/** The studies behind the heavy reps a week (the ones WEEK_RULE_EVIDENCE names). */
export const WEEK_RULE_CITE = "Rønnestad 2011; Hoff & Helgerud 2004; Cuthbert 2021; Silva 2018";

const MD_DAYS = new Set<MdContext>(["MD-5", "MD-4", "MD-3", "MD-2", "MD-1", "MD+1", "MD+2", "MD+3", "MD+4"]);
const structureFor = (md: MdContext, mdStructures: MdStructures | null | undefined): StructureKey | null => {
  const own = mdStructures?.[md];
  if (own && !isRestDay(own)) return own as StructureKey;
  return DEFAULT_STRUCTURE_BY_MD[md] ?? null;
};

export function preseasonStrengthWeeks(input: PreseasonStrengthInput): PreseasonStrengthWeek[] {
  const season = "preseason" as const;
  const eff = effectiveNoMatchWeek(input.noMatchWeek ?? null);
  return input.weeks.map((w) => {
    const blk = input.blocks.find((b) => b.start <= w.weekStart && w.weekStart < b.end) ?? input.blocks[input.blocks.length - 1];
    const goalKey: BlockGoalKey = blk?.goalKey ?? "accum";
    const scheme = strengthForBlockGoal(goalKey, season, input.coachRules?.block?.[`${goalKey}:${season}`] ?? null);
    const hasGame = w.days.some((d) => d.type === "match");
    const days: PreseasonStrengthDay[] = [];
    if (hasGame) {
      for (const d of w.days) {
        if (d.type === "match" || d.type === "rest") continue;
        const md = d.md as MdContext;
        if (!MD_DAYS.has(md)) continue;
        const reps = MATCH_WEEK_HEAVY_REPS[season][md];
        if (reps) days.push({ date: d.date, md, heavyReps: reps, structure: structureFor(md, input.mdStructures) });
      }
    } else {
      for (const d of w.days) {
        const rule = noMatchWeekRule(d.date, eff.week, season);
        if (!rule || rule.kind === "rest" || rule.heavyReps == null) continue;
        const md = NO_MATCH_DAY_MD[rule.kind];
        days.push({ date: d.date, md, heavyReps: rule.heavyReps, structure: structureFor(md, input.mdStructures) });
      }
    }
    const weekHeavyReps = days.reduce((s, d) => s + d.heavyReps, 0);
    return {
      weekStart: w.weekStart, goalKey, goalByCoach: !!blk?.goalByCoach, scheme, hasGame, days,
      weekHeavyReps: hasGame || days.length ? weekHeavyReps : NO_MATCH_WEEK_HEAVY_TOTAL[season],
      defaultPlan: !hasGame && eff.isDefault,
      cite: `${scheme.cite} · ${WEEK_RULE_CITE}`,
    };
  });
}

/** The first part of a block scheme ("3–4 × 8–12, moderate load…" → "3–4 × 8–12") for a one-line read. */
export function schemeHead(scheme: string): string {
  return scheme.split(/,| — /)[0].trim();
}
