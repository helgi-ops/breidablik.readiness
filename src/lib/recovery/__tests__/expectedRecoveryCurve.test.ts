import { describe, it, expect } from "vitest";
import { buildExpectedRecoveryCurve, compareToExpected, classifyDose } from "../expectedRecoveryCurve";

const nm = (c: ReturnType<typeof buildExpectedRecoveryCurve>) => c.curves.find((x) => x.process === "neuromuscular")!;
const bio = (c: ReturnType<typeof buildExpectedRecoveryCurve>) => c.curves.find((x) => x.process === "biochemical")!;
const ptPct = (c: ReturnType<typeof buildExpectedRecoveryCurve>, proc: string, hours: number) =>
  c.curves.find((x) => x.process === proc)!.points.find((p) => p.hoursPost === hours)!.pctCapacityBack;

describe("buildExpectedRecoveryCurve — sex-specific troughs", () => {
  it("female neuromuscular trough sits at 12–24h (delayed); male at ~24h (MD+1) but not delayed", () => {
    const f = buildExpectedRecoveryCurve({ sex: "female", matchImaDose: 150, minutes: 90 });
    const m = buildExpectedRecoveryCurve({ sex: "male", matchImaDose: 150, minutes: 90 });
    expect(nm(f).troughHours).toBeGreaterThanOrEqual(12);
    expect(nm(f).troughHours).toBeLessThanOrEqual(24);
    // Female NM is near-full immediately (delayed dip); male is already down immediately.
    expect(ptPct(f, "neuromuscular", 0)).toBeGreaterThan(ptPct(m, "neuromuscular", 0));
    // Female NM at 12h is well below its immediate value (the delayed dip appears).
    expect(ptPct(f, "neuromuscular", 12)).toBeLessThan(ptPct(f, "neuromuscular", 0));
    expect(nm(m).troughHours).toBe(24);
  });

  it("female biochemical curve has a 72h tail (fullByHours null); male settles by 72h", () => {
    const f = buildExpectedRecoveryCurve({ sex: "female", matchImaDose: 150, minutes: 90 });
    const m = buildExpectedRecoveryCurve({ sex: "male", matchImaDose: 150, minutes: 90 });
    expect(bio(f).fullByHours).toBeNull();
    expect(bio(m).fullByHours).toBe(72);
  });
});

describe("dose scaling", () => {
  it("higher IMA dose → deeper trough (lower capacity-back at the trough)", () => {
    const low = buildExpectedRecoveryCurve({ sex: "male", matchImaDose: 60, minutes: 20 });
    const high = buildExpectedRecoveryCurve({ sex: "male", matchImaDose: 260, minutes: 90 });
    expect(ptPct(high, "neuromuscular", 24)).toBeLessThan(ptPct(low, "neuromuscular", 24));
    expect(high.dose).toBe("high");
    expect(low.dose).toBe("low");
  });

  it("a high dose lengthens a would-settle biochemical tail on the male curve to null", () => {
    const m = buildExpectedRecoveryCurve({ sex: "male", matchImaDose: 260, minutes: 90 });
    expect(bio(m).fullByHours).toBeNull(); // high dose removes the 72h return
  });

  it("classifyDose bands", () => {
    expect(classifyDose(260, 90)).toBe("high");
    expect(classifyDose(50, 15)).toBe("low");
    expect(classifyDose(120, 60)).toBe("moderate");
    expect(classifyDose(null, null)).toBe("moderate"); // no dose → moderate template
  });
});

describe("compareToExpected — the whole point", () => {
  it("a 24h neuromuscular flag is on_track for women but behind for men", () => {
    const f = buildExpectedRecoveryCurve({ sex: "female", matchImaDose: 150, minutes: 90 });
    const m = buildExpectedRecoveryCurve({ sex: "male", matchImaDose: 60, minutes: 20 }); // low dose → male NM back up by 24h-ish
    const obs = [{ process: "neuromuscular" as const, hoursPost: 24, status: "lagging" as const }];
    expect(compareToExpected(f, obs)[0].tracking).toBe("on_track");
    // On a low-dose male curve the expected 24h capacity is high (not down) → a flag reads behind.
    const mCmp = compareToExpected(m, obs)[0];
    expect(mCmp.expectedPct).toBeGreaterThanOrEqual(80);
    expect(mCmp.tracking).toBe("behind");
  });

  it("recovered when expected-down reads ahead; no_data biochemical gets the tail note", () => {
    const f = buildExpectedRecoveryCurve({ sex: "female", matchImaDose: 200, minutes: 90 });
    const cmp = compareToExpected(f, [
      { process: "neuromuscular", hoursPost: 24, status: "recovered" },
      { process: "biochemical", hoursPost: 48, status: "no_data" },
    ]);
    expect(cmp[0].tracking).toBe("ahead");
    expect(cmp[1].tracking).toBe("no_data");
    expect(cmp[1].note.en.toLowerCase()).toContain("invisible");
  });
});

describe("unknown sex + confidence", () => {
  it("unknown → pooled template, labelled", () => {
    const u = buildExpectedRecoveryCurve({ sex: "unknown", matchImaDose: 150, minutes: 90 });
    expect(u.templateLabel.en.toLowerCase()).toContain("general");
    expect(u.sex).toBe("unknown");
  });
  it("confidence drops with a thin baseline", () => {
    expect(buildExpectedRecoveryCurve({ sex: "male", matchImaDose: 150, minutes: 90, baselineMaturityDays: 60 }).confidence).toBe("high");
    expect(buildExpectedRecoveryCurve({ sex: "male", matchImaDose: 150, minutes: 90, baselineMaturityDays: 25 }).confidence).toBe("moderate");
    expect(buildExpectedRecoveryCurve({ sex: "male", matchImaDose: 150, minutes: 90, baselineMaturityDays: 5 }).confidence).toBe("low");
    expect(buildExpectedRecoveryCurve({ sex: "male", matchImaDose: 150, minutes: 90 }).confidence).toBe("low"); // no baseline
  });
});

describe("null-safety + every curve carries a why", () => {
  it("no dose + no markers still returns a full moderate curve", () => {
    const c = buildExpectedRecoveryCurve({ sex: "female", matchImaDose: null, minutes: null });
    expect(c.dose).toBe("moderate");
    expect(c.curves).toHaveLength(4);
    for (const cu of c.curves) {
      expect(cu.points.length).toBeGreaterThan(0);
      expect(cu.why.en.length).toBeGreaterThan(0);
      expect(cu.points.every((p) => p.pctCapacityBack >= 0 && p.pctCapacityBack <= 100)).toBe(true);
    }
  });
});

describe("purity boundary — display only, never the verdict", () => {
  it("does not import readiness / decision / stage4 / colour engines", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("../expectedRecoveryCurve.ts", import.meta.url), "utf8");
    const imports = src.split("\n").filter((l) => /^\s*import\b/.test(l)).join("\n");
    for (const bad of ["readiness", "resolveFinalState", "stage4", "athlete_decision", "final_color", "v_coach_readiness"]) {
      expect(imports.includes(bad)).toBe(false);
    }
  });
});
