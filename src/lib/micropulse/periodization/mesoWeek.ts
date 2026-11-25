/**
 * The Meso week in the shape Meso saves it (week_plans days) — one place for:
 *   - the calendar-day → week_plans mapping the Meso pages write (hub auto-save, the pre-season day edits);
 *   - the in-season block skeleton (seed → the coach's saved days → fixtures → breaks), shared by the Meso
 *     in-season page and the Micro seed, so Micro shows the week the Meso page shows (season-setup lota 4).
 * Pure. No new numbers or rules: this only moves what the hub already did.
 */

import { buildCalendarBlock, seedBlockDays, type CalDay, type CalType, type CalWeek, type CalendarBlock } from "./index";

/** One day as week_plans holds it (the applyWeekSetup payload). */
export type PlanDay = {
  day_index: number;
  day_date: string;
  day_type: "GAME" | "OFF" | "TRAIN";
  focus: string | null;
  day_intent: "GAME" | "OFF" | null;
};

/** The Meso calendar always seeds a full 6-week skeleton; a block renders its own length within it. */
export const MESO_HORIZON = 6;

/** The week the Meso pages show, for Micro's seed: week_plans days + the pre-season's assumed game. */
export type MesoWeekSeed = { source: "preseason" | "inseason"; days: PlanDay[]; assumedGame: { date: string; coachSet: boolean } | null };

const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

/** Reverse of the focus label → CalType, so a saved training day reads its stimulus back. Substring match because
 *  focus carries the MD tag too, e.g. "MD-5 Mechanical". */
export const caltypeFromFocus = (focus: string): CalType | undefined => {
  const f = focus.toLowerCase();
  if (f.includes("mechanical")) return "mechanical";
  if (f.includes("locomotive")) return "locomotive";
  if (f.includes("mixed")) return "mixed";
  if (f.includes("activation")) return "activation";
  if (f.includes("top-up") || f.includes("topup") || f.includes("áfyll")) return "topup";
  return undefined;
};
/** A chosen training stimulus → the English word written into week_plans.focus (round-trips through caltypeFromFocus). */
export const CALTYPE_FOCUS_LABEL: Partial<Record<CalType, string>> = { mechanical: "Mechanical", locomotive: "Locomotive", mixed: "Mixed", activation: "Activation", topup: "Top-up" };

/**
 * One calendar day → its week_plans row. focus is free text: the MD tag (+ the stimulus on a training day, e.g.
 * "MD-5 Mechanical"); a rest day keeps its MD tag ("MD+2"). day_intent has a CHECK constraint
 * (FORCE/NEURAL_VELOCITY/POLISH_CALM/ACTIVATION/GAME/OFF|null) so it never holds an MD tag: GAME / OFF / null.
 */
export function planDayFromCal(d: Pick<CalDay, "type" | "md" | "label">, weekStart: string, i: number, override?: { rest?: boolean; label?: string }): PlanDay {
  const isMatch = d.type === "match";
  const isRest = override?.rest ?? d.type === "rest";
  const trainLabel = override?.label ?? d.label.en;
  return {
    day_index: i + 1,
    day_date: addDays(weekStart, i),
    day_type: isMatch ? "GAME" : isRest ? "OFF" : "TRAIN",
    focus: isMatch ? null : isRest ? (d.md || null) : [d.md, trainLabel].filter(Boolean).join(" "),
    day_intent: isMatch ? "GAME" : isRest ? "OFF" : null,
  };
}

/** A calendar week → its seven week_plans rows. */
export function planDaysFromCalWeek(w: Pick<CalWeek, "weekStart"> & { days: Array<Pick<CalDay, "type" | "md" | "label">> }): PlanDay[] {
  return w.days.map((d, i) => planDayFromCal(d, w.weekStart, i));
}

export type SavedPlanDay = { dayType: string; focus: string | null };
type SeedOpts = Parameters<typeof seedBlockDays>[0];

/**
 * The in-season Meso skeleton: the auto layout (session/off only — never a fabricated game), then the coach's saved
 * days (a saved OFF stays off, a saved training day keeps its stimulus), then the fixtures (the only source of games),
 * then the declared team breaks (forced off, start <= day <= end).
 */
export function mesoSkeleton(opts: SeedOpts & { savedPlans: Record<string, SavedPlanDay>; teamBreaks: Array<{ start_date: string; end_date: string }> }): { days: Record<string, "match" | "session" | "off">; types: Record<string, CalType> } {
  const seed = seedBlockDays(opts);
  const mon = (() => { const d = new Date(`${opts.startDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  const sk: Record<string, "match" | "session" | "off"> = { ...seed.days };
  const ov: Record<string, CalType> = { ...seed.types };
  const n = opts.numWeeks * 7;
  for (let k = 0; k < n; k++) {
    const iso = addDays(mon, k);
    const sp = opts.savedPlans[iso];
    if (!sp) continue;
    if (sp.dayType === "OFF") { sk[iso] = "off"; delete ov[iso]; }
    else if (sp.dayType === "TRAIN" || sp.dayType === "RECOVERY") {
      sk[iso] = "session";
      const ct = sp.focus ? caltypeFromFocus(sp.focus) : undefined;
      if (ct) ov[iso] = ct;
    }
  }
  const endIso = addDays(mon, n);
  for (const f0 of opts.allFixtures) { const f = f0.slice(0, 10); if (f >= mon && f < endIso) { sk[f] = "match"; delete ov[f]; } }
  if (opts.teamBreaks.length) {
    for (let k = 0; k < n; k++) {
      const iso = addDays(mon, k);
      if (opts.teamBreaks.some((b) => b.start_date <= iso && iso <= b.end_date)) { sk[iso] = "off"; delete ov[iso]; }
    }
  }
  return { days: sk, types: ov };
}

/** The skeleton split into the sets buildCalendarBlock consumes. */
export function skeletonSets(sk: Record<string, "match" | "session" | "off">): { matchDates: string[]; offDays: string[]; onDays: string[] } {
  const matchDates: string[] = [], offDays: string[] = [], onDays: string[] = [];
  for (const [k, v] of Object.entries(sk)) { if (v === "match") matchDates.push(k); else if (v === "off") offDays.push(k); else onDays.push(k); }
  return { matchDates, offDays, onDays };
}

/**
 * The in-season Meso block calendar exactly as the Meso page builds it for the team: the skeleton over `seedWeeks`
 * weeks, then buildCalendarBlock over the block's own length. Micro reads one week of it as its seed.
 */
export function mesoBlockCalendar(opts: {
  seed: SeedOpts;
  savedPlans: Record<string, SavedPlanDay>;
  teamBreaks: Array<{ start_date: string; end_date: string }>;
  calendar: Omit<Parameters<typeof buildCalendarBlock>[0], "matchDates" | "offDays" | "onDays" | "typeOverrides">;
}): CalendarBlock {
  const sk = mesoSkeleton({ ...opts.seed, savedPlans: opts.savedPlans, teamBreaks: opts.teamBreaks });
  return buildCalendarBlock({ ...opts.calendar, ...skeletonSets(sk.days), typeOverrides: sk.types });
}
