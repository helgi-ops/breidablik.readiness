import { describe, it, expect } from "vitest";
import { KING_PROGRAM, KING_BY_SLUG, kingExercisesForTrack, KING_TRACK_LABEL } from "../king/program";
import { KING_ASSESSMENT_SCHEMA, KING_ASSESSMENT_BY_ID } from "../king/assessment";
import { additionalForCompensations, KING_CORRECTIVES } from "../correctives/exerciseSources";
import { prescribeForCompensations } from "../correctives/mapping";

describe("King program inventory", () => {
  it("has all three tracks populated with real doses", () => {
    for (const track of ["motor_control", "run_mech", "strength"] as const) {
      const items = kingExercisesForTrack(track);
      expect(items.length, track).toBeGreaterThan(0);
      expect(KING_TRACK_LABEL[track].en.length).toBeGreaterThan(0);
    }
  });

  it("every exercise has bilingual name + target + dose, and NO stored video", () => {
    for (const e of KING_PROGRAM) {
      expect(e.name.en.length, e.slug).toBeGreaterThan(0);
      expect(e.name.is.length, e.slug).toBeGreaterThan(0);
      expect(e.target.en.length, e.slug).toBeGreaterThan(0);
      expect(e.dose.en.length, e.slug).toBeGreaterThan(0);
      // Videos are the athlete's/King's personal content — never stored.
      expect(e.videoUrl == null, `${e.slug} must not store a video`).toBe(true);
    }
  });

  it("slugs are unique and resolvable", () => {
    const slugs = KING_PROGRAM.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(KING_BY_SLUG["king_sl_hip_thrust"]).toBeTruthy();
    expect(KING_BY_SLUG["king_strideouts_60m"]?.dose.en).toContain("60 m");
  });

  it("carries the signature King doses verbatim", () => {
    expect(KING_BY_SLUG["king_goblet_squat"]!.dose.en).toBe("3 × 10");
    expect(KING_BY_SLUG["king_split_stance_rdl"]!.dose.en).toContain("50 kg");
    expect(KING_BY_SLUG["king_sl_seated_cmj"]!.dose.en).toContain("20 → 30");
  });
});

describe("King Initial Ax assessment schema", () => {
  it("has the three groups with the expected score types", () => {
    const ids = KING_ASSESSMENT_SCHEMA.map((g) => g.id);
    expect(ids).toEqual(["rom_special", "strength", "global_movement"]);
    expect(KING_ASSESSMENT_SCHEMA.find((g) => g.id === "strength")!.fields.every((f) => f.scoreType === "strength_0_5")).toBe(true);
  });

  it("strength fields are bilateral with a pain flag (King template)", () => {
    for (const f of KING_ASSESSMENT_SCHEMA.find((g) => g.id === "strength")!.fields) {
      expect(f.bilateral, f.id).toBe(true);
      expect(f.painFlag, f.id).toBe(true);
    }
  });

  it("field ids are unique across groups and resolvable", () => {
    const all = KING_ASSESSMENT_SCHEMA.flatMap((g) => g.fields.map((f) => f.id));
    expect(new Set(all).size).toBe(all.length);
    expect(KING_ASSESSMENT_BY_ID["hip_ir"]?.scoreType).toBe("rom");
    expect(KING_ASSESSMENT_BY_ID["hip_adduction_magnus"]?.scoreType).toBe("strength_0_5");
    expect(KING_ASSESSMENT_BY_ID["sl_squat"]?.scoreType).toBe("movement");
  });
});

describe("compensation key routes King exercises into the screen → plan pipeline", () => {
  it("every routed King corrective is tagged source=king and addresses ≥1 compensation", () => {
    expect(KING_CORRECTIVES.length).toBeGreaterThan(0);
    for (const e of KING_CORRECTIVES) {
      expect(e.source).toBe("king");
      expect((e.addresses ?? []).length).toBeGreaterThan(0);
    }
  });

  it("a dynamic-valgus finding pulls King exercises addressing it", () => {
    const king = additionalForCompensations(["dynamic_valgus"]);
    expect(king.some((e) => e.slug === "king_kneeling_knee_out")).toBe(true);
    expect(king.every((e) => (e.addresses ?? []).includes("dynamic_valgus"))).toBe(true);
  });

  it("prescription for valgus now includes both library AND King exercises", () => {
    const p = prescribeForCompensations(["dynamic_valgus"])!;
    const slugs = p.phases.flatMap((g) => g.items.map((e) => e.slug));
    expect(slugs).toContain("single_leg_squat"); // curated EMG library
    expect(slugs).toContain("king_kneeling_knee_out"); // King source, same key
    expect(p.phases.flatMap((g) => g.items).some((e) => e.source === "king")).toBe(true);
  });

  it("an unrouted King item (e.g. shoulder shrug) is NOT auto-prescribed by a leg screen", () => {
    const all = ["dynamic_valgus", "hip_abductor_weakness", "limb_asymmetry", "poor_absorption", "low_reactive_strength", "landing_instability"] as const;
    const slugs = additionalForCompensations([...all]).map((e) => e.slug);
    expect(slugs).not.toContain("king_shoulder_shrug");
    expect(slugs).not.toContain("king_balloon_breathing");
  });
});
