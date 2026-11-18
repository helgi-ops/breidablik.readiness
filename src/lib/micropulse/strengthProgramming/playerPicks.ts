/**
 * Player exercise picks (lota 1, 2026-11-17) — a player chooses which of the team's exercises they want in
 * their own strength session, within the coach's list (the team palette). Pure — no DB.
 *
 * What a pick does: in the engine's palette step the player's picks go FIRST in that slot, ahead of the rest
 * of the coach's list (`effectivePool`). Everything else stays: the MD-tuned dose, the symmetry rule (≥10 %
 * L/R → one leg at a time), the injury-prevention block (Nordic, Copenhagen), readiness easing — and the
 * safety rules always win (a pick a safety rule rules out today is passed over for that day).
 *
 * Limits we set: only exercises on the team's list; at most 2 per group (1 for upper body); only groups where
 * the list offers a real choice (≥ 2 exercises). Isometrics are not a player choice. The coach can change a
 * player's picks or lock a group (`locked`), and the switch for the team is off until the coach turns it on.
 * The coach can also turn it on for ONE player to test (`test_enabled` on the player's row, lota 2).
 */
import type { PaletteSlots } from "./palette";

export const PICK_SLOTS = ["power_explosive", "bilateral_strength", "unilateral_strength", "upper_body"] as const;
export type PickSlot = (typeof PICK_SLOTS)[number];
export const isPickSlot = (s: string): s is PickSlot => (PICK_SLOTS as readonly string[]).includes(s);

/** Most picks per group: a session uses 1–3 power lifts, 1 main lower lift (+ an added one), and 1 upper lift
 *  in season (2 in pre-season). */
export const PICK_MAX: Record<PickSlot, number> = {
  power_explosive: 2,
  bilateral_strength: 2,
  unilateral_strength: 2,
  upper_body: 1,
};

/** A coach change or lock needs a short reason (kept in the history). */
export const PICK_REASON_MIN = 3;

/** A player's picks: group → exercise ids, first choice first. */
export type PlayerExercisePicks = Partial<Record<PickSlot, string[]>>;

/** Plain group names for players and coaches (no jargon). */
export const PICK_SLOT_LABEL: Record<PickSlot, { en: string; is: string }> = {
  power_explosive: { en: "Power (jumps, throws, fast lifts)", is: "Sprengikraftur (hopp, köst, hraðar lyftur)" },
  bilateral_strength: { en: "Legs, both together", is: "Fætur, báðir saman" },
  unilateral_strength: { en: "Legs, one at a time", is: "Fætur, einn í einu" },
  upper_body: { en: "Upper body", is: "Efri hluti" },
};

/** Groups a player can choose in: on the team's list with at least 2 exercises (otherwise there is no choice). */
export function pickableSlots(palette: PaletteSlots | null | undefined): PickSlot[] {
  return PICK_SLOTS.filter((s) => (palette?.[s]?.length ?? 0) >= 2);
}

/** Keep only picks that are on the team's list for that group, de-duplicated, capped. Used on read (the list
 *  may have changed since the player picked) and on save. */
export function sanitizePicks(raw: unknown, palette: PaletteSlots | null | undefined): PlayerExercisePicks {
  const out: PlayerExercisePicks = {};
  if (!raw || typeof raw !== "object" || !palette) return out;
  for (const slot of pickableSlots(palette)) {
    const ids = (raw as Record<string, unknown>)[slot];
    if (!Array.isArray(ids)) continue;
    const onList = new Set(palette[slot] ?? []);
    const kept = [...new Set(ids.map(String).filter((id) => onList.has(id)))].slice(0, PICK_MAX[slot]);
    if (kept.length) out[slot] = kept;
  }
  return out;
}

export function sanitizeLockedSlots(raw: unknown): PickSlot[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map(String).filter(isPickSlot))];
}

export type PickError = { code: "unknown_group" | "not_on_list" | "too_many" | "locked" | "no_choice"; en: string; is: string };

/** Validate a player's save for ONE group. `ids` = the new picks (first choice first; [] clears the group). */
export function validatePlayerPick(
  slot: string,
  ids: unknown,
  palette: PaletteSlots | null | undefined,
  locked: readonly string[],
  opts: { coach?: boolean } = {},
): { ok: true; slot: PickSlot; ids: string[] } | { ok: false; error: PickError } {
  if (!isPickSlot(slot)) return { ok: false, error: { code: "unknown_group", en: "Unknown group.", is: "Óþekktur flokkur." } };
  if (!pickableSlots(palette).includes(slot)) {
    return { ok: false, error: { code: "no_choice", en: "There is nothing to choose in this group.", is: "Ekkert val er í þessum flokki." } };
  }
  // The coach may change a locked group; a player may not.
  if (!opts.coach && locked.includes(slot)) {
    return { ok: false, error: { code: "locked", en: "Your coach chose this group for you.", is: "Þjálfarinn þinn valdi þennan flokk fyrir þig." } };
  }
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
    return { ok: false, error: { code: "not_on_list", en: "Pick exercises from the list.", is: "Veldu æfingar af listanum." } };
  }
  const uniq = [...new Set(ids as string[])];
  if (uniq.length > PICK_MAX[slot]) {
    return { ok: false, error: { code: "too_many", en: `At most ${PICK_MAX[slot]} in this group.`, is: `Mest ${PICK_MAX[slot]} í þessum flokki.` } };
  }
  const onList = new Set(palette?.[slot] ?? []);
  if (uniq.some((id) => !onList.has(id))) {
    return { ok: false, error: { code: "not_on_list", en: "That exercise is not on your team's list.", is: "Þessi æfing er ekki á lista liðsins." } };
  }
  return { ok: true, slot, ids: uniq };
}

/** The order the engine draws a slot from: the player's picks (that are on the list) first, then the rest of the
 *  coach's list in the coach's order. No picks → the coach's list unchanged. */
export function effectivePool(slot: PickSlot | string, palette: PaletteSlots, picks: PlayerExercisePicks | null | undefined): string[] {
  const list = (palette as Record<string, string[] | undefined>)[slot] ?? [];
  const mine = isPickSlot(slot) ? (picks?.[slot] ?? []).filter((id) => list.includes(id)) : [];
  if (mine.length === 0) return list;
  return [...mine, ...list.filter((id) => !mine.includes(id))];
}

/** True when the id is one of the player's picks for the slot. */
export function isPlayerPick(slot: string, id: string, picks: PlayerExercisePicks | null | undefined): boolean {
  return isPickSlot(slot) && (picks?.[slot] ?? []).includes(id);
}

// ─── Strength goal (lota 2, 2026-11-17) ───────────────────────────────────
// The player picks ONE goal; on the goal's days the matching exercise in Today's session gets one more set.
// Only in pre-season and off-season: in season the session is maintenance and the goal is kept (coach's rule,
// 2026-11-17). With no match within 5 days every strength session is a goal day. Never on a light / recovery
// day, in a two-match week, or when a safety rule changed that exercise; never more than +1 set (see
// playerGoal.ts). Muscle size (hypertrophy) is not offered: it needs more weekly volume than a microdose, and we
// have no source for an in-season rule.
//
// Goals step 3 (2026-11-18): "Stronger legs" (stronger) and "More explosive" (power) are RETIRED — the 8-week gym
// goals Maximal strength / Explosive power replace them, and the force-plate (DSI) suggestion now points there
// (goalSuggestion.ts, shown on My goal). Only "Stronger hamstrings" (robust, +1 Nordic set) can still be chosen: no
// 8-week goal covers it. A stored retired goal stays in the row as it was (nobody's value is rewritten) but the
// engine never reads it (`activeGoal` at the one input, playerContext/domains.ts) and the sheets say it no longer
// adds a set.

export const STRENGTH_GOALS = ["stronger", "power", "robust"] as const;
export type StrengthGoal = (typeof STRENGTH_GOALS)[number];
export const isStrengthGoal = (s: unknown): s is StrengthGoal => typeof s === "string" && (STRENGTH_GOALS as readonly string[]).includes(s);
/** The goals a player or coach can still choose (2026-11-18). */
export const ACTIVE_STRENGTH_GOALS = ["robust"] as const satisfies readonly StrengthGoal[];
export type ActiveStrengthGoal = (typeof ACTIVE_STRENGTH_GOALS)[number];
export const isActiveStrengthGoal = (s: unknown): s is ActiveStrengthGoal =>
  typeof s === "string" && (ACTIVE_STRENGTH_GOALS as readonly string[]).includes(s);

/** The days a goal adds its set in a week with a match (the week's heavier days, well before the match). With no
 *  match near, in pre-/off-season, every strength session counts. */
export const GOAL_DAYS: Record<StrengthGoal, readonly string[]> = {
  stronger: ["MD-4"],
  power: ["MD-4", "MD-3"],
  robust: ["MD-4"],
};

/** Plain names + what the goal does, for players and coaches (no jargon). */
export const STRENGTH_GOAL_LABEL: Record<StrengthGoal, { en: string; is: string; whatEN: string; whatIS: string }> = {
  stronger: {
    en: "Stronger legs",
    is: "Sterkari fætur",
    whatEN: "One more set of your main leg lift on the week's heavy day.",
    whatIS: "Eitt sett í viðbót af aðal-fótalyftunni á þyngsta degi vikunnar.",
  },
  power: {
    en: "More explosive",
    is: "Meiri sprengikraftur",
    whatEN: "One more set of your first jump or fast lift on the week's strength days.",
    whatIS: "Eitt sett í viðbót af fyrstu hopp- eða hraðalyftunni á styrktardögum vikunnar.",
  },
  robust: {
    en: "Stronger hamstrings",
    is: "Sterkari aftan í læri",
    whatEN: "One more set of Nordics on the week's heavy day. Nordic training is associated with fewer hamstring injuries.",
    whatIS: "Eitt sett í viðbót af Nordic á þyngsta degi vikunnar. Nordic-þjálfun tengist færri meiðslum aftan í læri.",
  },
};

/** The goal a stored value stands for (anything else → none). Retired goals included: for display only. */
export function sanitizeGoal(raw: unknown): StrengthGoal | null {
  return isStrengthGoal(raw) ? raw : null;
}

/** The goal the engine uses: an active goal, else none (a retired "stronger" / "power" adds nothing, 2026-11-18). */
export function activeGoal(raw: unknown): ActiveStrengthGoal | null {
  return isActiveStrengthGoal(raw) ? raw : null;
}

/** A stored retired goal → the line the player / coach sees; anything else → null. */
export function retiredGoalNote(raw: unknown): { en: string; is: string } | null {
  const g = sanitizeGoal(raw);
  if (!g || isActiveStrengthGoal(g)) return null;
  const l = STRENGTH_GOAL_LABEL[g];
  return {
    en: `Your earlier goal “${l.en}” no longer adds a set. Strength and explosive goals are now 8-week plans under My goal.`,
    is: `Fyrra markmiðið „${l.is}“ bætir ekki lengur við setti. Styrktar- og sprengikraftsmarkmið eru nú 8 vikna áætlanir undir Markmiðið mitt.`,
  };
}

/** Validate a goal save (`null` clears it). A player can't change a goal the coach locked. */
export function validateGoal(
  raw: unknown,
  goalLocked: boolean,
  opts: { coach?: boolean } = {},
): { ok: true; goal: ActiveStrengthGoal | null } | { ok: false; error: { code: "locked" | "unknown_goal" | "retired"; en: string; is: string } } {
  if (!opts.coach && goalLocked) {
    return { ok: false, error: { code: "locked", en: "Your coach chose your goal.", is: "Þjálfarinn þinn valdi markmiðið þitt." } };
  }
  if (raw === null || raw === "" || raw === undefined) return { ok: true, goal: null };
  if (isStrengthGoal(raw) && !isActiveStrengthGoal(raw)) {
    return { ok: false, error: { code: "retired", en: "That goal is now an 8-week plan: open My goal.", is: "Það markmið er nú 8 vikna áætlun: opnaðu Markmiðið mitt." } };
  }
  if (!isActiveStrengthGoal(raw)) return { ok: false, error: { code: "unknown_goal", en: "Unknown goal.", is: "Óþekkt markmið." } };
  return { ok: true, goal: raw };
}
