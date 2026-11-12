import { describe, expect, it } from "vitest";
import {
  VBT_METHODS,
  VBT_METHOD_BY_KEY,
  VBT_TOLERANCE_MS,
  VBT_LOAD_STEP_PCT,
  VBT_EXTRA_REST_SEC,
  V1RM_TABLE2,
  sanitizeVbtPrescription,
  missingVbtParams,
  formatVbtForPlayer,
  formatVbtForCoach,
  readVbtPlayerCard,
  fmtSpeed,
  type VbtMethodKey,
} from "../index";

describe("VBT methods — Weakley et al. 2021 Table 5 as data", () => {
  it("has the six rows once each, in table order", () => {
    expect(VBT_METHODS.map((m) => m.tableRow)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(VBT_METHODS.map((m) => m.key)).size).toBe(6);
  });

  it("prescribed / flexible matrix matches Table 5", () => {
    const P = "prescribed", F = "flexible";
    const want: Record<VbtMethodKey, [string, string, string]> = {
      set_avg_velocity: [P, P, F],
      set_avg_velocity_vl: [P, F, F],
      target_velocity_vl: [P, F, F],
      fixed_set_vl: [P, F, P],
      fixed_total_reps_vl: [F, P, P],
      fixed_set_vl_rep_cap: [P, F, P],
    };
    for (const m of VBT_METHODS) expect([m.control.sets, m.control.reps, m.control.load]).toEqual(want[m.key]);
  });

  it("every method is bilingual, has steps and cites Table 5", () => {
    for (const m of VBT_METHODS) {
      for (const b of [m.label, m.summary, m.paperRule, ...m.coachSteps]) {
        expect(b.en.length).toBeGreaterThan(0);
        expect(b.is.length).toBeGreaterThan(0);
      }
      expect(m.coachSteps.length).toBeGreaterThan(0);
      expect(m.refs.some((r) => r.includes("Weakley et al. 2021"))).toBe(true);
    }
  });

  it("each method's own example is a valid prescription", () => {
    for (const m of VBT_METHODS) expect(sanitizeVbtPrescription(m.example)).not.toBeNull();
  });

  it("keeps the paper's constants and Table 2", () => {
    expect(VBT_TOLERANCE_MS).toBe(0.06);
    expect(VBT_LOAD_STEP_PCT).toEqual([4, 5]);
    expect(VBT_EXTRA_REST_SEC).toBe(30);
    const v = Object.fromEntries(V1RM_TABLE2.map((r) => [r.key, r.v1rm]));
    expect(v).toMatchObject({ bench_press: 0.17, prone_pull_up: 0.23, lat_pulldown: 0.47, squat: 0.3, deadlift: 0.15, leg_press: 0.21 });
    expect(V1RM_TABLE2).toHaveLength(10);
  });
});

describe("sanitizeVbtPrescription", () => {
  it("rejects junk and unknown methods", () => {
    expect(sanitizeVbtPrescription(null)).toBeNull();
    expect(sanitizeVbtPrescription({ method: "nope", velocityLossPct: 10 })).toBeNull();
  });

  it("rejects a missing required number", () => {
    expect(sanitizeVbtPrescription({ method: "fixed_set_vl" })).toBeNull();
    expect(sanitizeVbtPrescription({ method: "fixed_set_vl_rep_cap", velocityLossPct: 10 })).toBeNull();
    expect(sanitizeVbtPrescription({ method: "set_avg_velocity_vl", velocityLossPct: 20, velocityMin: 0.7 })).toBeNull();
  });

  it("clamps, rounds, swaps a reversed zone and drops unused numbers", () => {
    expect(sanitizeVbtPrescription({ method: "fixed_set_vl", velocityLossPct: 80, repCap: 5, targetVelocity: 0.7 }))
      .toEqual({ method: "fixed_set_vl", velocityLossPct: 50 });
    expect(sanitizeVbtPrescription({ method: "set_avg_velocity_vl", velocityLossPct: "20", velocityMin: 0.88, velocityMax: "0,74" }))
      .toEqual({ method: "set_avg_velocity_vl", velocityLossPct: 20, velocityMin: 0.74, velocityMax: 0.88 });
    expect(sanitizeVbtPrescription({ method: "fixed_total_reps_vl", totalReps: 24.6, velocityLossPct: 9.6 }))
      .toEqual({ method: "fixed_total_reps_vl", totalReps: 25, velocityLossPct: 10 });
  });

  it("method 3 takes a start speed or a zone, and keeps the zone when given both", () => {
    expect(sanitizeVbtPrescription({ method: "target_velocity_vl", targetVelocity: 0.7, velocityLossPct: 10 }))
      .toEqual({ method: "target_velocity_vl", targetVelocity: 0.7, velocityLossPct: 10 });
    expect(sanitizeVbtPrescription({ method: "target_velocity_vl", targetVelocity: 0.7, velocityMin: 0.7, velocityMax: 0.75, velocityLossPct: 10 }))
      .toEqual({ method: "target_velocity_vl", velocityMin: 0.7, velocityMax: 0.75, velocityLossPct: 10 });
  });

  it("missingVbtParams names what the picker still needs", () => {
    expect(missingVbtParams({ method: "fixed_set_vl_rep_cap", velocityLossPct: 10 })).toEqual(["repCap"]);
    expect(missingVbtParams({ method: "target_velocity_vl" })).toEqual(["targetVelocity", "velocityLossPct"]);
    expect(missingVbtParams({ method: "fixed_set_vl", velocityLossPct: 20 })).toEqual([]);
  });
});

describe("formatVbtForPlayer", () => {
  const JARGON = /\b(VL|LVP|1RM|MCV|V1RM)\b/;

  it("every method reads plainly in both languages", () => {
    for (const m of VBT_METHODS) {
      const p = sanitizeVbtPrescription(m.example)!;
      for (const lang of ["EN", "IS"] as const) {
        const c = formatVbtForPlayer(p, lang);
        expect(c.headline.length).toBeGreaterThan(10);
        expect(c.facts.length).toBeLessThanOrEqual(3);
        expect(c.steps.length).toBeGreaterThan(1);
        for (const s of [c.headline, ...c.facts, ...c.steps]) expect(s).not.toMatch(JARGON);
        expect(c.cite).toContain("Weakley");
        expect(c.note.length).toBeGreaterThan(0);
      }
    }
  });

  it("method 6 says the stop rule first and the cap as a fact", () => {
    const c = formatVbtForPlayer({ method: "fixed_set_vl_rep_cap", velocityLossPct: 10, repCap: 5 }, "EN");
    expect(c.headline).toBe("Stop the set when bar speed drops 10% from your fastest rep.");
    expect(c.facts).toContain("Never more than 5 reps in a set.");
    const is = formatVbtForPlayer({ method: "fixed_set_vl_rep_cap", velocityLossPct: 10, repCap: 5 }, "IS");
    expect(is.headline).toBe("Hættu settinu þegar stangarhraðinn fellur um 10% frá hraðustu endurtekningunni.");
  });

  it("uses a decimal comma in Icelandic", () => {
    const p = { method: "set_avg_velocity_vl" as const, velocityMin: 0.74, velocityMax: 0.88, velocityLossPct: 20 };
    expect(formatVbtForPlayer(p, "EN").facts[0]).toContain("0.74–0.88 m/s");
    expect(formatVbtForPlayer(p, "IS").facts[0]).toContain("0,74–0,88 m/s");
    expect(fmtSpeed(0.7, "IS")).toBe("0,70");
  });

  it("method 3 carries the 0.06 window, the extra 30 s and the 4–5% step", () => {
    const c = formatVbtForPlayer({ method: "target_velocity_vl", targetVelocity: 0.7, velocityLossPct: 10 }, "EN");
    expect(c.facts[0]).toContain("0.06 m/s");
    expect(c.facts[0]).toContain("30 s");
    expect(c.facts[0]).toContain("4–5%");
  });

  it("method 5 leads with the total", () => {
    expect(formatVbtForPlayer({ method: "fixed_total_reps_vl", totalReps: 25, velocityLossPct: 20 }, "EN").headline)
      .toBe("Do 25 reps in total, in as many sets as you need.");
  });
});

describe("formatVbtForCoach / readVbtPlayerCard", () => {
  it("one plain coach line", () => {
    expect(formatVbtForCoach({ method: "fixed_set_vl_rep_cap", velocityLossPct: 10, repCap: 5 }, "EN"))
      .toBe("Stop rule + rep cap · stop at −10% speed · max 5 reps");
  });

  it("round-trips a card and rejects malformed ones", () => {
    const c = formatVbtForPlayer(VBT_METHOD_BY_KEY.fixed_set_vl.example, "EN");
    expect(readVbtPlayerCard(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(readVbtPlayerCard({ ...c, key: "nope" })).toBeNull();
    expect(readVbtPlayerCard({ ...c, facts: "x" })).toBeNull();
    expect(readVbtPlayerCard({ ...c, headline: "" })).toBeNull();
    expect(readVbtPlayerCard(null)).toBeNull();
  });
});
