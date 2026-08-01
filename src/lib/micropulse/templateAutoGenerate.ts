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

// ── Volume adjustment: shift set counts, and report whether it changed ────────
//
// The old reducer only matched a few integer formats (5×, "5 sett"), so an
// imported programme with formats like "3–4 × 8–12", "2 sets" or an exercise
// with NO set number left YELLOW identical to GREEN. That must never happen:
// GREEN, YELLOW and GREEN+ must always differ in volume. `adjustSets` handles
// far more formats and returns whether it actually changed anything, so the
// generators can fall back to a structural trim/add when no number was found.

const MIN_SET = 1;
const MAX_SET = 8;
const clampSet = (n: number, delta: number) =>
  Math.max(MIN_SET, Math.min(MAX_SET, n + delta));

/** True for lines that carry no adjustable set count (rest, tempo/velocity, cues). */
function isMetaLine(item: string): boolean {
  const l = item.toLowerCase();
  if (/^(hvíld|rest|\d+\s*(mín|min|sek|sec)\s*(hvíld|rest)|ef |markmið|stopp|───)/i.test(l)) return true;
  if (/velocity|m\/s|hraðamarkmið|hraðaþröskuldur|hraðatap|vt:/i.test(item)) return true;
  return false;
}

/**
 * Shift the FIRST set prescription in a free-text exercise line by `delta`
 * (−1 = lighter, +1 = heavier), clamped to [1, 8]. Handles "N×", "N x",
 * "N sett", "N sets", A–B ranges ("3–4 ×") and round/circuit headers, in
 * Icelandic and English. Only the set count is touched — the reps after "×"
 * are left alone. Returns the new text AND whether anything changed.
 */
function adjustSets(item: string, delta: number): { text: string; changed: boolean } {
  if (isMetaLine(item)) return { text: item, changed: false };

  // Round / circuit header: "3 umferðir", "4 rounds", "2 cluster".
  if (/^\d+\s*(umferð|round|hring|cluster)/i.test(item)) {
    let roundChanged = false;
    const text = item.replace(/^(\d+)/, (_m, n: string) => {
      const nn = clampSet(parseInt(n, 10), delta);
      if (nn !== parseInt(n, 10)) roundChanged = true;
      return String(nn);
    });
    return { text, changed: roundChanged };
  }

  // First "N" (or "A–B" range) immediately before ×/x/sett/sets = the set count.
  let changed = false;
  const text = item.replace(
    // unit is ×/x/sett/sets NOT followed by a letter (so "setting"/"boxing" don't
    // match, but "3–4 × 8–12" with a space after × still does).
    /(\d+)(\s*[–-]\s*)?(\d+)?(\s*)([×xX]|sett|sets)(?![a-zA-Z])/,
    (_full, n1: string, sep: string | undefined, n2: string | undefined, sp: string, unit: string) => {
      const isRange = sep != null && n2 != null;
      const a = parseInt(n1, 10);
      const na = clampSet(a, delta);
      if (isRange) {
        const b = parseInt(n2 as string, 10);
        const nb = clampSet(b, delta);
        if (na !== a || nb !== b) changed = true;
        return `${na}${sep}${nb}${sp}${unit}`;
      }
      // No range — n1 is the set count; keep any stray sep/n2 (belongs to reps).
      if (na !== a) changed = true;
      return `${na}${sep ?? ""}${n2 ?? ""}${sp}${unit}`;
    },
  );
  return { text, changed };
}

/** Legacy name kept for generateRed: reduce a line's set count by one. */
const reduceSets = (item: string): string => adjustSets(item, -1).text;

/** A block that carries real load (not warmup / cooldown). */
const isWorkingBlock = (block: TemplateBlock): boolean =>
  !blockIs(block.block, WARMUP_KEYWORDS) && !blockIs(block.block, COOLDOWN_KEYWORDS);

/**
 * Last-resort guarantee that YELLOW < GREEN when no set count could be reduced
 * (e.g. every exercise is written without a number). Drops the last exercise of
 * the largest working block; if every working block has a single exercise, drops
 * the last working block outright. Warmup / cooldown are never touched.
 */
function trimOneAccessory(structure: TemplateBlock[]): TemplateBlock[] {
  let bestIdx = -1;
  let bestLen = 1;
  structure.forEach((b, i) => {
    const len = b.items?.length ?? 0;
    if (isWorkingBlock(b) && len > bestLen) { bestLen = len; bestIdx = i; }
  });
  if (bestIdx >= 0) {
    return structure.map((b, i) => (i === bestIdx ? { ...b, items: b.items.slice(0, -1) } : b));
  }
  for (let i = structure.length - 1; i >= 0; i--) {
    if (isWorkingBlock(structure[i]) && (structure[i].items?.length ?? 0) >= 1) {
      return structure.filter((_, idx) => idx !== i);
    }
  }
  return structure;
}

// ── GREEN → YELLOW ────────────────────────────────────────────────────────────
//
// Regla: Sama uppbygging og GREEN, en færri sett í hverri æfingu — og ALDREI
// sama magn og GREEN. Ef ekkert sett-tal fannst til að lækka er einni auka-
// æfingu sleppt (trimOneAccessory) svo magnið sé sannarlega minna.

export function generateYellow(green: TemplateRecord): TemplateRecord {
  const title = swapEmoji(green.title, "🟢", "🟡")
    .replace("Green+", "Reduced")
    .replace("Green", "Reduced");

  let anyChanged = false;
  let structure = green.structure.map((block): TemplateBlock => {
    // Warmup + cooldown: unchanged
    if (!isWorkingBlock(block)) return { ...block };

    const items = block.items.map((it) => {
      const r = adjustSets(it, -1);
      if (r.changed) anyChanged = true;
      return r.text;
    });
    let rest = block.rest_between_rounds;
    if (rest) {
      const r = adjustSets(rest, -1);
      if (r.changed) anyChanged = true;
      rest = r.text;
    }
    return { ...block, items, rest_between_rounds: rest };
  });

  // Non-negotiable: YELLOW must carry less volume than GREEN, never the same.
  if (!anyChanged) structure = trimOneAccessory(structure);

  return {
    ...green,
    readiness_level: "YELLOW",
    title,
    description: "Reduced dose — minna magn en GREEN (færri sett). Sama uppbygging.",
    structure,
  };
}

// ── GREEN → GREEN+ ─────────────────────────────────────────────────────────────
//
// Regla: Grænn-plús leikmaður má gera MEIRA — sérstaklega af fyrstu æfingunum.
// Við bætum einu setti við hverja æfingu í FYRSTU vinnu-blokkinni (aðal-lyfturnar)
// og skiljum aukaæfingar eftir óbreyttar. GREEN+ má aldrei vera sama magn og GREEN:
// ef ekkert sett-tal fannst til að hækka er einu auka topp-setti bætt við.

export function generateGreenPlus(green: TemplateRecord): TemplateRecord {
  const title = swapEmoji(green.title, "🟢", "🟢➕").replace(/\bGreen\b/, "Green+");

  let boosted = false;
  let firstWorkingDone = false;
  const structure = green.structure.map((block): TemplateBlock => {
    if (!isWorkingBlock(block) || firstWorkingDone) return { ...block };
    firstWorkingDone = true; // only the first working block — the main lifts
    const items = block.items.map((it) => {
      const r = adjustSets(it, +1);
      if (r.changed) boosted = true;
      return r.text;
    });
    return { ...block, items };
  });

  // Non-negotiable: GREEN+ must carry MORE volume than GREEN. If the main block
  // had no numeric set to bump, add one extra top set to it.
  if (!boosted) {
    const idx = structure.findIndex(isWorkingBlock);
    if (idx >= 0) {
      structure[idx] = {
        ...structure[idx],
        items: [...structure[idx].items, "+ 1 auka topp-sett á aðaláæfingu (Green+)"],
      };
    }
  }

  return {
    ...green,
    readiness_level: "GREEN_PLUS",
    title,
    description: "Green+ — meira magn en GREEN (auka sett), sérstaklega á fyrstu æfingunum.",
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
