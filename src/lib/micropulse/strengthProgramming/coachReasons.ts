/**
 * The coach's reason for an override, one tap (coach's call 2026-11-23, contradiction 18).
 *
 * CLAUDE.md: "coach overrides are logged with a reason (audit trail)". A swap of a player's exercise, taking a swap
 * back, and the left/right gap decision each need a reason before they save: a short list to tap, "Other" with a
 * few words. Stored as `code` or `code: note`, so the line can be shown in the reader's language; older free text is
 * shown as written.
 */

export type ReasonKind = "swap" | "swap_clear" | "asym_swap" | "asym_keep";

type Label = { en: string; is: string };

const OTHER: Label = { en: "Other", is: "Annað" };

export const COACH_REASONS: Record<ReasonKind, Record<string, Label>> = {
  swap: {
    equipment: { en: "Equipment not available", is: "Búnaður ekki til" },
    niggle: { en: "Pain or a niggle", is: "Eymsli eða verkur" },
    technique: { en: "Technique not ready", is: "Tæknin ekki tilbúin" },
    preference: { en: "Player's preference", is: "Ósk leikmanns" },
    ai: { en: "AI suggestion the coach accepted", is: "Tillaga gervigreindar sem þjálfari samþykkti" },
    other: OTHER,
  },
  swap_clear: {
    resolved: { en: "The reason is gone", is: "Ástæðan er farin" },
    mistake: { en: "Swapped by mistake", is: "Skipt fyrir mistök" },
    other: OTHER,
  },
  asym_swap: {
    confirmed: { en: "Gap confirmed (test or physio)", is: "Munur staðfestur (próf eða sjúkraþjálfari)" },
    old_injury: { en: "Old injury on the weaker side", is: "Gömul meiðsli veikari megin" },
    other: OTHER,
  },
  asym_keep: {
    kicking_leg: { en: "Kicking leg, expected", is: "Sparkfótur, eðlilegt" },
    test_doubt: { en: "The test looks off", is: "Prófið lítur ekki rétt út" },
    physio_ok: { en: "Physio says it is fine", is: "Sjúkraþjálfari segir í lagi" },
    other: OTHER,
  },
};

/** The codes a coach taps in the UI (the AI code is set by the AI-suggestion button, not shown as a chip). */
export function reasonChoices(kind: ReasonKind): { code: string; label: Label }[] {
  return Object.entries(COACH_REASONS[kind])
    .filter(([code]) => code !== "ai")
    .map(([code, label]) => ({ code, label }));
}

const NOTE_MAX = 200;

/**
 * Check a reason from a request. A known code is required; "other" needs a note. Returns the stored form
 * (`code` or `code: note`), or an error the route returns as 400.
 */
export function parseCoachReason(kind: ReasonKind, code: unknown, note: unknown): { ok: true; stored: string; code: string } | { ok: false; error: string } {
  const c = typeof code === "string" ? code.trim() : "";
  if (!c || !COACH_REASONS[kind][c]) return { ok: false, error: "Pick a reason (one tap) before saving." };
  const n = typeof note === "string" ? note.trim().replace(/\s+/g, " ").slice(0, NOTE_MAX) : "";
  if (c === "other" && !n) return { ok: false, error: "Write a few words for \"Other\"." };
  return { ok: true, code: c, stored: n ? `${c}: ${n}` : c };
}

/** A stored reason in the reader's language: "Pain or a niggle", "Other: knee taped", older free text as written. */
export function reasonLabel(kind: ReasonKind, stored: string | null | undefined, isIS: boolean): string | null {
  const s = String(stored ?? "").trim();
  if (!s) return null;
  const i = s.indexOf(":");
  const code = (i >= 0 ? s.slice(0, i) : s).trim();
  const label = COACH_REASONS[kind][code];
  if (!label) return s;
  const note = i >= 0 ? s.slice(i + 1).trim() : "";
  const head = isIS ? label.is : label.en;
  return note ? `${head}: ${note}` : head;
}
