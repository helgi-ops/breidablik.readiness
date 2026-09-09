/**
 * Session STRUCTURES (training methods) the coach can tie to each MD day.
 *
 * Today the method per MD day is hard-coded in the engine (MD-3 = French
 * Contrast, MD-4 = cluster …). This lets a coach pick the method per MD day
 * instead; the engine then lays out the team PALETTE exercises in that method's
 * block shape at the correct MD dose. When a team has NOT chosen a structure for
 * a day, the engine falls back to the built-in template unchanged (zero drift).
 *
 * Two orientations, matched to the match countdown:
 *   - STRENGTH / POWER methods (heavier, potentiating) on MD-4 / MD-3 — cluster,
 *     straight sets, contrast, French contrast.
 *   - VELOCITY / EXPLOSIVE methods (light, fast, PAP) on MD-3 / MD-2 / MD-1 —
 *     a power/velocity contrast and an explosive potentiation cluster. Near the
 *     match the intent is speed, not load, so these deliberately override the dose
 *     to stay light + fast regardless of the day.
 * MD+1 (recovery) keeps its fixed template. Each method reuses the existing
 * structure library's how-to + citations via `howToKey`. Pure — no DB.
 */
import type { MdContext } from "./types";

export type StructureKey =
  | "cluster"                // one main lift, cluster sets (Tufano 2017)
  | "straight_sets"          // one main lift, traditional straight sets
  | "contrast"               // heavy strength paired with a matched plyometric
  | "french_contrast"        // 4-part complex: heavy → plyo → loaded jump → med-ball (Liu 2023)
  | "power_contrast"         // velocity/power contrast: loaded fast lift + plyo (taper days)
  | "potentiation_cluster"   // explosive cluster: fast lift, velocity-based, PAP (taper days)
  | "overcoming_isometric"   // max-strength/RFD: overcoming iso, long length, high intent (Oranchuk 2023)
  | "iso_pap_primer";        // isometric conditioning → explosive: PAP primer (Krzysztofik 2023, Jarosz 2025)

export const STRUCTURE_KEYS: StructureKey[] = ["cluster", "straight_sets", "contrast", "french_contrast", "power_contrast", "potentiation_cluster", "overcoming_isometric", "iso_pap_primer"];

export const STRUCTURE_LABEL: Record<StructureKey, { en: string; is: string }> = {
  cluster: { en: "Cluster sets", is: "Cluster sett" },
  straight_sets: { en: "Straight sets", is: "Bein sett" },
  contrast: { en: "Contrast (strength + plyo)", is: "Contrast (styrkur + plyo)" },
  french_contrast: { en: "French contrast (complex)", is: "French contrast (komplex)" },
  power_contrast: { en: "Contrast (power/velocity)", is: "Contrast (afl/hraði)" },
  potentiation_cluster: { en: "Potentiation cluster (explosive)", is: "Potentiation cluster (sprengikraftur)" },
  overcoming_isometric: { en: "Overcoming isometric (max strength)", is: "Overcoming ísómetría (hámarksstyrkur)" },
  iso_pap_primer: { en: "Isometric PAP primer (explosive)", is: "Ísómetrísk PAP-örvun (sprengikraftur)" },
};

/** Structure library id whose how-to + citations best matches this method
 *  (reused by the player card + coach card "how to perform"). */
export const STRUCTURE_HOWTO_KEY: Record<StructureKey, string> = {
  cluster: "tufano-cs2",
  straight_sets: "tufano-standard",
  contrast: "supersets-lower-upper",
  french_contrast: "french-contrast",
  power_contrast: "pc-french-contrast-style",
  potentiation_cluster: "tufano-cs2",
  overcoming_isometric: "overcoming-isometric",
  iso_pap_primer: "iso-pap-primer",
};

/** Which methods are sensible (and correctly dosable) on each MD day. Strength/
 *  power methods on MD-4 / MD-3; velocity/explosive + isometric-PAP methods on the
 *  taper days. Overcoming isometrics (max strength/RFD) live on the strength days;
 *  the isometric PAP primer potentiates explosive work near the match. MD+1 keeps
 *  its fixed recovery template. */
export const STRUCTURES_ALLOWED_BY_MD: Partial<Record<MdContext, StructureKey[]>> = {
  "MD-4": ["cluster", "straight_sets", "contrast", "french_contrast", "overcoming_isometric"],
  "MD-3": ["french_contrast", "contrast", "cluster", "straight_sets", "power_contrast", "potentiation_cluster", "overcoming_isometric", "iso_pap_primer"],
  "MD-2": ["power_contrast", "potentiation_cluster", "iso_pap_primer"],
  "MD-1": ["power_contrast", "potentiation_cluster", "iso_pap_primer"],
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
