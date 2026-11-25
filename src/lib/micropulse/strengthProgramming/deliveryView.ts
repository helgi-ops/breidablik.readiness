/**
 * What the Meso pages and Micro show about the strength session (2026-11-25). Pure and client-safe.
 *
 * The team's send mode (`teams.strength_send_mode`, sendMode.ts) decides what the players get:
 *   standard              → the team's Custom Programme, by MD day (basketball: by weekday). The Meso strength line
 *                           (block goal, %1RM, heavy reps) and Micro's strength focus are not what is sent.
 *   individualised        → each player's own session from the block, the MD day and the team palette (as shown).
 *   individualised_goals  → the same, and in pre-/off-season the players' goals add to it (playerGoal.ts: +1 set of
 *                           Nordics on the heavy day; goalPlan gym lifts). In season the session is maintenance and the
 *                           goal plans wait for the next pre-season (goalPlan/seasonPause.ts, GOAL_PLAN_PAUSED_IN_SEASON).
 *
 * Display only: no numbers or rules change here. The programme rows come from GET /api/coach/strength-delivery.
 */

import { SEND_MODE_TEXT, type SendMode } from "./sendMode";

export type Bi = { en: string; is: string };

/** One week's Custom Programme read (only filled in standard mode). */
export type DeliveryWeek = {
  weekStart: string;
  /** The week's season phase, as the player's Today reads its programme with (saved, else the season plan's). */
  phase: string;
  /** The team programme that covers the week (a dated block, else the recurring set); null = none. */
  programme: { setName: string; tableName: string } | null;
  /** MD day (football) or weekday code (basketball) → the session title, from the programme's GREEN rows. */
  slots: Record<string, string>;
};

export type StrengthDelivery = { teamId: string; mode: SendMode; isBasketball: boolean; weeks: DeliveryWeek[] };

/** Basketball keys its programme by weekday (Mon = 0), the same codes as the player's Today. */
export const BB_WEEKDAY_CODES = ["MÁN", "ÞRI", "MIÐ", "FIM", "FÖS", "LAU", "SUN"] as const;

/**
 * The programme's session for one day: the MD day's row (football) or the weekday's (basketball), else the
 * programme's GENERIC row — the same rows the player's coverage check looks for. null = nothing for the day.
 */
export function programmeTitle(week: DeliveryWeek | null | undefined, slot: string | null | undefined): string | null {
  if (!week?.programme) return null;
  return (slot ? week.slots[slot] : undefined) ?? week.slots.GENERIC ?? null;
}

/** Does the programme have any session for this week's phase? */
export function programmeCovers(week: DeliveryWeek | null | undefined): boolean {
  return !!week?.programme && Object.keys(week.slots).length > 0;
}

/** "Strength: Standard (Custom Programme)" — the chip on Meso and Micro. */
export function sendModeChip(mode: SendMode, is: boolean): string {
  const l = SEND_MODE_TEXT[mode].label;
  return `${is ? "Styrkur" : "Strength"}: ${is ? l.is : l.en}`;
}

export type GoalSeason = "build" | "maintain" | "unknown";

/** Pre-/off-season build the goal; in season keeps it. Unknown → the goal step treats it as maintenance. */
export function goalSeasonOfPhase(phase: string | null | undefined): GoalSeason {
  const p = String(phase ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (p === "preseason" || p === "offseason") return "build";
  if (p === "inseason" || p === "competitive" || p === "playoffs") return "maintain";
  return "unknown";
}

/** The goals mode's line for a week in this part of the season. */
export function goalsLine(season: GoalSeason, is: boolean): string {
  if (season === "build") {
    return is
      ? "Leikmenn með markmið: +1 sett af Nordic á þyngsta deginum (Sterkari aftan í læri), og lyftur úr 8 vikna markmiðsáætlun fara inn í æfinguna."
      : "Players with goals: +1 set of Nordics on the heavy day (Stronger hamstrings), and the lifts of an 8-week goal plan go into the session.";
  }
  return is
    ? "Á keppnistímabili er æfingin viðhald: ekkert markmiðssett, og 8 vikna markmiðsáætlanir bíða næsta undirbúningstímabils."
    : "In season the session is maintenance: no goal set, and 8-week goal plans wait for the next pre-season.";
}

/** Standard mode, a week no Custom Programme covers. */
export const NO_PROGRAMME: Bi = {
  en: "No Custom Programme covers this week: players get the built-in template for the MD day (your palette is not used).",
  is: "Ekkert æfingakerfi (Custom Programme) nær yfir þessa viku: leikmenn fá innbyggða sniðmátið fyrir MD-daginn (palette liðsins er ekki notað).",
};

/** Standard mode, next to Micro's strength focus. */
export const STANDARD_FOCUS_NOTE: Bi = {
  en: "Standard: on a day your Custom Programme covers, the MD day picks the session from it. This focus does not change it.",
  is: "Staðlað: á degi sem æfingakerfið nær yfir velur MD-dagurinn æfinguna úr því. Þessi áhersla breytir henni ekki.",
};
