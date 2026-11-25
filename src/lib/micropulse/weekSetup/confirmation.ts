/**
 * Week confirmation (Micro cycle, lota 4): the coach confirms the week with "Confirm week → players". The status a
 * week shows — on the Micro week bar and on the Meso week cards:
 *   confirmed   — confirmed, nothing changed since;
 *   changed     — the days (week_plans) or the week setup (coach_week_setup) were edited after the confirmation;
 *   unconfirmed — never confirmed.
 * No notification is sent (user's call 2026-11-25). Pure.
 */

export type WeekConfirmState = "confirmed" | "changed" | "unconfirmed";
export type WeekConfirmStatus = { weekStart: string; state: WeekConfirmState; confirmedAt: string | null };

const ms = (v: string | null | undefined): number => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : 0; };

/** One week's status from its confirmation time and the last edit of its days / setup. */
export function weekConfirmState(confirmedAt: string | null | undefined, lastEdits: Array<string | null | undefined>): WeekConfirmState {
  const c = ms(confirmedAt);
  if (!c) return "unconfirmed";
  return lastEdits.some((e) => ms(e) > c) ? "changed" : "confirmed";
}

/** Status per week from the rows the route reads (week_setups, week_plans, coach_week_setup). */
export function weekConfirmStatuses(rows: {
  setups: Array<{ week_start: string; confirmed_at: string | null }>;
  plans: Array<{ day_date: string; updated_at: string | null }>;
  coachSetups: Array<{ week_start_date: string; updated_at: string | null }>;
}): WeekConfirmStatus[] {
  const monday = (iso: string) => { const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const edits = new Map<string, Array<string | null>>();
  const push = (wk: string, v: string | null) => { const a = edits.get(wk) ?? []; a.push(v); edits.set(wk, a); };
  for (const p of rows.plans) push(monday(p.day_date), p.updated_at);
  for (const c of rows.coachSetups) push(monday(c.week_start_date), c.updated_at);
  return rows.setups.map((s) => ({ weekStart: s.week_start, confirmedAt: s.confirmed_at, state: weekConfirmState(s.confirmed_at, edits.get(s.week_start) ?? []) }));
}

const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_IS = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];

/** The words on the badge: "Confirmed · 24 Nov" / "Changed since confirmed" / "Not confirmed". */
export function weekConfirmLabel(s: Pick<WeekConfirmStatus, "state" | "confirmedAt"> | null | undefined, is: boolean): string {
  if (!s || s.state === "unconfirmed") return is ? "Óstaðfest" : "Not confirmed";
  if (s.state === "changed") return is ? "Breytt frá staðfestingu" : "Changed since confirmed";
  const d = new Date(String(s.confirmedAt));
  const day = Number.isFinite(d.getTime()) ? (is ? `${d.getDate()}. ${MON_IS[d.getMonth()]}` : `${d.getDate()} ${MON_EN[d.getMonth()]}`) : "";
  return is ? `Staðfest${day ? ` · ${day}` : ""}` : `Confirmed${day ? ` · ${day}` : ""}`;
}

/** The status in a word, for a narrow week chip (the full words go in its tooltip). */
export function weekConfirmShort(s: Pick<WeekConfirmStatus, "state"> | null | undefined, is: boolean): string {
  if (!s || s.state === "unconfirmed") return is ? "Óstaðfest" : "Not confirmed";
  return s.state === "changed" ? (is ? "Breytt" : "Changed") : (is ? "✓ Staðfest" : "✓ Confirmed");
}
