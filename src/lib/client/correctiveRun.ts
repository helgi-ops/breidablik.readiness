/**
 * Pure logic for the guided corrective circuit.
 *
 * Doses are free text from the trainer or AI ("2 × 20 s each side", "3x10",
 * "45 sek hvor hlið"). A timed dose becomes one step per set per side, with a
 * countdown. Anything else is one step the client marks done, so an odd dose
 * still works; it just gets no timer.
 */

export type DoseInfo = { sets: number; holdSeconds: number | null; perSide: boolean };

export type CorrectiveStepItem = {
  name: string; nameIs?: string | null;
  dose?: string | null; doseIs?: string | null;
  cue?: string | null; cueIs?: string | null;
  videoUrl?: string | null;
};

export type CorrectiveStep = {
  itemIndex: number;
  item: CorrectiveStepItem;
  holdSeconds: number | null;
  /** 1-based set within the exercise; null when the step covers it all. */
  set: number | null;
  totalSets: number;
  side: "left" | "right" | null;
};

export function parseDose(raw: string | null | undefined): DoseInfo {
  const s = (raw ?? "").toLowerCase();
  const setsMatch = s.match(/(\d+)\s*(?:x|×|\*)/);
  const sets = setsMatch ? Math.max(1, Number(setsMatch[1])) : 1;
  const min = s.match(/(\d+)\s*(?:min|mín)\b/);
  const sec = s.match(/(\d+)\s*(?:s|sec|secs|sek|seconds|sekúndur)\b/);
  const holdSeconds = min ? Number(min[1]) * 60 : sec ? Number(sec[1]) : null;
  const perSide = /each\s+(side|leg)|per\s+(side|leg)|\/\s*(side|leg)|hvor[an]?\s+(hlið|fót)|hvorri\s+hlið|á\s+hlið/.test(s);
  return { sets, holdSeconds: holdSeconds && holdSeconds > 0 ? holdSeconds : null, perSide };
}

export function buildSteps(items: CorrectiveStepItem[]): CorrectiveStep[] {
  const steps: CorrectiveStep[] = [];
  items.forEach((item, itemIndex) => {
    const d = parseDose(item.dose ?? item.doseIs);
    if (d.holdSeconds == null) {
      steps.push({ itemIndex, item, holdSeconds: null, set: null, totalSets: d.sets, side: null });
      return;
    }
    for (let set = 1; set <= d.sets; set++) {
      for (const side of (d.perSide ? ["left", "right"] : [null]) as Array<"left" | "right" | null>) {
        steps.push({ itemIndex, item, holdSeconds: d.holdSeconds, set, totalSets: d.sets, side });
      }
    }
  });
  return steps;
}

/** ISO weekdays (1=Mon) with any corrective scheduled. Item days override the
 *  prescription's weekdays, matching /api/client/today. */
export function plannedWeekdays(items: Array<{ days?: number[] | null }>, weekdays: number[]): number[] {
  const out = new Set<number>();
  for (const it of items) {
    const d = Array.isArray(it.days) && it.days.length ? it.days : weekdays;
    d.forEach((x) => out.add(x));
  }
  return Array.from(out).sort((a, b) => a - b);
}

/** Monday of the week holding this YYYY-MM-DD. */
export function weekStartIso(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
