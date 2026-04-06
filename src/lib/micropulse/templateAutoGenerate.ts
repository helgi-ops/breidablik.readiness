/**
 * templateAutoGenerate.ts
 *
 * Generates YELLOW and RED microdose template variants from a GREEN template.
 *
 * Rules:
 *   GREEN → YELLOW  Reduced dose. ~30% less volume, no pure plyometrics.
 *   GREEN → RED     Isometrics + warmup only. No heavy lifting, no jumps.
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
const ISO_KEYWORDS      = ["iso", "isometric", "isometrics"];
const EXPLOSIVE_KEYWORDS = ["ballistic", "plyo", "contrast", "cluster", "box jump", "drop jump", "pogo", "hopp", "sprettur"];
const STRENGTH_KEYWORDS  = ["deadlift", "squat", "rfess", "split squat", "lyfting", "styrk", "strength", "trap bar"];

function blockIs(block: string, keywords: string[]): boolean {
  const lower = block.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

/** Reduce set counts in a string: "3×3" → "2×3", "4×3" → "2×3", "5×" → "3×" */
function reduceVolume(item: string): string {
  return item
    .replace(/\b5\s*[×x]\s*/g, "3× ")
    .replace(/\b4\s*[×x]\s*/g, "2× ")
    .replace(/\b3\s*[×x]\s*/g, "2× ")
    .replace(/\b5\s*sett\b/gi, "3 sett")
    .replace(/\b4\s*sett\b/gi, "3 sett")
    .replace(/\b3\s*sett\b/gi, "2 sett");
}

function swapEmoji(title: string, from: string, to: string): string {
  if (title.includes(from)) return title.replace(from, to);
  return to + " " + title;
}

// ── GREEN → YELLOW ────────────────────────────────────────────────────────────

export function generateYellow(green: TemplateRecord): TemplateRecord {
  const title = swapEmoji(green.title, "🟢", "🟡")
    .replace("Green+", "Reduced")
    .replace("Green", "Reduced");

  const structure = green.structure.flatMap((block): TemplateBlock[] => {
    const name = block.block;

    // Warmup: keep unchanged
    if (blockIs(name, WARMUP_KEYWORDS)) return [block];

    // ISO blocks: keep unchanged
    if (blockIs(name, ISO_KEYWORDS)) return [block];

    // Explosive/plyometric blocks: reduce volume, add reduced label
    if (blockIs(name, EXPLOSIVE_KEYWORDS)) {
      return [
        {
          ...block,
          block: block.block + " — Reduced",
          items: [
            ...block.items.map(reduceVolume),
            "Ef líðan er undir 7/10: sleppa ballistic/hopp og fara í ISO í staðinn.",
          ],
        },
      ];
    }

    // Strength blocks: reduce volume slightly
    if (blockIs(name, STRENGTH_KEYWORDS)) {
      return [
        {
          ...block,
          items: block.items.map(reduceVolume),
        },
      ];
    }

    // Default: reduce volume
    return [
      {
        ...block,
        items: block.items.map(reduceVolume),
      },
    ];
  });

  // Add a stopping rule block if not already present
  const hasStopRule = structure.some((b) =>
    b.items.some((i) => i.toLowerCase().includes("stopp"))
  );
  if (!hasStopRule) {
    structure.push({
      block: "🛑 STOPP-regla",
      items: [
        "Ef hreyfing hægist eða gæði falla: STOPP strax.",
        "Markmið: líða jafn vel eða betur eftir.",
      ],
    });
  }

  return {
    ...green,
    readiness_level: "YELLOW",
    title,
    description: `Reduced dose. ${green.description ?? "Minnkað magn, engin ballistic/plyo ef líðan er undir 7/10."}`,
    structure,
  };
}

// ── GREEN → RED ───────────────────────────────────────────────────────────────

const DEFAULT_RED_ISO_BLOCK: TemplateBlock = {
  block: "B. ISO Circuit (1–2 umferðir)",
  items: [
    "ISO hamstring (short range) — 2 × 20–30 sek / fót",
    "ISO adductor / Copenhagen — 2 × 20–30 sek / fót (ef þörf)",
    "ISO calf / ankle — 2 × 20–30 sek",
    "Pallof Press — 2 × 6/6 (stuttur TUT)",
    "Öndun: 4–7–8 box breathing í 2 mín að lokum",
  ],
};

const DEFAULT_RED_RULE_BLOCK: TemplateBlock = {
  block: "🛑 Reglur",
  items: [
    "Engar þungar lyftur. Engin hopp. Engin ballistic.",
    "Ef verkur eykst í ISO: stytta tímann, halda öndun.",
    "Markmið: fara út ferskari en þú komst inn.",
  ],
};

export function generateRed(green: TemplateRecord): TemplateRecord {
  const title = swapEmoji(green.title, "🟢", "🔴")
    .replace("Green+", "Minimal / ISO")
    .replace("Green", "Minimal / ISO");

  // Keep warmup blocks unchanged; drop all else and replace with ISO circuit
  const warmupBlocks = green.structure.filter((b) =>
    blockIs(b.block, WARMUP_KEYWORDS)
  );

  // If the GREEN template already has ISO blocks, include them at reduced volume
  const isoBlocks = green.structure
    .filter((b) => blockIs(b.block, ISO_KEYWORDS) && !blockIs(b.block, WARMUP_KEYWORDS))
    .map((b) => ({
      ...b,
      items: b.items.map(reduceVolume),
    }));

  const structure: TemplateBlock[] = [
    ...(warmupBlocks.length > 0
      ? warmupBlocks
      : [
          {
            block: "A. Upphitun (létt)",
            items: [
              "Mini-band glute walk 2×10",
              "Hip bridge 2×8",
              "Split Squat ISO: 5 sek × 2/hlið",
            ],
          },
        ]),
    ...(isoBlocks.length > 0 ? isoBlocks : [DEFAULT_RED_ISO_BLOCK]),
    DEFAULT_RED_RULE_BLOCK,
  ];

  return {
    ...green,
    readiness_level: "RED",
    title,
    description: "Isometrics only. Parasympathetic reset. Engar þungar lyftur, engin hopp.",
    structure,
  };
}

// ── Slug helper ───────────────────────────────────────────────────────────────

/**
 * Convert "Grindavík" + "Körfubolti" + "M" → "grindavik_korfubolti_karlar_microdose_templates"
 * gender: "M" | "F" | null/undefined
 */
export function buildTableName(setName: string, sport: string, gender?: string | null): string {
  const slugify = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")    // strip diacritics (á→a, ö→o, etc.)
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
