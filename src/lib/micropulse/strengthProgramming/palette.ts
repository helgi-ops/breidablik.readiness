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
  | "isometric";            // overcoming / yielding isometrics for strength / RFD / PAP

// The slots the coach curates and the engine builds from — the "primary" power +
// lower-body strength lifts, plus isometrics for max-strength/RFD and PAP priming
// (Oranchuk 2023, Krzysztofik 2023). The injury-prevention posterior/adductor
// blocks (Nordic van Dyk 2019, Copenhagen Harøy 2019) are NON-NEGOTIABLE and are
// never palette-driven, so they are deliberately not a slot.
export const PALETTE_SLOTS: PaletteSlot[] = ["power_explosive", "bilateral_strength", "unilateral_strength", "isometric"];

/** Which library categories each slot draws from (also validates the coach's pick). */
export const SLOT_CATEGORIES: Record<PaletteSlot, ExerciseCategory[]> = {
  power_explosive: ["EXPLOSIVE_OLYMPIC", "PLYOMETRIC", "BALLISTIC", "MED_BALL"],
  bilateral_strength: ["COMPOUND_STRENGTH"],
  unilateral_strength: ["UNILATERAL_STRENGTH"],
  isometric: ["ISOMETRIC_MAX", "ISOMETRIC_LONG"],
};

export const SLOT_LABEL: Record<PaletteSlot, { en: string; is: string }> = {
  power_explosive: { en: "Power / explosive (primary)", is: "Afl / sprengikraftur (aðal)" },
  bilateral_strength: { en: "Bilateral strength (lower / compound)", is: "Tvíhliða styrkur (neðri / samsettur)" },
  unilateral_strength: { en: "Unilateral strength (lower)", is: "Einhliða styrkur (neðri)" },
  isometric: { en: "Isometric (strength / RFD / PAP)", is: "Ísómetrísk (styrkur / RFD / PAP)" },
};

/** Persisted shape (teams.… jsonb): slot → chosen exercise ids. */
export type PaletteSlots = Partial<Record<PaletteSlot, string[]>>;

export const isPaletteSlot = (s: string): s is PaletteSlot => (PALETTE_SLOTS as string[]).includes(s);

/** Library exercises eligible for a slot (for the coach's picker). */
export function exercisesForSlot(slot: PaletteSlot): Exercise[] {
  const cats = new Set<ExerciseCategory>(SLOT_CATEGORIES[slot]);
  return EXERCISE_LIBRARY.filter((e) => cats.has(e.category));
}

/** Reverse of SLOT_CATEGORIES — which palette slot a library category feeds
 *  (used by the engine to substitute a template exercise from the coach's pool).
 *  Categories not owned by any slot (MOVEMENT_PREP, ISOMETRIC_*, MOBILITY) → null. */
export function slotForCategory(cat: ExerciseCategory): PaletteSlot | null {
  for (const slot of PALETTE_SLOTS) {
    if (SLOT_CATEGORIES[slot].includes(cat)) return slot;
  }
  return null;
}

/** L/R asymmetry (%) at or above which the engine prefers a UNILATERAL lower-body
 *  lift (to load the weaker side) over a bilateral one. Bishop 2020 flags ~10-15%
 *  inter-limb asymmetry as performance/injury-relevant. */
export const PALETTE_UNILATERAL_ASYMMETRY_PCT = 10;

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
