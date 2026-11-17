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
