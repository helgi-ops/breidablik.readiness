import { describe, it, expect } from "vitest";
import { SEED_MOVEMENT_TESTS } from "../../registry";
import { interpretScreen, type ScreenFinding } from "../../interpret";
import { prescribeCorrectives, compensationsForReadings, prescriptionToStructure } from "../mapping";

const OHSA = SEED_MOVEMENT_TESTS.find((t) => t.slug === "overhead_squat_assessment")!;

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
});
