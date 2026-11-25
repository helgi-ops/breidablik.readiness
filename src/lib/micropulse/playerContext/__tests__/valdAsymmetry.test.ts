import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchValdAsymmetry } from "../domains";

type Row = Record<string, unknown>;
/** Chainable stub: every builder call returns itself; awaiting gives the table's rows. */
function stubClient(byTable: Record<string, Row[]>): SupabaseClient {
  const from = (table: string) => {
    const result = { data: byTable[table] ?? [], error: null };
    const builder: Record<string, unknown> = new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") return (res: (v: typeof result) => unknown) => Promise.resolve(result).then(res);
        return () => builder;
      },
    });
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

const TODAY = "2026-11-25";

describe("fetchValdAsymmetry", () => {
  it("reads the hip test's adduction and abduction from the raw pads and takes the worse gap", async () => {
    // Stored row = the stronger (abduction) pads, 1% gap. Raw adduction pads: 12% gap.
    const r = await fetchValdAsymmetry(stubClient({
      vald_nordbord_results: [],
      vald_forcedecks_results: [],
      vald_forceframe_results: [{ is_valid: true, raw_test_id: "raw-1", test_type: "Hip AD/AB", direction: null, test_timestamp: "2026-11-20T10:00:00Z", left_peak_force_n: 400, right_peak_force_n: 404, asymmetry_percent: 1, asymmetry_side: "left" }],
      vald_raw_tests: [{ id: "raw-1", inL: "300", inR: "264", outL: "400", outR: "404" }],
    }), "p1", TODAY);
    expect(r.pct).toBe(12);
    expect(r.weakerSide).toBe("R");
  });

  it("computes from peak force before a stored 0% (legacy rows)", async () => {
    const r = await fetchValdAsymmetry(stubClient({
      vald_nordbord_results: [{ is_valid: true, test_timestamp: "2026-11-20T10:00:00Z", left_peak_force_n: 300, right_peak_force_n: 400, asymmetry_percent: 0, asymmetry_side: null }],
      vald_forceframe_results: [],
      vald_forcedecks_results: [],
    }), "p1", TODAY);
    expect(r.pct).toBe(25);
    expect(r.weakerSide).toBe("L");
  });

  it("reads stored 'left' / 'right' sides (CMJ)", async () => {
    const r = await fetchValdAsymmetry(stubClient({
      vald_nordbord_results: [],
      vald_forceframe_results: [],
      vald_forcedecks_results: [
        { is_valid: true, asymmetry_percent: 8, asymmetry_side: "right" },
        { is_valid: true, asymmetry_percent: 9, asymmetry_side: "right" },
        { is_valid: true, asymmetry_percent: 7, asymmetry_side: "left" },
      ],
    }), "p1", TODAY);
    expect(r.pct).toBe(8);
    expect(r.weakerSide).toBe("R");
  });
});
