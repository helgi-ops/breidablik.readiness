/**
 * Session-frequency adaptation.
 *
 * A plan template's weekly structure is authored at a fixed frequency (N sessions
 * on N weekdays). When a trainer assigns it to a client, they may want a different
 * weekly frequency ("this client trains 2× / week"). This module adapts a week's
 * sessions to a chosen frequency in a way that is deterministic and explainable:
 *
 *   - Sessions are taken in their authored order and CYCLED to fill the chosen
 *     frequency (freq > authored → repeat from the start; freq < authored → take
 *     the first `freq`). Truncating from the front keeps the most important
 *     sessions a trainer puts first.
 *   - The chosen sessions are spread across REAL ISO weekdays (Mon=1 … Sun=7)
 *     with rest days in between, because the client home screen resolves "today's
 *     session" by matching today's ISO weekday to `day_of_week`.
 *
 * The SAME function powers the assign-dialog preview and the server-side copy, so
 * what the trainer sees is exactly what the client receives (manifesto principle:
 * one source, visible everywhere).
 */

export interface PlanSessionLike {
  dayOfWeek?: number;
  name?: string;
  type?: string;
  [k: string]: unknown;
}

export interface PlanWeekLike {
  week?: number;
  sessions?: PlanSessionLike[];
  [k: string]: unknown;
}

/**
 * Even-ish weekday spreads with rest days between sessions where possible.
 * ISO weekday: Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=7.
 */
export const WEEKDAY_SPREAD: Record<number, number[]> = {
  1: [1],            // Mon
  2: [1, 4],         // Mon, Thu
  3: [1, 3, 5],      // Mon, Wed, Fri
  4: [1, 2, 4, 5],   // Mon, Tue, Thu, Fri
  5: [1, 2, 3, 4, 5],// Mon–Fri
  6: [1, 2, 3, 4, 5, 6], // Mon–Sat
};

export const MIN_FREQ = 1;
export const MAX_FREQ = 6;

export function clampFreq(freq: number): number {
  return Math.max(MIN_FREQ, Math.min(MAX_FREQ, Math.round(freq)));
}

/** The ISO weekdays a given weekly frequency will train on. */
export function spreadWeekdays(freq: number): number[] {
  const f = clampFreq(freq);
  return WEEKDAY_SPREAD[f] ?? Array.from({ length: f }, (_, i) => i + 1);
}

/**
 * Adapt one week's sessions to `freq` sessions, cycling the authored order and
 * re-spreading onto real weekdays. Preserves every other field on each session
 * (groups, exercises, type, notes, …) so prescriptions copy intact.
 */
export function adaptWeekSessions<T extends PlanSessionLike>(sessions: T[], freq: number): T[] {
  const src = Array.isArray(sessions) ? sessions : [];
  if (src.length === 0) return [];
  const f = clampFreq(freq);
  const days = spreadWeekdays(f);
  const out: T[] = [];
  for (let i = 0; i < f; i++) {
    const base = src[i % src.length];
    out.push({ ...base, dayOfWeek: days[i] });
  }
  return out;
}

/**
 * Adapt a whole multi-week structure. When `freq` is null/undefined the structure
 * is returned unchanged (default assign = authored behaviour, no surprises).
 */
export function adaptStructure<W extends PlanWeekLike>(
  structure: W[],
  freq: number | null | undefined,
): W[] {
  if (!freq || !Array.isArray(structure)) return structure;
  return structure.map((w) => ({
    ...w,
    sessions: adaptWeekSessions((w.sessions ?? []) as PlanSessionLike[], freq),
  })) as W[];
}

const WEEKDAY_LABELS: Record<"EN" | "IS", string[]> = {
  EN: ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  IS: ["", "Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"],
};

export interface SchedulePreviewRow {
  weekdayNum: number;
  weekday: string;
  name: string;
}

/**
 * Human-readable preview of how week 1 will be scheduled at a chosen frequency.
 * Pass `adapt = false` to preview the template's authored schedule unchanged.
 */
export function previewSchedule(
  sessions: PlanSessionLike[],
  freq: number,
  lang: "EN" | "IS",
  adapt = true,
): SchedulePreviewRow[] {
  const labels = WEEKDAY_LABELS[lang] ?? WEEKDAY_LABELS.EN;
  const rows = adapt ? adaptWeekSessions(sessions ?? [], freq) : (sessions ?? []);
  return rows.map((s, i) => {
    const d = typeof s.dayOfWeek === "number" ? s.dayOfWeek : i + 1;
    return {
      weekdayNum: d,
      weekday: labels[d] ?? String(d),
      name: String(s.name ?? `Session ${i + 1}`),
    };
  });
}
