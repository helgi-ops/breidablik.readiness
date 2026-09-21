/**
 * Football-side wrapper turning a player's logged working sets into working-1RM entries per lift,
 * and a prescribed %1RM into a real kg target. A thin adapter over the CLIENT formulas — it reuses
 * the RIR-aware e1RM (Epley/Brzycki/Lombardi) and the working-1RM guardrails verbatim (corroboration
 * on ≥2 sessions, floor = tested 1RM, +10% cap → needs_retest, auto only ever raises). No new maths.
 *
 * Descriptive coaching aid: the working 1RM and kg targets never set the readiness colour or the
 * daily decision (session load stays on session_rpe_entries). Pure, no I/O.
 *
 * Cite: Epley 1985 · Brzycki 1993 · Lombardi 1989 (1RM estimation); Zourdos 2016, Helms 2016 (RIR/RPE).
 */

import { computeWorkingOneRm, workingTargetKg, type SetLogRow, type WorkingEntry } from "@/lib/client/workingOneRm";
import { canonicalLift, type LvTest } from "@/lib/client/oneRepMax";

export type { SetLogRow, WorkingEntry } from "@/lib/client/workingOneRm";

const TODAY = () => new Date().toISOString().slice(0, 10);

/**
 * Working 1RM (kg) per canonical lift from logged sets, blended with any coach-entered/tested 1RMs
 * (`testedByLift`: canonical lift → tested kg). Only main barbell lifts (`canonicalLift` resolves)
 * get an entry; accessories stay RPE-only (absent from the map). Returns a plain record for the
 * engine/card. Reuses `computeWorkingOneRm`'s guardrails — no progression rule re-implemented.
 */
export function oneRepMaxesFromLogs(sets: SetLogRow[], testedByLift?: Record<string, number>): Record<string, WorkingEntry> {
  const today = TODAY();
  const lvTests: LvTest[] = Object.entries(testedByLift ?? {})
    .filter(([, kg]) => typeof kg === "number" && Number.isFinite(kg) && kg > 0)
    .map(([lift, kg]) => ({ exercise_label: lift, est_one_rm: kg, test_date: today }));

  const map = computeWorkingOneRm(lvTests, sets ?? []);
  return Object.fromEntries(map);
}

/**
 * Target kg for a prescribed %1RM on a lift (name or canonical key), from the working-1RM record.
 * `pct` may be a fraction (0.85) or a whole number (85). Null when there is no working 1RM for the
 * lift yet (→ the surface shows RPE-only). Rounds to the nearest 2.5 kg (reuses `workingTargetKg`).
 */
export function targetKgForPercent(lift: string, pct: number, working: Record<string, WorkingEntry>): number | null {
  if (!canonicalLift(lift)) return null; // accessory / unmapped → RPE only
  const map = new Map<string, WorkingEntry>(Object.entries(working ?? {}));
  return workingTargetKg(lift, pct, map)?.kg ?? null;
}
