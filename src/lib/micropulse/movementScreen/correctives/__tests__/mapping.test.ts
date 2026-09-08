import { describe, it, expect } from "vitest";
import { SEED_MOVEMENT_TESTS } from "../../registry";
import { interpretScreen, type ScreenFinding } from "../../interpret";
import { prescribeCorrectives, compensationsForReadings, prescriptionToStructure, prescribeForRegionFields, compensationsForRegionFields } from "../mapping";

const OHSA = SEED_MOVEMENT_TESTS.find((t) => t.slug === "overhead_squat_assessment")!;
const SLDJ = SEED_MOVEMENT_TESTS.find((t) => t.slug === "single_leg_drop_jump")!;

describe("prescribeCorrectives", () => {
  // Aron: dynamic knee valgus + excessive forward trunk lean.
  const findings: ScreenFinding[] = [
    { variableKey: "knee_valgus", severity: "marked", value: 0.267 },
    { variableKey: "forward_lean", severity: "moderate", value: 55 },
  ];
  const readings = interpretScreen(OHSA, findings, {}).readings;

  it("maps the two findings to their compensations", () => {
    const keys = compensationsForReadings(readings);
    expect(keys).toContain("dynamic_valgus");
    expect(keys).toContain("forward_trunk_lean");
  });

  it("builds an ordered inhibit→lengthen→activate→integrate block", () => {
    const p = prescribeCorrectives(readings)!;
    expect(p).not.toBeNull();
    const order = p.phases.map((g) => g.phase);
    // Phases appear in the NASM order (a subset, but never out of order).
    const idx = order.map((ph) => ["inhibit", "lengthen", "activate", "integrate"].indexOf(ph));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    // Activation is %MVIC-ranked low → high (bilateral bridge before top-Gmed work).
    const activate = p.phases.find((g) => g.phase === "activate")!;
    expect(activate.items[0].slug).toBe("glute_bridge"); // low %MVIC first
    const bridgeIdx = activate.items.findIndex((e) => e.slug === "glute_bridge");
    const sideLyingIdx = activate.items.findIndex((e) => e.slug === "side_lying_hip_abduction");
    expect(bridgeIdx).toBeLessThan(sideLyingIdx); // low before very-high
  });

  it("marks exactly ONE primary per phase; the rest are secondary alternatives", () => {
    const p = prescribeCorrectives(readings)!;
    for (const g of p.phases) {
      expect(g.items.filter((e) => e.tier === "primary")).toHaveLength(1);
      expect(g.items[0].tier).toBe("primary"); // the phase's lead exercise
      expect(g.items.slice(1).every((e) => e.tier === "secondary")).toBe(true);
    }
  });

  it("de-duplicates shared correctives (ankle-DF appears once) and combines the priority", () => {
    const p = prescribeCorrectives(readings)!;
    const allSlugs = p.phases.flatMap((g) => g.items.map((e) => e.slug));
    expect(allSlugs.filter((s) => s === "ankle_df_knee_to_wall")).toHaveLength(1);
    expect(allSlugs.filter((s) => s === "calf_stretch_gastroc")).toHaveLength(1);
    // Shared root cause surfaces once as a combined priority.
    const prio = p.priorities.map((x) => x.key);
    expect(prio.filter((k) => k === "ankle_dorsiflexion")).toHaveLength(1);
    expect(prio).toContain("glute_med_max");
    expect(prio).toContain("posterior_chain");
  });

  it("includes the coach's supplied exercise (half-kneeling banded hip ER) with its video", () => {
    const p = prescribeCorrectives(readings)!;
    const ex = p.phases.flatMap((g) => g.items).find((e) => e.slug === "half_kneeling_banded_hip_er")!;
    expect(ex).toBeTruthy();
    expect(ex.videoUrl).toMatch(/sWofU_ssCb0/);
  });

  it("carries the honest caveat + a re-screen window, and serializes to {block, items}", () => {
    const p = prescribeCorrectives(readings)!;
    expect(p.caveat.en).toMatch(/re-screen/i);
    expect(p.caveat.en).toMatch(/not an injury-risk|NOT an injury/i);
    expect(p.reScreenInDays).toBeGreaterThan(0);
    const structure = prescriptionToStructure(p, true);
    expect(structure.length).toBe(p.phases.length);
    expect(structure[0].items.length).toBeGreaterThan(0);
    expect(typeof structure[0].items[0]).toBe("string");
  });

  it("returns null when nothing maps to a grounded corrective set", () => {
    expect(prescribeCorrectives([])).toBeNull();
  });

  it("single-leg drop jump signature findings (RSI, stiff landing, LSI) now prescribe", () => {
    const findings: ScreenFinding[] = [
      { variableKey: "rsi", severity: "moderate", value: 0.4 },
      { variableKey: "knee_flexion_absorption", severity: "moderate", value: 60 },
      { variableKey: "lsi", leg: "L", severity: "marked", value: 82 },
    ];
    const readings = interpretScreen(SLDJ, findings, {}).readings;
    const p = prescribeCorrectives(readings)!;
    expect(p).not.toBeNull();
    const prio = p.priorities.map((x) => x.key);
    expect(prio).toContain("reactive_strength");
    expect(prio).toContain("eccentric_absorption");
    expect(prio).toContain("unilateral_weaker_side");
    const slugs = p.phases.flatMap((g) => g.items.map((e) => e.slug));
    expect(slugs).toContain("pogo_hops"); // reactive strength
    expect(slugs).toContain("single_leg_squat"); // unilateral (asymmetry)
    // De-duplicated: drop_landing_soft_catch is in two sets but appears once.
    expect(slugs.filter((s) => s === "drop_landing_soft_catch")).toHaveLength(1);
  });

  it("prescribes from a region assessment's flagged fields only (moderate+)", () => {
    const fields = [
      { fieldId: "dynamic_valgus_mkd", severity: "marked" },
      { fieldId: "ankle_dorsiflexion_wb", severity: "moderate" },
      { fieldId: "single_leg_squat_control", severity: "ok" }, // not flagged → ignored
      { fieldId: "scapular_asymmetry", severity: "marked" },   // no grounded corrective → ignored
    ];
    expect(compensationsForRegionFields(fields).sort()).toEqual(["dynamic_valgus", "limited_dorsiflexion"]);
    const p = prescribeForRegionFields(fields)!;
    expect(p).not.toBeNull();
    const prio = p.priorities.map((x) => x.key);
    expect(prio).toContain("glute_med_max");
    expect(prio.filter((k) => k === "ankle_dorsiflexion")).toHaveLength(1); // de-duped
    // A region with no flagged mapped fields → null.
    expect(prescribeForRegionFields([{ fieldId: "scapular_asymmetry", severity: "marked" }])).toBeNull();
  });
});
