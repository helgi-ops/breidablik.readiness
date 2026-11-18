/**
 * Exercise swaps for the Programme Library's "Speed & power" plans (lota 4, step 3).
 *
 * The coach can swap an exercise for a similar one ("we have no trap bar"). A swap holds for that exercise everywhere
 * in that quality's plans and is saved per team (`team_quality_plan_prefs`).
 *
 * Rules:
 * - Only the exercise changes. The dose, the method, the counters (flat-out metres, contacts, sled metres, hard
 *   stops) and every safety rule stay exactly as planned. The page and the PDF say the swapped exercise was not tested.
 * - Swaps replace whole phrases (never word by word, because of Icelandic case endings), in both languages.
 * - Tests, the tested braking drills (Dos'Santos), flying sprints, Nordic curls, the squat by bar speed (its speed
 *   numbers only hold for that lift), drop jumps and the youth hops are never swappable.
 * - Goal plans (lota 5) take the team's swaps when the plan is built or approved, and only swapped blocks get a mark
 *   (`onlySwapped`), so a goal plan without swaps is byte-for-byte what it was. A frozen, approved plan never changes.
 */

import type { Bi, GoalQuality } from "./types";

export type SwapSlotKey =
  | "heavy_legs"
  | "jump_squat_load"
  | "bounds"
  | "rebound_jumps"
  | "squat_cmj"
  | "sled"
  | "start"
  | "eccentric_single_leg";

/** Whole-phrase replacements, applied in order to the exercise name and the dose line. */
type Edits = { en: [string, string][]; is: [string, string][] };

/** `note`: shown next to the option in the picker (e.g. "teach it first"), never in the plan itself. */
export type SwapOption = { key: string; label: Bi; note?: Bi; edits: Edits };

type BlockLike = { method: string; what: Bi; dose: Bi; test?: boolean };

export type SwapSlot = {
  key: SwapSlotKey;
  label: Bi;
  qualities: GoalQuality[];
  match: (b: BlockLike) => boolean;
  /** The first option is the planned exercise (no edits). */
  options: SwapOption[];
};

export const PLANNED = "planned";

/** Options never used in an under-18 goal plan: no study in the library tested weightlifting pulls in youth (lota 6). */
export const ADULT_ONLY_SWAPS = ["jump_shrug", "hang_high_pull"] as const;

const planned = (label: Bi): SwapOption => ({ key: PLANNED, label, edits: { en: [], is: [] } });

export const SWAP_SLOTS: SwapSlot[] = [
  {
    key: "heavy_legs",
    label: { en: "Heavy leg lift", is: "Þung fótalyfta" },
    qualities: ["acceleration", "jump", "top_speed", "max_strength", "explosive", "strength_power"],
    match: (b) => b.method === "heavy_strength" && b.dose.en.startsWith("Squat or trap-bar deadlift"),
    options: [
      planned({ en: "Squat or trap-bar deadlift", is: "Hnébeygja eða trap bar" }),
      {
        key: "back_squat",
        label: { en: "Back squat", is: "Hnébeygja" },
        edits: { en: [["Squat or trap-bar deadlift", "Back squat"]], is: [["Hnébeygja eða trap bar", "Hnébeygja"]] },
      },
      {
        key: "trap_bar",
        label: { en: "Trap-bar deadlift", is: "Trap bar-réttstöðulyfta" },
        edits: { en: [["Squat or trap-bar deadlift", "Trap-bar deadlift"]], is: [["Hnébeygja eða trap bar", "Trap bar-réttstöðulyfta"]] },
      },
      {
        key: "front_squat",
        label: { en: "Front squat", is: "Framhnébeygja" },
        edits: { en: [["Squat or trap-bar deadlift", "Front squat"]], is: [["Hnébeygja eða trap bar", "Framhnébeygja"]] },
      },
      {
        key: "leg_press",
        label: { en: "Leg press", is: "Fótapressa" },
        edits: { en: [["Squat or trap-bar deadlift", "Leg press"]], is: [["Hnébeygja eða trap bar", "Fótapressa"]] },
      },
    ],
  },
  {
    key: "jump_squat_load",
    label: { en: "Jump squats: load or exercise", is: "Hnébeygjuhopp: þyngd eða æfing" },
    qualities: ["acceleration", "jump", "top_speed", "explosive", "strength_power"],
    match: (b) => b.what.en === "Light jump squats",
    options: [
      planned({ en: "Any light load", is: "Hvaða létt þyngd sem er" }),
      {
        key: "bar",
        label: { en: "Bar", is: "Stöng" },
        edits: {
          en: [["Light jump squats", "Light jump squats with a bar"]],
          is: [["Hnébeygjuhopp með léttri þyngd", "Hnébeygjuhopp með léttri stöng"]],
        },
      },
      {
        key: "dumbbells",
        label: { en: "Dumbbells", is: "Handlóð" },
        edits: {
          en: [["Light jump squats", "Light jump squats holding dumbbells"]],
          is: [["Hnébeygjuhopp með léttri þyngd", "Hnébeygjuhopp með léttum handlóðum"]],
        },
      },
      {
        key: "trap_bar",
        label: { en: "Trap bar", is: "Trap bar" },
        edits: {
          en: [["Light jump squats", "Light jump squats with a trap bar"]],
          is: [["Hnébeygjuhopp með léttri þyngd", "Hnébeygjuhopp með léttri trap bar-stöng"]],
        },
      },
      // Weightlifting pulls (lota 6, `PULLING_DERIVATIVES` card): only here, never for jumps or bounds.
      {
        key: "jump_shrug",
        label: { en: "Jump shrug", is: "Jump shrug (stökk-axlalyfta)" },
        note: { en: "Teach it first, with an empty bar.", is: "Kenndu hana fyrst, með tóma stöng." },
        edits: {
          en: [["Light jump squats", "Jump shrugs"]],
          is: [["Hnébeygjuhopp með léttri þyngd", "Jump shrug (stökk-axlalyfta)"]],
        },
      },
      {
        key: "hang_high_pull",
        label: { en: "Hang high pull", is: "Hang high pull" },
        note: { en: "Teach it first; for players who already do the jump shrug well.", is: "Kenndu hana fyrst; fyrir þá sem gera jump shrug vel." },
        edits: {
          en: [["Light jump squats", "Hang high pulls"]],
          is: [["Hnébeygjuhopp með léttri þyngd", "Hang high pull"]],
        },
      },
    ],
  },
  {
    key: "bounds",
    label: { en: "Bounds", is: "Skrefstökk" },
    qualities: ["acceleration"],
    match: (b) => b.method === "bounds" && (b.what.en === "Forward bounds" || b.what.en === "Low, short forward bounds"),
    options: [
      planned({ en: "Forward bounds", is: "Skrefstökk áfram" }),
      {
        key: "hurdle_hops",
        label: { en: "Hurdle hops", is: "Grindahopp" },
        edits: {
          en: [["Low, short forward bounds", "Hops over low hurdles"], ["Forward bounds", "Hurdle hops"]],
          is: [["Lág, stutt skrefstökk áfram", "Hopp yfir lágar grindur"], ["Skrefstökk áfram", "Grindahopp"]],
        },
      },
      {
        key: "power_skips",
        label: { en: "Power skips", is: "Kraftskref" },
        edits: {
          en: [["Low, short forward bounds", "Low, short power skips"], ["Forward bounds", "Power skips"]],
          is: [["Lág, stutt skrefstökk áfram", "Lág, stutt kraftskref"], ["Skrefstökk áfram", "Kraftskref"]],
        },
      },
    ],
  },
  {
    key: "rebound_jumps",
    label: { en: "Rebound jumps", is: "Endurkastshopp" },
    qualities: ["jump"],
    match: (b) => b.method === "rebound_jumps" && !b.test && b.what.en === "Rebound jumps",
    options: [
      planned({ en: "Rebound jumps", is: "Endurkastshopp" }),
      {
        key: "hurdle_rebounds",
        label: { en: "Rebound jumps over low hurdles", is: "Endurkastshopp yfir lágar grindur" },
        edits: {
          en: [["Rebound jumps", "Rebound jumps over low hurdles"]],
          is: [["Endurkastshopp", "Endurkastshopp yfir lágar grindur"]],
        },
      },
      {
        key: "tuck_jumps",
        label: { en: "Tuck jumps", is: "Hopp með hnén upp" },
        edits: {
          en: [["Rebound jumps", "Tuck jumps (knees up)"]],
          is: [["Endurkastshopp", "Hopp með hnén upp að bringu"]],
        },
      },
    ],
  },
  {
    key: "squat_cmj",
    label: { en: "Countermovement jumps", is: "CMJ-hopp" },
    qualities: ["jump"],
    match: (b) => b.method === "squat_cmj_jumps" && b.what.en === "Squat jumps + countermovement jumps",
    options: [
      planned({ en: "Countermovement jumps", is: "CMJ-hopp" }),
      {
        key: "box_jumps",
        label: { en: "Box jumps (step down)", is: "Kassahopp (stigið niður)" },
        edits: {
          en: [
            ["Squat jumps + countermovement jumps", "Squat jumps + box jumps"],
            ["countermovement jumps", "box jumps (step down)"],
          ],
          is: [
            ["Hopp úr hnébeygjustöðu + CMJ-hopp", "Hopp úr hnébeygjustöðu + kassahopp"],
            ["CMJ-hopp", "kassahopp (stigið niður)"],
          ],
        },
      },
    ],
  },
  {
    key: "sled",
    label: { en: "Sled sprints", is: "Sleðasprettir" },
    qualities: ["acceleration"],
    match: (b) => b.method === "resisted_sled",
    options: [
      planned({ en: "Sled sprints", is: "Sleðasprettir" }),
      {
        key: "hill",
        label: { en: "Hill sprints", is: "Brekkusprettir" },
        edits: {
          en: [
            ["Sled sprints", "Hill sprints"],
            ["load that slows the run by 15–30%", "a slope steep enough to slow the run by about 15–30%"],
          ],
          is: [
            ["Sleðasprettir", "Brekkusprettir"],
            ["þyngd sem hægir hlaupið um 15–30%", "brekka sem hægir hlaupið um 15–30%"],
          ],
        },
      },
    ],
  },
  {
    key: "start",
    label: { en: "Start for the sprints", is: "Start í sprettum" },
    qualities: ["acceleration", "top_speed"],
    // The 10 m test keeps its start: the same start each time is what makes the test comparable.
    match: (b) => b.method === "accel_sprints" && !b.test && b.what.en.includes("from a standing start"),
    options: [
      planned({ en: "Standing start", is: "Frá kyrrstöðu" }),
      {
        key: "split_stance",
        label: { en: "Split stance", is: "Skrefstaða" },
        edits: { en: [["from a standing start", "from a split stance"]], is: [["frá kyrrstöðu", "úr skrefstöðu"]] },
      },
      {
        key: "falling",
        label: { en: "Falling start", is: "Fallstart" },
        edits: { en: [["from a standing start", "from a falling start"]], is: [["frá kyrrstöðu", "úr fallstarti"]] },
      },
      {
        key: "three_point",
        label: { en: "Three-point start", is: "Þriggja punkta start" },
        edits: { en: [["from a standing start", "from a three-point start"]], is: [["frá kyrrstöðu", "úr þriggja punkta starti"]] },
      },
    ],
  },
  {
    key: "eccentric_single_leg",
    label: { en: "Slow-lowering single-leg lift", is: "Einfóta lyfta með hægri niðurleið" },
    qualities: ["braking"],
    match: (b) => b.method === "eccentric_strength",
    options: [
      planned({ en: "Split squat", is: "Framstigsbeygja" }),
      {
        key: "reverse_lunge",
        label: { en: "Reverse lunge", is: "Afturstig" },
        edits: {
          en: [["slow-lowering split squat", "slow-lowering reverse lunge"]],
          is: [["framstigsbeygja með hægri niðurleið", "afturstig með hægri niðurleið"]],
        },
      },
      {
        key: "box_squat",
        label: { en: "Single-leg box squat", is: "Einfóta beygja niður á kassa" },
        edits: {
          en: [["slow-lowering split squat", "slow-lowering single-leg box squat"]],
          is: [["framstigsbeygja með hægri niðurleið", "einfóta beygja niður á kassa með hægri niðurleið"]],
        },
      },
    ],
  },
];

export const SWAP_SLOT_BY_KEY: Record<SwapSlotKey, SwapSlot> = Object.fromEntries(SWAP_SLOTS.map((s) => [s.key, s])) as Record<
  SwapSlotKey,
  SwapSlot
>;

/** The coach's swaps for one quality: slot → option key. Only real swaps are kept (never "planned"). */
export type SwapChoices = Partial<Record<SwapSlotKey, string>>;

/** On the library's copy of a block (never on a goal plan's block). */
export type SwapMark = {
  slot: SwapSlotKey;
  option: string;
  swapped: boolean;
  /** The planned exercise, shown next to a swapped one. */
  planned: Bi;
};

export const SWAP_NOTE: Bi = {
  en: "Swapped exercises were not tested in the studies; the dose is the same.",
  is: "Æfingarnar sem þjálfari skipti inn voru ekki prófaðar í rannsóknunum; skammturinn er sá sami.",
};

export const SWAPPED_BY_COACH: Bi = { en: "swapped by coach", is: "skipt af þjálfara" };

export function slotFor(quality: GoalQuality, b: BlockLike): SwapSlot | null {
  return SWAP_SLOTS.find((s) => s.qualities.includes(quality) && s.match(b)) ?? null;
}

export function slotsFor(quality: GoalQuality): SwapSlot[] {
  return SWAP_SLOTS.filter((s) => s.qualities.includes(quality));
}

const replaceAll = (text: string, edits: [string, string][]) => edits.reduce((t, [from, to]) => t.split(from).join(to), text);

/** The swap mark the library put on a block, if any. */
export function swapMark(b: object): SwapMark | undefined {
  return (b as { swap?: SwapMark }).swap;
}

type PlanLike<B extends BlockLike> = { weeks: { sessions: { blocks: B[] }[] }[] };

/**
 * A copy of a plan with the team's swaps applied. Swapped blocks get the new exercise name and dose wording and a
 * `swap` mark. In the library every swappable block is marked (so the page can offer "Swap"); with `onlySwapped`
 * (goal plans) a block that was not swapped is copied untouched. Everything else is copied as is.
 */
export function applySwaps<B extends BlockLike, P extends PlanLike<B>>(
  plan: P,
  quality: GoalQuality,
  choices: SwapChoices,
  opts: { onlySwapped?: boolean } = {},
): P {
  return {
    ...plan,
    weeks: plan.weeks.map((w) => ({
      ...w,
      sessions: w.sessions.map((s) => ({
        ...s,
        blocks: s.blocks.map((b) => {
          const slot = slotFor(quality, b);
          if (!slot) return b;
          const opt = slot.options.find((o) => o.key === choices[slot.key]) ?? slot.options[0];
          const swapped = opt.key !== PLANNED;
          const mark: SwapMark = { slot: slot.key, option: opt.key, swapped, planned: slot.options[0].label };
          if (!swapped) return opts.onlySwapped ? b : { ...b, swap: mark };
          return {
            ...b,
            what: { en: replaceAll(b.what.en, opt.edits.en), is: replaceAll(b.what.is, opt.edits.is) },
            dose: { en: replaceAll(b.dose.en, opt.edits.en), is: replaceAll(b.dose.is, opt.edits.is) },
            swap: mark,
          };
        }),
      })),
    })),
  } as P;
}

export function hasSwaps(plan: PlanLike<BlockLike>): boolean {
  return plan.weeks.some((w) => w.sessions.some((s) => s.blocks.some((b) => swapMark(b)?.swapped)));
}

/** Keep only known slots for this quality with a known, non-planned option. Returns null if anything is unknown. */
export function validateSwaps(quality: GoalQuality, raw: unknown): SwapChoices | null {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: SwapChoices = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const slot = SWAP_SLOT_BY_KEY[k as SwapSlotKey];
    if (!slot || !slot.qualities.includes(quality) || typeof v !== "string") return null;
    if (!slot.options.some((o) => o.key === v)) return null;
    if (v !== PLANNED) out[slot.key] = v;
  }
  return out;
}
