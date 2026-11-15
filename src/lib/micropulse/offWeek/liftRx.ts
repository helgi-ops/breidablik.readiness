/**
 * "All the details" for the off-week / bridge plan's strength lifts.
 *
 * The plan carries each lift as data (`OffWeekLift`, plan.ts); this hands it to the same table builder
 * as Today, the PT plans and Start session (rxForPtLift → rxForTodayItem), so a lift reads the same
 * everywhere. The plan's own numbers win (sets × reps, RPE, ~kg, "controlled" / "fast intent"); the
 * lift's library profile only fills lines the plan says nothing about. Pure, computed on read, never stored.
 */
import type { LiftRx } from "@/lib/micropulse/goalPlan/liftRx";
import { rxForPtLift } from "@/lib/micropulse/strengthProgramming/ptLiftRx";
import type { OffWeekLift } from "./plan";

type WithLifts = { lifts?: OffWeekLift[] | null };

export function rxForOffWeekLift(l: OffWeekLift, lang: "EN" | "IS"): LiftRx | null {
  const method = [l.rpe ? `RPE ${l.rpe}` : null, l.cue ?? null].filter(Boolean).join(" · ") || null;
  return rxForPtLift({
    name: l.name,
    sets: l.sets,
    reps: l.reps,
    targetKg: l.kg != null && l.kg > 0 ? l.kg : null,
    method,
  }, lang);
}

/** Tables for one block's lifts (none for a run / rest block or a plan sent before lifts were stored). */
export function rxForOffWeekBlock(b: object, lang: "EN" | "IS"): LiftRx[] {
  return ((b as WithLifts).lifts ?? []).map((l) => rxForOffWeekLift(l, lang)).filter((r): r is LiftRx => r != null);
}

/** The strength lifts of a plan (every strength day uses the same blocks), for the coach's preview. */
export function rxForOffWeekPlan(plan: { days: Array<{ blocks: object[] }> }, lang: "EN" | "IS"): LiftRx[] {
  const day = plan.days.find((d) => d.blocks.some((b) => (b as WithLifts).lifts?.length));
  return day ? day.blocks.flatMap((b) => rxForOffWeekBlock(b, lang)) : [];
}
