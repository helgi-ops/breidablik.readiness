import { describe, it, expect } from "vitest";
import { reconcile, planCompensations, type DeficitRow, type Clearance } from "../reconcile";
import { COMPENSATION_QUALITY, DEFICIT_QUALITY, feedsFor } from "../quality";

const row = (p: Partial<DeficitRow> & Pick<DeficitRow, "quality" | "source" | "status">): DeficitRow => ({
  confidence: 0.5, provenance: { en: p.source, is: p.source }, ...p,
});

describe("unified quality vocabulary", () => {
  it("every compensation + every screening deficit maps to a quality", () => {
    for (const q of Object.values(COMPENSATION_QUALITY)) expect(q).toBeTruthy();
    for (const q of Object.values(DEFICIT_QUALITY)) expect(q).toBeTruthy();
  });
  it("asymmetry feeds both consumers; mobility feeds corrective; power feeds strength", () => {
    expect(feedsFor("asymmetry").sort()).toEqual(["corrective", "strength"]);
    expect(feedsFor("mobility")).toEqual(["corrective"]);
    expect(feedsFor("power_reactive")).toEqual(["strength"]);
  });
});

describe("reconciler — aggregate same quality across sources", () => {
  it("valgus on screen + form + VALD = ONE confirmed, high-confidence deficit", () => {
    const rows: DeficitRow[] = [
      row({ quality: "landing_valgus", source: "movement_screen", status: "hypothesis", confidence: 0.5 }),
      row({ quality: "landing_valgus", source: "movement_form", status: "hypothesis", confidence: 0.6 }),
      row({ quality: "landing_valgus", source: "vald", status: "confirmed", confidence: 0.9 }),
    ];
    const [d] = reconcile(rows);
    expect(d.quality).toBe("landing_valgus");
    expect(d.sources).toHaveLength(3);
    expect(d.status).toBe("confirmed"); // a confirmed source promotes it
    expect(d.confidence).toBeGreaterThan(0.9); // base 0.9 + agreement bonus
    expect(d.confidenceTier).toBe("high");
    expect(d.compensations).toContain("dynamic_valgus"); // traceable to the corrective plan
  });

  it("a lone screening hypothesis stays a hypothesis (hint-level)", () => {
    const [d] = reconcile([row({ quality: "trunk_antirotation", source: "movement_form", status: "hypothesis", confidence: 0.4 })]);
    expect(d.status).toBe("hypothesis");
    expect(d.confidenceTier).toBe("hint");
  });

  it("two hypotheses agree → still hypothesis, but confidence rises above a lone one", () => {
    const one = reconcile([row({ quality: "ankle_dorsiflexion_mobility", source: "movement_form", status: "hypothesis", confidence: 0.5 })])[0];
    const two = reconcile([
      row({ quality: "ankle_dorsiflexion_mobility", source: "movement_form", status: "hypothesis", confidence: 0.5 }),
      row({ quality: "ankle_dorsiflexion_mobility", source: "movement_screen", status: "hypothesis", confidence: 0.5 }),
    ])[0];
    expect(two.status).toBe("hypothesis");
    expect(two.confidence).toBeGreaterThan(one.confidence);
  });

  it("confirmed deficits rank above hypotheses", () => {
    const out = reconcile([
      row({ quality: "trunk_antirotation", source: "movement_form", status: "hypothesis", confidence: 0.4 }),
      row({ quality: "limb_asymmetry", source: "vald", status: "confirmed", confidence: 0.9 }),
    ]);
    expect(out[0].quality).toBe("limb_asymmetry");
  });

  it("coach override: dismiss drops from the plan; confirm forces confirmed", () => {
    const rows: DeficitRow[] = [row({ quality: "reactive_strength", source: "movement_form", status: "hypothesis", confidence: 0.5 })];
    const dismissed = reconcile(rows, [{ quality: "reactive_strength", action: "dismiss" }])[0];
    expect(dismissed.overridden).toBe("dismiss");
    expect(planCompensations([dismissed])).toEqual([]); // excluded from the plan
    const confirmed = reconcile(rows, [{ quality: "reactive_strength", action: "confirm" }])[0];
    expect(confirmed.status).toBe("confirmed");
  });

  it("planCompensations feeds the corrective pipeline (non-medical, non-dismissed)", () => {
    const out = reconcile([
      row({ quality: "landing_valgus", source: "vald", status: "confirmed", confidence: 0.9 }),
      row({ quality: "glute_med_er_control", source: "movement_form", status: "hypothesis", confidence: 0.6 }),
    ]);
    const comps = planCompensations(out);
    expect(comps).toContain("dynamic_valgus");
    expect(comps).toContain("hip_abductor_weakness");
  });

  it("a medical row routes to clinician — no plan feeds, no compensations", () => {
    const [d] = reconcile([row({ quality: "glute_med_er_control", source: "clinical_ax", status: "confirmed", confidence: 0.9, medical: true })]);
    expect(d.medicalReferral).toBe(true);
    expect(d.feeds).toEqual([]);
    expect(d.compensations).toEqual([]);
  });
});

describe("reconciler — conflict surfacing (instrument clears a flagged quality)", () => {
  const clear = (quality: Clearance["quality"], source: Clearance["source"]): Clearance => ({ quality, source, provenance: { en: `${source} clean`, is: `${source} hreint` } });

  it("screen flags glute-med but VALD measured it clean → contested, capped to hint, note carries both sides", () => {
    const rows = [
      row({ quality: "glute_med_er_control", source: "movement_screen", status: "hypothesis", confidence: 0.5 }),
      row({ quality: "glute_med_er_control", source: "movement_form", status: "hypothesis", confidence: 0.6 }),
    ];
    const [d] = reconcile(rows, [], [clear("glute_med_er_control", "vald")]);
    expect(d.contested).toBe(true);
    expect(d.confidenceTier).toBe("hint"); // capped while the instrument disagrees
    expect(d.conflict?.assertedBy).toEqual(expect.arrayContaining(["movement_screen", "movement_form"]));
    expect(d.conflict?.clearedBy[0].source).toBe("vald");
    expect(d.conflict?.note.en).toMatch(/needs a look/i);
  });

  it("a clearance from a source that ALSO fired the quality is not a conflict", () => {
    // IMA both present as a firing row and (hypothetically) a clearance → same source, no conflict.
    const [d] = reconcile([row({ quality: "limb_asymmetry", source: "ima", status: "confirmed", confidence: 0.75 })], [], [clear("limb_asymmetry", "ima")]);
    expect(d.contested).toBe(false);
    expect(d.conflict).toBeUndefined();
  });

  it("a confirmed firing source contested by another instrument stays confirmed but flags contested", () => {
    // IMA fires asymmetry (confirmed); VALD measured symmetry (clean).
    const [d] = reconcile([row({ quality: "limb_asymmetry", source: "ima", status: "confirmed", confidence: 0.75 })], [], [clear("limb_asymmetry", "vald")]);
    expect(d.status).toBe("confirmed"); // a real measurement isn't erased
    expect(d.contested).toBe(true);
    expect(d.confidence).toBeGreaterThan(0.49); // confirmed is not capped
  });

  it("coach confirm overrides a conflict (coach decides) — no confidence cap", () => {
    const rows = [row({ quality: "glute_med_er_control", source: "movement_form", status: "hypothesis", confidence: 0.6 })];
    const [d] = reconcile(rows, [{ quality: "glute_med_er_control", action: "confirm" }], [clear("glute_med_er_control", "vald")]);
    expect(d.contested).toBe(true); // still surfaced
    expect(d.status).toBe("confirmed");
    expect(d.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("a clearance with no firing row for that quality produces nothing (no phantom deficit)", () => {
    const out = reconcile([], [], [clear("glute_med_er_control", "vald")]);
    expect(out).toEqual([]);
  });

  it("a medical deficit is never marked contested (clinician owns it)", () => {
    const [d] = reconcile([row({ quality: "glute_med_er_control", source: "rehab_track", status: "confirmed", confidence: 0.9, medical: true })], [], [clear("glute_med_er_control", "vald")]);
    expect(d.medicalReferral).toBe(true);
    expect(d.contested).toBe(false);
  });
});
