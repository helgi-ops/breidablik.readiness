/**
 * strengthProgramming/toTodayStructure
 *
 * Converts a built `StrengthSession` (the algorithmic, per-player engine behind
 * the coach /coach/strength page) into the SAME card structure the player's
 * Today session card already renders:
 *
 *   [{ block: string, items: [{ name, sets, reps, rest, method, note }] }]
 *
 * This is the bridge that makes "what the coach SENDS = what the player SEES":
 * the send route serializes the session through here and stores it in
 * `player_today_strength_override`; PlayerClient reads that structure and feeds
 * it straight into `buildSessionBlocks` — no new rendering code, zero drift.
 *
 * The session is already tuned to today's readiness/signals inside
 * buildStrengthSession, so the player-side readiness set-reduction must NOT be
 * re-applied on top (the caller passes adjust=null for a coach-sent session).
 */

import type { StrengthSession } from "./types";

/** One item in the Today card structure (matches blockItemToRawString in PlayerClient). */
export type TodayStructureItem = {
  name: string;
  sets?: number | string;
  reps?: string;
  rest?: string;
  method?: string;
  note?: string;
};

export type TodayStructureBlock = {
  block: string;
  items: TodayStructureItem[];
};

/**
 * Serialize a StrengthSession into the player Today card structure.
 * `lang` picks the EN/IS block + exercise names (the rest of the card copy is
 * localized at render time by PlayerClient).
 */
export function strengthSessionToTodayStructure(
  session: StrengthSession,
  lang: "EN" | "IS",
): TodayStructureBlock[] {
  const isIS = lang === "IS";
  return session.blocks
    .filter((b) => b.exercises.length > 0)
    .map((b) => ({
      block: (isIS ? b.titleIS : b.titleEN) || b.titleEN || b.titleIS || "Block",
      items: b.exercises.map((ex) => {
        // The dose "method" line surfaces intensity (RPE / %1RM / %MVC) and any
        // cluster/VBT cue; the modification reason (why this was swapped) rides
        // as the note so the player sees the "why" the manifesto requires.
        const methodBits = [ex.dose.intensity, ex.dose.cue].filter(Boolean).join(" · ");
        const note = ex.modificationReason?.trim() || undefined;
        const item: TodayStructureItem = {
          name: (isIS ? ex.nameIS : ex.nameEN) || ex.nameEN || ex.nameIS,
          sets: ex.dose.sets,
          reps: ex.dose.reps,
          rest: ex.dose.rest,
        };
        if (methodBits) item.method = methodBits;
        if (note) item.note = note;
        return item;
      }),
    }));
}
