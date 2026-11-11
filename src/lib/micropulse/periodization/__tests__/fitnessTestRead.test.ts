import { describe, it, expect } from "vitest";
import { masSourceLabel, latestTestsByPlayer, freshestAerobicDate } from "../fitnessTestRead";

describe("masSourceLabel", () => {
  it("names the test in plain words and marks the 30-15 route as an estimate", () => {
    expect(masSourceLabel("vift_shrunk")).toEqual({ label: { en: "30-15 IFT", is: "30-15 IFT" }, estimated: true });
    expect(masSourceLabel("run_4min").label.en).toBe("4-min max run");
    expect(masSourceLabel("run_4min").estimated).toBe(false);
    expect(masSourceLabel("msft").label.en).toMatch(/Beep/);
    expect(masSourceLabel("vameval").estimated).toBe(false);
  });
});

describe("latestTestsByPlayer", () => {
  const rows = [
    { player_id: "a", test_date: "2026-03-01", test_type: "ift_30_15", result_value: 19.5, result_unit: "km/h" },
    { player_id: "a", test_date: "2026-06-01", test_type: "ift_30_15", result_value: "20", result_unit: null },
    { player_id: "a", test_date: "2026-05-01", test_type: "yo_yo_ir1", result_value: 1840, result_unit: "m" },
    { player_id: "a", test_date: "2026-05-02", test_type: "made_up", result_value: 1, result_unit: null },
    { player_id: "b", test_date: null, test_type: "ift_30_15", result_value: 18, result_unit: null },
    { player_id: "b", test_date: "2026-04-01", test_type: "sprint_max", result_value: null, result_unit: null },
  ];
  const m = latestTestsByPlayer(rows);

  it("keeps the newest result per test type, newest first, with the registry unit as fallback", () => {
    const a = m.get("a")!;
    expect(a.map((t) => t.type)).toEqual(["ift_30_15", "yo_yo_ir1"]);
    expect(a[0]).toMatchObject({ value: 20, unit: "km/h", date: "2026-06-01" });
  });

  it("drops rows without a date, a value, or a known test type", () => {
    expect(m.has("b")).toBe(false);
  });
});

describe("freshestAerobicDate", () => {
  it("counts any aerobic test (a Yo-Yo too) and the MAS date, but not a sprint", () => {
    const tests = [
      { type: "sprint_max" as const, label: { en: "", is: "" }, value: 31, unit: "km/h", date: "2026-09-01" },
      { type: "yo_yo_ir1" as const, label: { en: "", is: "" }, value: 1800, unit: "m", date: "2026-08-01" },
    ];
    expect(freshestAerobicDate(tests, ["2026-02-01", null])).toBe("2026-08-01");
    expect(freshestAerobicDate([tests[0]], [])).toBeNull();
    expect(freshestAerobicDate([], ["2026-02-01"])).toBe("2026-02-01");
  });
});
