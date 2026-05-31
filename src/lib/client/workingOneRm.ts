/**
 * Auto-progression: the "working 1RM" the programme prescribes against.
 *
 * Closes the loop without forcing a manual retest every time: the tested 1RM
 * (LV profile) is the trusted anchor, and corroborated logged performance can
 * push the working 1RM UP automatically — within guardrails:
 *
 *   - Corroboration: the higher level must be hit on ≥2 separate sessions
 *     (28-day window), so a single fluke set can't inflate it.
 *   - Floor: never below the tested 1RM (a real test beats an estimate).
 *   - Cap: at most +10% above the tested 1RM. Beyond that the athlete has
 *     outgrown the test → we cap AND flag a retest (keep the human in the loop).
 *   - No test yet: a corroborated logged best becomes the working 1RM
 *     (source "logged"), so targets unlock from logging alone.
 *
 * Deterministic and rules-based (manifesto: rules decide). Auto-progression
 * only ever RAISES the number; decreases are handled by readiness/retest.
 */

import { canonicalLift, buildOneRmMap, type LvTest } from "@/lib/client/oneRepMax";

export type WorkingEntry = {
  one_rm: number;
  source: "tested" | "auto" | "logged";
  tested: number | null;
  needs_retest: boolean; // logged performance exceeds the +10% cap
};

export type SetLogRow = { session_date: string; exercise_name: string; weight_kg: number | null; reps: number | null };

const epley = (w: number, r: number) => w * (1 + Math.max(0, r) / 30);
const CAP_ABOVE_TESTED = 1.10; // working 1RM may sit at most 10% over the test
const MIN_SESSIONS = 2;        // corroboration

/** Per canonical lift, the corroborated logged best e1RM = the 2nd-highest
 *  per-session e1RM in the window (needs ≥2 sessions). */
function loggedReliableMap(setLogs: SetLogRow[], windowDays: number): Map<string, number> {
  const cutoff = new Date(); cutoff.setUTCDate(cutoff.getUTCDate() - windowDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  // canonical → (session_date → best e1rm)
  const byLift = new Map<string, Map<string, number>>();
  for (const s of setLogs) {
    if (s.weight_kg == null || s.reps == null || s.session_date < cutoffIso) continue;
    const lift = canonicalLift(s.exercise_name);
    if (!lift) continue;
    const e = epley(Number(s.weight_kg), Number(s.reps));
    if (!byLift.has(lift)) byLift.set(lift, new Map());
    const days = byLift.get(lift)!;
    if (!days.has(s.session_date) || e > (days.get(s.session_date) ?? 0)) days.set(s.session_date, e);
  }
  const out = new Map<string, number>();
  for (const [lift, days] of byLift) {
    if (days.size < MIN_SESSIONS) continue;
    const sorted = Array.from(days.values()).sort((a, b) => b - a);
    out.set(lift, sorted[1]); // 2nd-highest session = corroborated
  }
  return out;
}

export function computeWorkingOneRm(
  lvTests: LvTest[],
  setLogs: SetLogRow[],
  windowDays = 28,
): Map<string, WorkingEntry> {
  const tested = buildOneRmMap(lvTests);            // canonical → {oneRm,testDate}
  const logged = loggedReliableMap(setLogs, windowDays);
  const lifts = new Set<string>([...tested.keys(), ...logged.keys()]);
  const out = new Map<string, WorkingEntry>();

  for (const lift of lifts) {
    const t = tested.get(lift)?.oneRm ?? null;
    const l = logged.get(lift) ?? null;

    if (t != null) {
      if (l != null && l > t) {
        const cap = t * CAP_ABOVE_TESTED;
        if (l > cap) {
          out.set(lift, { one_rm: Math.round(cap * 10) / 10, source: "auto", tested: t, needs_retest: true });
        } else {
          out.set(lift, { one_rm: Math.round(l * 10) / 10, source: "auto", tested: t, needs_retest: false });
        }
      } else {
        out.set(lift, { one_rm: Math.round(t * 10) / 10, source: "tested", tested: t, needs_retest: false });
      }
    } else if (l != null) {
      out.set(lift, { one_rm: Math.round(l * 10) / 10, source: "logged", tested: null, needs_retest: false });
    }
  }
  return out;
}

/** Target weight for a prescribed row from the working-1RM map. Rounded to the
 *  nearest 2.5 kg. pct1rm may be a fraction (0.7) or whole number (70). */
export function workingTargetKg(
  exerciseName: string,
  pct1rm: number | null | undefined,
  workingMap: Map<string, WorkingEntry>,
): { kg: number; source: WorkingEntry["source"]; needs_retest: boolean } | null {
  if (pct1rm == null || !(pct1rm > 0)) return null;
  const lift = canonicalLift(exerciseName);
  if (!lift) return null;
  const w = workingMap.get(lift);
  if (!w) return null;
  const frac = pct1rm > 1 ? pct1rm / 100 : pct1rm;
  return { kg: Math.round((w.one_rm * frac) / 2.5) * 2.5, source: w.source, needs_retest: w.needs_retest };
}
