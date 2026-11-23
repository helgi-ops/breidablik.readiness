/**
 * Plan intent — the fixed list of things a coach can want from a block (meso) or a week (micro).
 *
 * The coach writes free text ("the next four weeks I want to build top speed and keep strength"). The text is read
 * into THIS list only (by AI or by keywords), the coach sees and corrects the read, and the rules turn the list into
 * recommendations (`recommend.ts`). Nothing outside the list is acted on: a wish the list can't hold is shown back as
 * "not understood", never guessed. Pure, no I/O.
 */

export type Bi = { en: string; is: string };

export const INTENT_GOALS = [
  "max_strength",
  "power",
  "max_speed",
  "accel_decel",
  "aerobic_base",
  "hiit",
  "rsa",
  "injury_prevention",
  "freshness",
] as const;
export type IntentGoal = (typeof INTENT_GOALS)[number];

export const INTENT_MODES = ["build", "maintain", "reduce"] as const;
export type IntentMode = (typeof INTENT_MODES)[number];

/** One thing the coach wants: the goal, which way, and the words in the coach's own text it was read from. */
export type IntentItem = { goal: IntentGoal; mode: IntentMode; quote: string };

/** Who read the text into items: AI, the keyword reader, or the coach (edited by hand). */
export type IntentSource = "ai" | "keywords" | "coach";

export type PlanIntent = {
  items: IntentItem[];
  /** Parts of the text that asked for something the list can't hold (quoted from the text). */
  unclear: string[];
  source: IntentSource;
};

export type PlanScope = "block" | "week";

export const GOAL_LABEL: Record<IntentGoal, Bi> = {
  max_strength: { en: "Max strength", is: "Hámarksstyrkur" },
  power: { en: "Power", is: "Kraftur (power)" },
  max_speed: { en: "Top speed", is: "Hámarkshraði" },
  accel_decel: { en: "Acceleration and braking", is: "Hröðun og hemlun" },
  aerobic_base: { en: "Aerobic base", is: "Loftháð grunnþol" },
  hiit: { en: "High-intensity endurance (HIIT)", is: "Háákefðarþol (HIIT)" },
  rsa: { en: "Repeated sprints (RSA)", is: "Hraðaþol (RSA)" },
  injury_prevention: { en: "Injury prevention (hamstring, groin)", is: "Meiðslaforvörn (aftanlæri, nári)" },
  freshness: { en: "Freshness for the match", is: "Ferskleiki fyrir leik" },
};

export const MODE_LABEL: Record<IntentMode, Bi> = {
  build: { en: "build", is: "byggja upp" },
  maintain: { en: "keep", is: "halda við" },
  reduce: { en: "reduce", is: "draga úr" },
};

export const SOURCE_LABEL: Record<IntentSource, Bi> = {
  ai: { en: "Read by AI", is: "Lesið af gervigreind" },
  keywords: { en: "Read by keywords", is: "Lesið með lykilorðum" },
  coach: { en: "Set by the coach", is: "Stillt af þjálfara" },
};

export const isIntentGoal = (v: unknown): v is IntentGoal => typeof v === "string" && (INTENT_GOALS as readonly string[]).includes(v);
export const isIntentMode = (v: unknown): v is IntentMode => typeof v === "string" && (INTENT_MODES as readonly string[]).includes(v);

/** The longest text read (characters). */
export const MAX_INTENT_TEXT = 1500;
const MAX_QUOTE = 160;
const MAX_UNCLEAR = 4;

/** Lower-case and squeeze spaces, so a quote is found in the text whatever its spacing or case. */
export const normText = (s: string) => s.toLocaleLowerCase("is").replace(/\s+/g, " ").trim();

/**
 * Keep only items on the list, with a mode, once per goal, whose quote really is in the coach's text. `unclear`
 * keeps only parts that are in the text too. This is the guard on the AI read: whatever the model returns, only
 * what the coach wrote can come through.
 */
export function sanitizeIntent(raw: unknown, text: string, source: IntentSource): PlanIntent {
  const hay = normText(text);
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const items: IntentItem[] = [];
  const seen = new Set<IntentGoal>();
  for (const it of Array.isArray(obj.items) ? obj.items : []) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    if (!isIntentGoal(r.goal) || seen.has(r.goal)) continue;
    const quote = typeof r.quote === "string" ? r.quote.trim().slice(0, MAX_QUOTE) : "";
    // The coach-edited path has no quote of its own; any other read must point at the coach's words.
    if (source !== "coach" && (!quote || !hay.includes(normText(quote)))) continue;
    items.push({ goal: r.goal, mode: isIntentMode(r.mode) ? r.mode : "build", quote });
    seen.add(r.goal);
  }
  const unclear: string[] = [];
  for (const u of Array.isArray(obj.unclear) ? obj.unclear : []) {
    if (typeof u !== "string") continue;
    const q = u.trim().slice(0, MAX_QUOTE);
    if (q && hay.includes(normText(q)) && !unclear.includes(q)) unclear.push(q);
    if (unclear.length >= MAX_UNCLEAR) break;
  }
  return { items, unclear, source };
}
