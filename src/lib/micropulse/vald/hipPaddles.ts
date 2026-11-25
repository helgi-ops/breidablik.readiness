/**
 * ForceFrame hip AD/AB: one test measures TWO movements — the inner pads (squeeze = ADDUCTION, the
 * groin) and the outer pads (push out = ABDUCTION). The normalised row (vald_forceframe_results)
 * keeps only the stronger pad set's left/right, so on a given day its L/R can be abduction. Anything
 * that reads "groin" must take the inner pads from the raw test instead (vald_raw_tests.payload),
 * as the strength test add-ons already do (strengthProgramming/testAddonsLoader.ts).
 *
 * CSV uploads arrive as one row per direction (direction / movement_pattern says which), so they
 * need no split; `isAbductionOnlyRow` keeps their abduction rows out of the groin read.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type HipPaddles = {
  adduction: { leftN: number | null; rightN: number | null; avgLeftN: number | null; avgRightN: number | null };
  abduction: { leftN: number | null; rightN: number | null; avgLeftN: number | null; avgRightN: number | null };
};

const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

const SELECT =
  "id, inL:payload->>innerLeftMaxForce, inR:payload->>innerRightMaxForce, inAL:payload->>innerLeftAvgForce, inAR:payload->>innerRightAvgForce, " +
  "outL:payload->>outerLeftMaxForce, outR:payload->>outerRightMaxForce, outAL:payload->>outerLeftAvgForce, outAR:payload->>outerRightAvgForce";

/** Inner (adduction) + outer (abduction) pads per raw test id. Missing / failed reads are simply absent. */
export async function fetchHipPaddles(sb: SupabaseClient, rawTestIds: Array<string | null | undefined>): Promise<Map<string, HipPaddles>> {
  const ids = [...new Set(rawTestIds.filter((x): x is string => typeof x === "string" && x.length > 0))];
  const out = new Map<string, HipPaddles>();
  if (!ids.length) return out;
  try {
    const { data } = await sb.from("vald_raw_tests").select(SELECT).in("id", ids);
    for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      const p: HipPaddles = {
        adduction: { leftN: num(r.inL), rightN: num(r.inR), avgLeftN: num(r.inAL), avgRightN: num(r.inAR) },
        abduction: { leftN: num(r.outL), rightN: num(r.outR), avgLeftN: num(r.outAL), avgRightN: num(r.outAR) },
      };
      if (p.adduction.leftN != null || p.adduction.rightN != null || p.abduction.leftN != null || p.abduction.rightN != null) {
        out.set(String(r.id), p);
      }
    }
  } catch {
    /* fall through: callers treat a missing entry as "no split available" */
  }
  return out;
}

/** A CSV row that is the abduction (pull / push-out) half only — never a groin read. */
export function isAbductionOnlyRow(row: { direction?: unknown; movement_pattern?: unknown }): boolean {
  const text = [row.direction, row.movement_pattern].filter((v) => typeof v === "string").join(" ");
  return /abduct|\bpull\b/i.test(text) && !/adduct|squeeze/i.test(text);
}

/** Direction labels written onto the split rows (read by the RTP groin label and the VALD panel). */
export const HIP_ADDUCTION = "Adduction";
export const HIP_ABDUCTION = "Abduction";

/**
 * Split each API hip AD/AB row (no direction, one stored pad set) into an adduction row and an
 * abduction row from its raw pads. Rows that are not hip, already carry a direction (CSV), or have
 * no raw pads pass through unchanged. Order is kept (newest-first stays newest-first).
 */
export function splitHipRows(rows: Array<Record<string, unknown>>, paddles: Map<string, HipPaddles>, isHip: (r: Record<string, unknown>) => boolean): Array<Record<string, unknown>> {
  return rows.flatMap((r) => {
    const p = !r.direction && isHip(r) ? paddles.get(String(r.raw_test_id ?? "")) : undefined;
    if (!p) return [r];
    const half = (dir: string, h: HipPaddles["adduction"]) => ({
      ...r, direction: dir, left_peak_force_n: h.leftN, right_peak_force_n: h.rightN,
      left_avg_force_n: h.avgLeftN, right_avg_force_n: h.avgRightN, asymmetry_percent: null, asymmetry_side: null,
    });
    return [half(HIP_ADDUCTION, p.adduction), half(HIP_ABDUCTION, p.abduction)]
      .filter((h) => h.left_peak_force_n != null || h.right_peak_force_n != null);
  });
}
