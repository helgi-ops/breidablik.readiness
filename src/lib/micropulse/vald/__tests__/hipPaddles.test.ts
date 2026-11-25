import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchHipPaddles, isAbductionOnlyRow } from "../hipPaddles";

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
