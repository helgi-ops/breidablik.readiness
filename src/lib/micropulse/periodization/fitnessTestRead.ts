/**
 * How the Periodization Hub reads the team's recorded fitness tests (pure, client-safe).
 *
 * The results come from the same store Conditioning writes (`player_fitness_test`, all nine tests in
 * `load/fitnessTests.ts`) plus the older `player_running_test` 4-min runs. The MAS itself is resolved by
 * the shared `resolveMas` (speed zones) — this file only names where it came from and lists each
 * player's latest result per test, so the hub shows the test, its age, and whether it is an estimate.
 *
 * Descriptive planning context; never the readiness colour.
 */

import { FITNESS_TESTS, isFitnessTestType, type FitnessTestType } from "@/lib/micropulse/load/fitnessTests";
import type { MasSource } from "@/lib/micropulse/load/speedZones";
import { isAerobicMode } from "./testingSchedule";

type Bi = { en: string; is: string };

/** Plain name of the test a MAS came from, and whether the MAS is an estimate rather than measured. */
export function masSourceLabel(source: MasSource): { label: Bi; estimated: boolean } {
  switch (source) {
    case "vameval": return { label: FITNESS_TESTS.mas_vameval.label, estimated: false };
    case "msft": return { label: FITNESS_TESTS.msft_beep.label, estimated: false };
    case "run_4min": return { label: FITNESS_TESTS.mas_run_4min.label, estimated: false };
    case "vift_shrunk": return { label: FITNESS_TESTS.ift_30_15.label, estimated: true };
    case "cs_backcalc": return { label: { en: "Critical Speed", is: "Critical Speed" }, estimated: true };
  }
}

export type LatestTest = { type: FitnessTestType; label: Bi; value: number; unit: string; date: string };

type TestRow = { player_id: string | null; test_date: string | null; test_type: string | null; result_value: number | string | null; result_unit?: string | null };

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v
  : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v)
  : null;

/** Latest result per test type per player (newest date wins), ordered newest first. */
export function latestTestsByPlayer(rows: TestRow[]): Map<string, LatestTest[]> {
  const best = new Map<string, Map<FitnessTestType, LatestTest>>();
  for (const r of rows) {
    const pid = String(r.player_id ?? "");
    const type = r.test_type;
    const value = num(r.result_value);
    if (!pid || !r.test_date || !isFitnessTestType(type) || value == null) continue;
    const m = best.get(pid) ?? new Map<FitnessTestType, LatestTest>();
    const cur = m.get(type);
    if (!cur || r.test_date > cur.date) {
      m.set(type, { type, label: FITNESS_TESTS[type].label, value, unit: r.result_unit || FITNESS_TESTS[type].unit, date: r.test_date });
    }
    best.set(pid, m);
  }
  const out = new Map<string, LatestTest[]>();
  for (const [pid, m] of best) out.set(pid, [...m.values()].sort((a, b) => b.date.localeCompare(a.date)));
  return out;
}

/** Date of the freshest aerobic test of any kind (one of the six aerobic tests, or a running-test MAS). */
export function freshestAerobicDate(tests: LatestTest[], otherDates: Array<string | null | undefined> = []): string | null {
  const dates = [...tests.filter((t) => isAerobicMode(t.type)).map((t) => t.date), ...otherDates.filter((d): d is string => !!d)];
  if (!dates.length) return null;
  dates.sort();
  return dates[dates.length - 1];
}
