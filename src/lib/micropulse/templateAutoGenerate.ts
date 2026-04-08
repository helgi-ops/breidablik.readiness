/**
 * templateAutoGenerate.ts
 *
 * Generates YELLOW and RED microdose template variants from a GREEN template.
 *
 * Rules:
 *   GREEN → YELLOW  1–2 færri sett en GREEN. Sama uppbygging, minna magn.
 *   GREEN → RED     Aðeins upphitun + ISO + core. Engar lyftur, engin hopp.
 */

export type TemplateBlock = {
  block: string;
  items: string[];
  rest_between_sets?: string;
  rest_between_rounds?: string;
};

export type TemplateRecord = {
  md_day: string;
  readiness_level: "GREEN" | "GREEN_PLUS" | "YELLOW" | "RED";
  title: string;
  description?: string;
  structure: TemplateBlock[];
  variant: string;
};

// ── Keyword helpers ───────────────────────────────────────────────────────────

const WARMUP_KEYWORDS   = ["upphitun", "warmup", "warm-up", "activation", "virkjun"];
const COOLDOWN_KEYWORDS = ["niðurlag", "cooldown", "cool-down", "teygjur", "stretch"];
const ISO_KEYWORDS      = ["iso", "isometric", "isometrics"];
const CORE_KEYWORDS     = ["kjarni", "core", "magi", "kviður", "pallof", "dead bug", "plank"];

function blockIs(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

function anyItemIs(items: string[], keywords: string[]): boolean {
  return items.some((item) => blockIs(item, keywords));
}

function swapEmoji(title: string, from: string, to: string): string {
  if (title.includes(from)) return title.replace(from, to);
  return to + " " + title;
}

// ── Volume reduction: always subtract 1–2 sets ─────────────────────────────

/** Reduce every set count by 1–2: 5→3, 4→2, 3→2, 2→1. Never below 1. */
function reduceSets(item: string): string {
  // Don't touch metadata lines (rest, VBT, instructions)
  const l = item.toLowerCase();
  if (/^(hvíld|rest|\d+\s*(mín|min|sek|sec)\s*(hvíld|rest)|ef |markmið|stopp|───)/i.test(l)) return item;
  if (/velocity|m\/s|hraðamarkmið|hraðaþröskuldur|hraðatap|VT:/i.test(item)) return item;
  if (/^\d+\s*(umferð|round|hring|cluster)/i.test(l)) {
    // Reduce round counts too
    return item
      .replace(/\b5\b/, "3").replace(/\b4\b/, "3").replace(/\b3\b/, "2");
  }

  return item
    // "5×" → "3×", "4×" → "2×", "3×" → "2×"
    .replace(/\b6\s*[×x]/g, "4×").replace(/\b5\s*[×x]/g, "3×")
    .replace(/\b4\s*[×x]/g, "2×").replace(/\b3\s*[×x]/g, "2×")
    // "5 sett" → "3 sett", "4 sett" → "3 sett", "3 sett" → "2 sett"
    .replace(/\b6\s*sett/gi, "4 sett").replace(/\b5\s*sett/gi, "3 sett")
    .replace(/\b4\s*sett/gi, "3 sett").replace(/\b3\s*sett/gi, "2 sett")
    // Same for "sets"
    .replace(/\b6\s*sets/gi, "4 sets").replace(/\b5\s*sets/gi, "3 sets")
    .replace(/\b4\s*sets/gi, "3 sets").replace(/\b3\s*sets/gi, "2 sets");
}

// ── GREEN → YELLOW ────────────────────────────────────────────────────────────
//
// Regla: Sama uppbygging og GREEN, en 1–2 færri sett í hverri æfingu.
// Allt annað helst óbreytt (VBT, hvíld, æfingaval).

export function generateYellow(green: TemplateRecord): TemplateRecord {
  const title = swapEmoji(green.title, "🟢", "🟡")
    .replace("Green+", "Reduced")
    .replace("Green", "Reduced");

  const structure = green.structure.map((block): TemplateBlock => {
    // Warmup + cooldown: unchanged
    if (blockIs(block.block, WARMUP_KEYWORDS) || blockIs(block.block, COOLDOWN_KEYWORDS)) {
      return { ...block };
    }

    // Everything else: reduce sets by 1–2
    return {
      ...block,
      items: block.items.map(reduceSets),
      rest_between_rounds: block.rest_between_rounds
        ? reduceSets(block.rest_between_rounds)
        : undefined,
    };
  });

  return {
    ...green,
    readiness_level: "YELLOW",
    title,
    description: "Reduced dose — 1–2 færri sett en GREEN. Sama uppbygging.",
    structure,
  };
}

// ── GREEN → RED ───────────────────────────────────────────────────────────────
//
// Regla: Aðeins upphitun + ISO + core. Allt annað fellur brott.

const DEFAULT_RED_ISO_BLOCK: TemplateBlock = {
  block: "B. ISO Circuit",
  items: [
    "ISO hamstring (short range) — 2 × 20–30 sek / fót",
    "ISO adductor / Copenhagen — 2 × 20–30 sek / fót",
    "ISO calf / ankle — 2 × 20–30 sek",
    "Öndun: 4–7–8 box breathing í 2 mín",
  ],
  rest_between_rounds: "1–2 umferðir",
};

const DEFAULT_CORE_BLOCK: TemplateBlock = {
  block: "C. Core — Létt",
  items: [
    "Pallof Press 2×8/hlið",
    "Dead bug 2×8",
    "Copenhagen plank 2×15s/hlið",
  ],
};

export function generateRed(green: TemplateRecord): TemplateRecord {
  const title = swapEmoji(green.title, "🟢", "🔴")
    .replace("Green+", "ISO + Core")
    .replace("Green", "ISO + Core");

  // Keep warmup (strip explosive drills like A-skip, ankle hops)
  const warmupBlocks = green.structure
    .filter((b) => blockIs(b.block, WARMUP_KEYWORDS))
    .map((b) => ({
      ...b,
      items: b.items.filter((item) => {
        const l = item.toLowerCase();
        return !/sprint|sprettur|a-skip|ankle hop|hopp|jump|pogo/i.test(l);
      }),
    }));

  // Keep existing ISO blocks
  const isoBlocks = green.structure
    .filter((b) => blockIs(b.block, ISO_KEYWORDS))
    .filter((b) => !blockIs(b.block, WARMUP_KEYWORDS));

  // Keep existing core blocks (reduced)
  const coreBlocks = green.structure
    .filter((b) => blockIs(b.block, CORE_KEYWORDS) || anyItemIs(b.items, CORE_KEYWORDS))
    .filter((b) => !blockIs(b.block, WARMUP_KEYWORDS) && !blockIs(b.block, ISO_KEYWORDS))
    .map((b) => ({
      ...b,
      items: b.items.map(reduceSets),
    }));

  // Keep cooldown
  const cooldownBlocks = green.structure
    .filter((b) => blockIs(b.block, COOLDOWN_KEYWORDS));

  const structure: TemplateBlock[] = [
    ...(warmupBlocks.length > 0
      ? warmupBlocks
      : [{
          block: "A. Upphitun (létt)",
          items: [
            "Hjólreiðar / Röðull 5 mín létt",
            "Hip bridge 2×8",
            "World's greatest stretch 2×5/hlið",
          ],
        }]),
    ...(isoBlocks.length > 0 ? isoBlocks : [DEFAULT_RED_ISO_BLOCK]),
    ...(coreBlocks.length > 0 ? coreBlocks : [DEFAULT_CORE_BLOCK]),
    ...cooldownBlocks,
  ];

  return {
    ...green,
    readiness_level: "RED",
    title,
    description: "Aðeins upphitun, ISO og core. Engar lyftur, engin hopp.",
    structure,
  };
}

// ── Slug helper ───────────────────────────────────────────────────────────────

export function buildTableName(setName: string, sport: string, gender?: string | null): string {
  const slugify = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/þ/gi, "th")
      .replace(/ð/gi, "d")
      .replace(/æ/gi, "ae")
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();

  const genderSlug = gender === "M" ? "karlar" : gender === "F" ? "konur" : null;
  const parts = [slugify(setName), slugify(sport)];
  if (genderSlug) parts.push(genderSlug);
  parts.push("microdose_templates");
  return parts.join("_");
}
