/**
 * Note Parser — extract structured contraindications from free-text
 * wellness notes that players write in the daily check-in.
 *
 * This is the deterministic answer to the question "why should we need
 * an AI button to read a comment?". For ~80% of cases, simple keyword
 * matching catches the same signal — if a player writes "mjóhrygg
 * stífur eftir leik" the engine should detect that without an LLM call.
 *
 * Bilingual: parses Icelandic and English keywords side-by-side, since
 * Breiðablik players write in Icelandic and other pilot teams may write
 * in English. Each pattern returns a `ContraIndication` that feeds into
 * the existing adaptation rules in adaptationRules.ts — no new rules
 * needed, the parser is a TRANSLATOR from prose to the structured
 * `wellness.soreAreas` array the engine already understands.
 *
 * The LLM Refinement button remains for cases the keyword set misses
 * (complex multi-sentence notes, indirect language, multi-day patterns).
 */

import type { ContraIndication } from "./types";

/** A keyword pattern. `match` is a list of substrings (case-insensitive).
 *  Any match triggers the contraindication. */
type Pattern = {
  contraindication: ContraIndication;
  /** Icelandic keywords */
  is: string[];
  /** English keywords */
  en: string[];
  /** A human-readable label used in audit trail. */
  label: string;
};

const PATTERNS: Pattern[] = [
  // ── HAMSTRING ────────────────────────────────────────────────────────
  {
    contraindication: "sore_hamstrings",
    label: "Sore hamstrings (note)",
    is: ["hamstring", "hamstr", "aftan á læri", "aftan á lærum", "leggvöðva aftan"],
    en: ["hamstring", "hammie", "back of thigh", "back of leg"],
  },
  // ── LOWER BACK ───────────────────────────────────────────────────────
  {
    contraindication: "sore_lower_back",
    label: "Sore lower back (note)",
    is: ["mjóhrygg", "mjóbak", "lendarhrygg", "neðan í baki", "neðri hluti baks"],
    en: ["lower back", "lumbar", "low back", "lower spine"],
  },
  // ── QUADS ────────────────────────────────────────────────────────────
  {
    contraindication: "sore_quads",
    label: "Sore quads (note)",
    is: ["quad", "framan á læri", "framan á lærum", "lærvöðva framan", "fjórhöfða"],
    en: ["quad", "quads", "front of thigh", "front of leg", "rectus"],
  },
  // ── GROIN ────────────────────────────────────────────────────────────
  {
    contraindication: "sore_groin",
    label: "Sore groin (note)",
    is: ["nár", "náran", "innan á læri", "innanlæri", "adduktor"],
    en: ["groin", "adductor", "inner thigh"],
  },
  // ── KNEE INJURY (more cautious than soreness) ────────────────────────
  {
    contraindication: "knee_injury",
    label: "Knee pain / injury (note)",
    is: ["hné meidd", "hné meiðsl", "hnémeiðsl", "hné verk", "hnéverkur"],
    en: ["knee injury", "knee pain", "knee tweak", "knee strain"],
  },
  // ── ANKLE INJURY ─────────────────────────────────────────────────────
  {
    contraindication: "ankle_injury",
    label: "Ankle pain / injury (note)",
    is: ["öklameiðsl", "ökla meidd", "ökla verkur", "öklasnúningur", "öklatognun"],
    en: ["ankle injury", "ankle pain", "rolled ankle", "ankle sprain", "twisted ankle"],
  },
  // ── SHOULDER ─────────────────────────────────────────────────────────
  {
    contraindication: "shoulder_injury",
    label: "Shoulder pain / injury (note)",
    is: ["axlarmeiðsl", "axlar verkur", "öxl meidd"],
    en: ["shoulder injury", "shoulder pain", "shoulder tweak"],
  },
  // ── HAMSTRING TWEAK / STRAIN (specific) ──────────────────────────────
  {
    contraindication: "hamstring_injury",
    label: "Hamstring strain / tweak (note)",
    is: ["hamstring tognun", "hamstring meiðsl", "togn í hamstring", "tognaði hamstring"],
    en: ["hamstring strain", "hamstring tweak", "pulled hamstring", "tweaked hammie"],
  },
  // ── GROIN STRAIN ─────────────────────────────────────────────────────
  {
    contraindication: "groin_injury",
    label: "Groin strain (note)",
    is: ["nára meiðsl", "togn í nára", "tognaði nára"],
    en: ["groin strain", "groin tweak", "pulled groin"],
  },
];

/** Soreness intensifiers that should boost confidence for any matched
 *  contraindication. Used in audit messages — not in the actual gating. */
const SORENESS_INTENSIFIERS_IS = ["mjög", "rosalega", "stíf", "stíft", "stífur", "verkur", "verkir", "sár", "sárindi", "tognun"];
const SORENESS_INTENSIFIERS_EN = ["very", "really", "stiff", "tight", "pain", "sharp", "tweak", "strain"];

export type NoteContraindication = {
  contraindication: ContraIndication;
  label: string;
  intensified: boolean;
  matchedText: string;
};

/** Parse a free-text note (Icelandic or English) and return any
 *  contraindications it implies. Empty array for empty/null/short notes. */
export function parseWellnessNote(note: string | null | undefined): NoteContraindication[] {
  if (!note) return [];
  const text = note.trim().toLowerCase();
  if (text.length < 3) return [];

  const out: NoteContraindication[] = [];
  const seen = new Set<ContraIndication>();

  for (const p of PATTERNS) {
    const allKeywords = [...p.is, ...p.en].map((k) => k.toLowerCase());
    const hit = allKeywords.find((kw) => text.includes(kw));
    if (!hit || seen.has(p.contraindication)) continue;
    const intensifiers = [...SORENESS_INTENSIFIERS_IS, ...SORENESS_INTENSIFIERS_EN].map((s) => s.toLowerCase());
    // Look for intensifiers within 25 chars of the match
    const idx = text.indexOf(hit);
    const window = text.slice(Math.max(0, idx - 25), Math.min(text.length, idx + hit.length + 25));
    const intensified = intensifiers.some((iw) => window.includes(iw));
    out.push({
      contraindication: p.contraindication,
      label: p.label,
      intensified,
      matchedText: hit,
    });
    seen.add(p.contraindication);
  }

  return out;
}

/** Merge note-derived contraindications into the structured sore_areas
 *  array that the adaptation rules already read. Returns the union as
 *  a string[] suitable for snapshot.wellness.soreAreas. */
export function mergeNoteIntoSoreAreas(
  soreAreasFromCheckbox: string[],
  parsedFromNote: NoteContraindication[],
): string[] {
  const merged = new Set<string>(soreAreasFromCheckbox.map((s) => String(s).toLowerCase()));
  for (const p of parsedFromNote) {
    switch (p.contraindication) {
      case "sore_hamstrings":
      case "hamstring_injury":
        merged.add("hamstrings");
        break;
      case "sore_lower_back":
        merged.add("lower_back");
        break;
      case "sore_quads":
        merged.add("quads");
        break;
      case "sore_groin":
      case "groin_injury":
        merged.add("groin");
        break;
      case "knee_injury":
        merged.add("knee");
        break;
      case "ankle_injury":
        merged.add("ankle");
        break;
      case "shoulder_injury":
        merged.add("shoulder");
        break;
      default:
        break;
    }
  }
  return Array.from(merged);
}
