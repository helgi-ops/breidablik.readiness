import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchHipPaddles, isAbductionOnlyRow, splitHipRows } from "../hipPaddles";

const stub = (rows: Array<Record<string, unknown>>) =>
  ({ from: () => ({ select: () => ({ in: async () => ({ data: rows, error: null }) }) }) }) as unknown as SupabaseClient;

describe("fetchHipPaddles", () => {
  it("splits inner (adduction) and outer (abduction) pads per raw test", async () => {
    const m = await fetchHipPaddles(stub([{ id: "a", inL: "406.75", inR: "409.75", inAL: "300", inAR: "310", outL: "463.25", outR: "472.5", outAL: null, outAR: null }]), ["a"]);
    expect(m.get("a")?.adduction).toEqual({ leftN: 406.75, rightN: 409.75, avgLeftN: 300, avgRightN: 310 });
    expect(m.get("a")?.abduction.leftN).toBe(463.25);
  });
  it("returns nothing without ids or pad values", async () => {
    expect((await fetchHipPaddles(stub([]), [null, undefined])).size).toBe(0);
    expect((await fetchHipPaddles(stub([{ id: "b" }]), ["b"])).size).toBe(0);
  });
});

describe("isAbductionOnlyRow", () => {
  it("is true for the abduction half of a CSV upload only", () => {
    expect(isAbductionOnlyRow({ direction: "Pull", movement_pattern: "Hip AD/AB - 60 · Pull" })).toBe(true);
    expect(isAbductionOnlyRow({ direction: "Abduction" })).toBe(true);
    expect(isAbductionOnlyRow({ direction: "Squeeze" })).toBe(false);
    expect(isAbductionOnlyRow({ direction: null, movement_pattern: "Hip AD/AB - 60" })).toBe(false);
  });
});

describe("splitHipRows", () => {
  const isHip = (r: Record<string, unknown>) => /hip/i.test(String(r.test_type ?? ""));
  const pads = new Map([["raw-1", {
    adduction: { leftN: 287, rightN: 291, avgLeftN: null, avgRightN: null },
    abduction: { leftN: 329, rightN: 333, avgLeftN: null, avgRightN: null },
  }]]);
  it("turns one stored hip row into an adduction row and an abduction row", () => {
    const out = splitHipRows([{ raw_test_id: "raw-1", test_type: "Hip AD/AB", direction: null, left_peak_force_n: 329, right_peak_force_n: 333 }], pads, isHip);
    expect(out.map((r) => [r.direction, r.left_peak_force_n, r.right_peak_force_n])).toEqual([["Adduction", 287, 291], ["Abduction", 329, 333]]);
  });
  it("leaves ankle rows, CSV rows with a direction, and rows without raw pads alone", () => {
    const ankle = { raw_test_id: "raw-1", test_type: "Ankle Plantar Flexion", direction: null };
    const csv = { raw_test_id: "raw-1", test_type: "Hip AD/AB", direction: "Squeeze" };
    const noRaw = { raw_test_id: "raw-9", test_type: "Hip AD/AB", direction: null };
    expect(splitHipRows([ankle, csv, noRaw], pads, isHip)).toEqual([ankle, csv, noRaw]);
  });
});
