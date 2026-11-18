/**
 * Which season phase a training week is in (2026-11-18) — ONE rule for Week setup, the strength engine and the
 * player's Today.
 *
 * The coach can save a phase on the week (`coach_week_setup.season_phase`); a saved phase always wins. When the
 * week has none, the phase comes from the season plan (the Macro phases `detectSeasonPhases` builds from the
 * fixtures and the coach's season dates). Before this, only Week setup used the season plan; the engine and
 * Today saw "no phase" (engine: unknown, Today: in season) for every week the coach had not saved.
 *
 * Boundaries: a phase's `end` is the next phase's `start` (pre-season ends on the first fixture; the off-season
 * ends on the next pre-season's first day), so on that date the LATER phase wins. Phases from this year's plan and
 * next year's are passed together, so the first week of a pre-season that opens in Nov/Dec reads as pre-season.
 *
 * Pure (client and server). The server read is `weekPhaseServer.ts`.
 */

export type WeekSeasonPhase = "preseason" | "inseason" | "playoffs" | "offseason";
export const WEEK_SEASON_PHASES: readonly WeekSeasonPhase[] = ["preseason", "inseason", "playoffs", "offseason"];

export type MacroPhaseSpan = { key: string; start: string; end: string };

export function isWeekSeasonPhase(v: unknown): v is WeekSeasonPhase {
  return typeof v === "string" && (WEEK_SEASON_PHASES as readonly string[]).includes(v);
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Monday (UTC) of the week holding `iso` — how Week setup keys its rows. */
export function mondayOfWeek(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
}

const MACRO_TO_WEEK: Record<string, WeekSeasonPhase> = { preseason: "preseason", competitive: "inseason", offseason: "offseason" };

/**
 * The Macro phase covering a week → the Week-setup phase. Macro keys are preseason / competitive / offseason
 * (playoffs is only ever the coach's own pick). In order: the phase the week starts in (a phase's last date
 * belongs to the next phase when one starts that day), then the phase the week ends in, then a phase that
 * starts mid-week.
 */
export function macroPhaseForWeek(weekStart: string, phases: MacroPhaseSpan[]): WeekSeasonPhase | null {
  if (!phases.length) return null;
  const weekEnd = addDays(weekStart, 6);
  const hit =
    phases.find((p) => p.start <= weekStart && weekStart < p.end) ??          // week starts inside a phase
    phases.find((p) => p.start <= weekStart && weekStart <= p.end) ??         // …on its last day (no phase follows)
    phases.find((p) => p.start <= weekEnd && weekEnd <= p.end) ??             // week ends inside a phase
    phases.find((p) => weekStart <= p.start && p.start <= weekEnd);           // a phase starts mid-week
  return hit ? (MACRO_TO_WEEK[hit.key] ?? null) : null;
}

/** The week's phase: the coach's saved one, else the season plan's. */
export function weekPhaseOf(saved: unknown, planPhase: WeekSeasonPhase | null): WeekSeasonPhase | null {
  return isWeekSeasonPhase(saved) ? saved : planPhase;
}
