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
import { EXERCISES_BY_ID } from "./exerciseLibrary";

/** One item in the Today card structure (matches blockItemToRawString in PlayerClient). */
export type TodayStructureItem = {
  name: string;
  sets?: number | string;
  reps?: string;
  rest?: string;
  method?: string;
  note?: string;
  /** Library exercise id (strength items only) — anchors the player-side swap. */
  exerciseId?: string;
  /** Safe swap options (the exercise's curated `alternatives`, localized) the
   *  player may switch to on the Today card. Absent = no player swap offered. */
  alternatives?: { id: string; name: string }[];
};

export type TodayStructureBlock = {
  block: string;
  items: TodayStructureItem[];
  /** Structure-library id → the block's method how-to (PlayerClient reads it). */
  structureId?: string;
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
  // The coach's whole chosen pool (all slots) — used to restrict a player's safe
  // swaps to exercises the coach actually selected. Empty set = no restriction.
  const palettePool = new Set<string>(Object.values(session.teamPalette ?? {}).flat().filter((x): x is string => typeof x === "string"));

  // Screen-driven correctives lead the session as one movement-prep / activation
  // block (name + dose + cue→method + source→note) — the same item shape, so the
  // whole session is ONE structure and PlayerClient renders it with no new code.
  const correctiveBlock: TodayStructureBlock[] = (session.correctives?.length)
    ? [{
        block: isIS ? "Corrective (hreyfiskimun)" : "Corrective (movement screen)",
        items: session.correctives.map((c) => {
          const item: TodayStructureItem = { name: (isIS ? c.nameIS : c.nameEN) || c.nameEN };
          const dose = isIS ? c.doseIS : c.doseEN;
          const cue = isIS ? c.cueIS : c.cueEN;
          const note = isIS ? c.sourceNoteIS : c.sourceNoteEN;
          if (dose) item.reps = dose;
          if (cue) item.method = cue;
          if (note) item.note = note;
          return item;
        }),
      }]
    : [];

  const strengthBlocks = session.blocks
    .filter((b) => b.exercises.length > 0)
    .map((b) => ({
      block: (isIS ? b.titleIS : b.titleEN) || b.titleEN || b.titleIS || "Block",
      ...(b.structureId ? { structureId: b.structureId } : {}),
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
        // Stamp the library id + curated safe alternatives so the player can swap
        // this exercise on the Today card (safe options only). Corrective items have
        // no library id, so they carry no swap.
        const lib = EXERCISES_BY_ID.get(ex.exerciseId);
        if (lib) {
          item.exerciseId = lib.id;
          const resolved = (lib.alternatives ?? [])
            .map((id) => EXERCISES_BY_ID.get(id))
            .filter((a): a is NonNullable<typeof a> => !!a && a.id !== lib.id);
          // STRICT palette binding: when the coach has set a pool, only offer
          // alternatives that are IN it — never fall back to the full safe list,
          // or the player would see exercises the coach didn't approve. An empty
          // intersection means "no swap offered" for this item. No pool at all
          // (Lite/unconfigured team) → the full curated safe list.
          const chosen = palettePool.size
            ? resolved.filter((a) => palettePool.has(a.id))
            : resolved;
          const alts = chosen.map((a) => ({ id: a.id, name: (isIS ? a.nameIS : a.nameEN) || a.nameEN }));
          if (alts.length > 0) item.alternatives = alts;
        }
        return item;
      }),
    }));

  return [...correctiveBlock, ...strengthBlocks];
}
