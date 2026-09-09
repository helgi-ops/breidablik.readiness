/**
 * Team strength palette — the per-slot exercise pool a coach picks so the
 * INDIVIDUALISED / auto session builds from THEIR chosen exercises (the coach
 * enters the "standard" session by hand). The engine then individualises within
 * the palette: symmetry chooses unilateral vs bilateral lower-body, the ledger
 * adds emphasis, readiness / MD tune the dose. Shared by the config UI, the
 * settings endpoint and the engine so the vocabulary never drifts. Pure — no DB.
 */
import { EXERCISE_LIBRARY } from "./exerciseLibrary";
import type { Exercise, ExerciseCategory } from "./types";

export type PaletteSlot =
  | "power_explosive"       // MD-3 primary: jumps / olympic / ballistic / med-ball
  | "bilateral_strength"    // main bilateral lower/compound lift (squat / DL / hip thrust)
  | "unilateral_strength"   // main unilateral lower lift (split squat / B-stance RDL)
  | "posterior_accessory";  // posterior-chain + accessory

export const PALETTE_SLOTS: PaletteSlot[] = ["power_explosive", "bilateral_strength", "unilateral_strength", "posterior_accessory"];

/** Which library categories each slot draws from (also validates the coach's pick). */
export const SLOT_CATEGORIES: Record<PaletteSlot, ExerciseCategory[]> = {
  power_explosive: ["EXPLOSIVE_OLYMPIC", "PLYOMETRIC", "BALLISTIC", "MED_BALL"],
  bilateral_strength: ["COMPOUND_STRENGTH"],
  unilateral_strength: ["UNILATERAL_STRENGTH"],
  posterior_accessory: ["POSTERIOR_CHAIN", "ADDUCTOR", "ACCESSORY"],
};

export const SLOT_LABEL: Record<PaletteSlot, { en: string; is: string }> = {
  power_explosive: { en: "Power / explosive (primary)", is: "Afl / sprengikraftur (aðal)" },
  bilateral_strength: { en: "Bilateral strength (lower / compound)", is: "Tvíhliða styrkur (neðri / samsettur)" },
  unilateral_strength: { en: "Unilateral strength (lower)", is: "Einhliða styrkur (neðri)" },
  posterior_accessory: { en: "Posterior chain / accessory", is: "Aftari keðja / auka" },
};

/** Persisted shape (teams.… jsonb): slot → chosen exercise ids. */
export type PaletteSlots = Partial<Record<PaletteSlot, string[]>>;

export const isPaletteSlot = (s: string): s is PaletteSlot => (PALETTE_SLOTS as string[]).includes(s);

/** Library exercises eligible for a slot (for the coach's picker). */
export function exercisesForSlot(slot: PaletteSlot): Exercise[] {
  const cats = new Set<ExerciseCategory>(SLOT_CATEGORIES[slot]);
  return EXERCISE_LIBRARY.filter((e) => cats.has(e.category));
}

/** Keep only valid ids that belong to the slot's categories (defensive on save + read). */
export function sanitizePaletteSlots(raw: unknown): PaletteSlots {
  const out: PaletteSlots = {};
  if (!raw || typeof raw !== "object") return out;
  for (const slot of PALETTE_SLOTS) {
    const ids = (raw as Record<string, unknown>)[slot];
    if (!Array.isArray(ids)) continue;
    const eligible = new Set(exercisesForSlot(slot).map((e) => e.id));
    const kept = ids.map(String).filter((id) => eligible.has(id));
    if (kept.length) out[slot] = [...new Set(kept)];
  }
  return out;
}

/** True when the palette has at least the power + a lower-body (uni or bi) lift —
 *  enough for the engine to build an individualised session from it. */
export function paletteIsUsable(slots: PaletteSlots): boolean {
  const hasPower = !!slots.power_explosive?.length;
  const hasLower = !!slots.bilateral_strength?.length || !!slots.unilateral_strength?.length;
  return hasPower || hasLower;
}
