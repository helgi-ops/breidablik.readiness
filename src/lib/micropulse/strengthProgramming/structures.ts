/**
 * Session STRUCTURES (training methods) the coach can tie to each MD day.
 *
 * Today the method per MD day is hard-coded in the engine (MD-3 = French
 * Contrast, MD-4 = cluster …). This lets a coach pick the method per MD day
 * instead; the engine then lays out the team PALETTE exercises in that method's
 * block shape at the correct MD dose. When a team has NOT chosen a structure for
 * a day, the engine falls back to the built-in template unchanged (zero drift).
 *
 * The strength/power methods are offered on the two days that carry real strength
 * / power work — MD-4 and MD-3. MD-2 (activation), MD-1 (neural primer) and MD+1
 * (recovery) keep their fixed, safe templates by design: those are taper days
 * where the LOAD is dictated by the match countdown, not the training method, and
 * the exercises that fit them aren't dosed for heavy methods anyway. Each method
 * reuses the existing structure library's how-to + citations via `howToKey`.
 * Pure — no DB.
 */
import type { MdContext } from "./types";

export type StructureKey =
  | "cluster"          // one main lift, cluster sets (Tufano 2017)
  | "straight_sets"    // one main lift, traditional straight sets
  | "contrast"         // heavy strength paired with a matched plyometric
  | "french_contrast"; // 4-part complex: heavy → plyo → loaded jump → med-ball (Liu 2023)

export const STRUCTURE_KEYS: StructureKey[] = ["cluster", "straight_sets", "contrast", "french_contrast"];

export const STRUCTURE_LABEL: Record<StructureKey, { en: string; is: string }> = {
  cluster: { en: "Cluster sets", is: "Cluster sett" },
  straight_sets: { en: "Straight sets", is: "Bein sett" },
  contrast: { en: "Contrast (strength + plyo)", is: "Contrast (styrkur + plyo)" },
  french_contrast: { en: "French contrast (complex)", is: "French contrast (komplex)" },
};

/** Structure library id whose how-to + citations best matches this method
 *  (reused by the player card + coach card "how to perform"). */
export const STRUCTURE_HOWTO_KEY: Record<StructureKey, string> = {
  cluster: "tufano-cs2",
  straight_sets: "tufano-standard",
  contrast: "supersets-lower-upper",
  french_contrast: "french-contrast",
};

/** Which methods are sensible (and correctly dosable) on each MD day. Only the
 *  two strength/power days are configurable; MD-2 / MD-1 / MD+1 keep their fixed
 *  template. */
export const STRUCTURES_ALLOWED_BY_MD: Partial<Record<MdContext, StructureKey[]>> = {
  "MD-4": ["cluster", "straight_sets", "contrast", "french_contrast"],
  "MD-3": ["french_contrast", "contrast", "cluster", "straight_sets"],
};

/** What each configurable MD day does today (the engine default when the coach
 *  hasn't chosen — the fast-path stays on the built-in template). */
export const DEFAULT_STRUCTURE_BY_MD: Partial<Record<MdContext, StructureKey>> = {
  "MD-4": "cluster",
  "MD-3": "french_contrast",
};

/** Persisted shape (team_strength_palette.md_structures jsonb): MD day → method. */
export type MdStructures = Partial<Record<MdContext, StructureKey>>;

export const isStructureKey = (s: string): s is StructureKey => (STRUCTURE_KEYS as string[]).includes(s);

/** Keep only valid MD→method entries whose method is allowed for that MD day. */
export function sanitizeMdStructures(raw: unknown): MdStructures {
  const out: MdStructures = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [md, allowed] of Object.entries(STRUCTURES_ALLOWED_BY_MD)) {
    const val = (raw as Record<string, unknown>)[md];
    if (typeof val === "string" && isStructureKey(val) && allowed?.includes(val)) {
      out[md as MdContext] = val;
    }
  }
  return out;
}
