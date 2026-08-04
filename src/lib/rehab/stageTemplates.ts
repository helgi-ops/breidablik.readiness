/**
 * Rehab library ↔ staged-module linkage — single source of truth.
 *
 * Two rehab systems live side by side:
 *   • the `/coach/templates` library (`workout_templates`, category='rehab') —
 *     the detailed per-phase A/B gym sessions the player actually does; and
 *   • the staged-loading modules (`/coach/<injury>` pages) — the clinical brain
 *     that decides which stage the player is in (pain gate / force-plate gate).
 *
 * This map wires them together: each `workout_templates.code` belongs to one
 * module + one of that module's four stages. The module pages use STAGE_CODES to
 * surface the matching sessions per stage; the library page uses
 * REHAB_MODULE_BY_PREFIX to link each rehab card back to its governing module.
 */

export type ModuleRegion = "patellar" | "achilles" | "adductor" | "ankle" | "hamstring";
export type StageId = "s1" | "s2" | "s3" | "s4";

/** Short stage label for the assignment's program name ("<Module> — Stage 2"). */
export const STAGE_LABEL: Record<StageId, string> = { s1: "Stage 1", s2: "Stage 2", s3: "Stage 3", s4: "Stage 4" };

/** Governing module for a workout_templates code, matched by code prefix. */
export type RehabModule = { region: ModuleRegion; href: string; label: string };

// Ordered longest-prefix-first so TENDON_ISO_PATELLAR wins over any short prefix.
const MODULE_PREFIXES: { prefix: string; module: RehabModule }[] = [
  { prefix: "TENDON_ISO_PATELLAR", module: { region: "patellar", href: "/coach/jumpers-knee", label: "Jumper's Knee" } },
  { prefix: "PATELLAR_", module: { region: "patellar", href: "/coach/jumpers-knee", label: "Jumper's Knee" } },
  { prefix: "ACHILLES_", module: { region: "achilles", href: "/coach/achilles-tendinopathy", label: "Achilles Tendinopathy" } },
  { prefix: "ADDUCTOR_", module: { region: "adductor", href: "/coach/adductor-groin", label: "Adductor / Groin" } },
  { prefix: "ANK-", module: { region: "ankle", href: "/coach/ankle-sprain", label: "Ankle Sprain" } },
  { prefix: "HAM_", module: { region: "hamstring", href: "/coach/hamstring-rehab", label: "Hamstring Rehab" } },
];

/** The module that governs a library template code, or null (e.g. CALF_* has no module page yet). */
export function rehabModuleForCode(code: string | null | undefined): RehabModule | null {
  if (!code) return null;
  const up = code.toUpperCase();
  for (const { prefix, module } of MODULE_PREFIXES) {
    if (up.startsWith(prefix)) return module;
  }
  return null;
}

/** workout_templates codes that belong to each module stage (s1–s4). Empty = honest gap. */
export const STAGE_CODES: Record<ModuleRegion, Record<StageId, string[]>> = {
  patellar: {
    s1: ["PATELLAR_STAGE1_A", "PATELLAR_STAGE1_B", "TENDON_ISO_PATELLAR"],
    s2: ["PATELLAR_STAGE2_A", "PATELLAR_STAGE2_B"],
    s3: [],
    s4: [],
  },
  achilles: {
    s1: ["ACHILLES_P1_A", "ACHILLES_P1_B"],
    s2: ["ACHILLES_P2_A", "ACHILLES_P2_B", "ACHILLES_P3_A"],
    s3: ["ACHILLES_P3_B"],
    s4: ["ACHILLES_P4_A", "ACHILLES_P4_B"],
  },
  adductor: {
    s1: ["ADDUCTOR_ISO_A", "ADDUCTOR_ISO_B", "ADDUCTOR_ACUTE_A", "ADDUCTOR_ACUTE_B"],
    s2: ["ADDUCTOR_COND_A", "ADDUCTOR_COND_B"],
    s3: ["ADDUCTOR_SPORT_A", "ADDUCTOR_SPORT_B"],
    s4: ["ADDUCTOR_RTS_A", "ADDUCTOR_RTS_B"],
  },
  ankle: {
    s1: ["ANK-REHAB-S1"],
    s2: ["ANK-REHAB-S2"],
    s3: ["ANK-REHAB-S3"],
    s4: ["ANK-REHAB-S4", "ANK-PREVENT"],
  },
  hamstring: {
    s1: ["HAM_P1_A", "HAM_P1_B"],
    s2: ["HAM_P2_A", "HAM_P2_B"],
    s3: ["HAM_P3_A", "HAM_P3_B"],
    s4: [],
  },
};

/**
 * Library-page grouping: derive the injury family + a stage sort-order from a
 * code, so the ~40 rehab rows read as per-injury sequences instead of an
 * alphabetised dump. Unknown families sort last, keyed by their code.
 */
export function rehabFamily(code: string | null | undefined): string {
  const m = rehabModuleForCode(code);
  if (m) return m.label;
  const up = (code ?? "").toUpperCase();
  if (up.startsWith("CALF")) return "Calf Strain";
  return "Other rehab";
}

/** Rough stage order (1–5) parsed from the code, for sorting within a family. */
export function rehabStageOrder(code: string | null | undefined): number {
  const up = (code ?? "").toUpperCase();
  const m = up.match(/(?:STAGE|_P|_S|-S)(\d)/) ?? up.match(/(?:ACUTE)/) ?? null;
  if (up.includes("PREVENT")) return 9; // prevention/maintenance sorts to the end
  if (up.includes("ACUTE")) return 1;
  if (up.includes("COND")) return 2;
  if (up.includes("SPORT")) return 3;
  if (up.includes("RTS")) return 4;
  if (m && m[1]) return Number(m[1]);
  if (up.includes("ISO") || up.includes("TENDON")) return 1;
  return 5;
}
