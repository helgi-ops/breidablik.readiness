import { describe, it, expect } from "vitest";
import { compensationsForDeficits, DEFICIT_COMPENSATION } from "../correctives/deficitBridge";
import { buildDeficitLedger, type FiredObservation } from "../deficitLedger";
import { defaultBattery } from "../testCatalogue";
import { prescribeForCompensations } from "../correctives/mapping";

describe("deficitKey → CompensationKey bridge", () => {
  it("maps the core deficits onto corrective compensations", () => {
    expect(compensationsForDeficits([{ deficitKey: "frontal_valgus_control" }])).toEqual(["dynamic_valgus"]);
    expect(compensationsForDeficits([{ deficitKey: "hip_abductor_control" }])).toEqual(["hip_abductor_weakness"]);
    expect(compensationsForDeficits([{ deficitKey: "ankle_dorsiflexion" }])).toEqual(["limited_dorsiflexion"]);
    expect(compensationsForDeficits([{ deficitKey: "unilateral_reactive_control" }]).sort()).toEqual(["limb_asymmetry", "low_reactive_strength"]);
  });

  it("de-duplicates across deficits", () => {
    const comps = compensationsForDeficits([{ deficitKey: "frontal_valgus_control" }, { deficitKey: "landing_mechanics" }]);
    expect(comps.filter((c) => c === "dynamic_valgus")).toHaveLength(1); // both point to valgus
    expect(comps).toContain("poor_absorption");
  });

  it("mobility / thoracic / trunk deficits map to nothing (honest — no corrective set)", () => {
    for (const k of ["posterior_chain_length", "hip_rotation_mobility", "thoracic_shoulder_mobility", "trunk_core_control"] as const) {
      expect(DEFICIT_COMPENSATION[k] ?? []).toEqual([]);
    }
  });

  it("end-to-end: a screening form's valgus deficit drives a corrective prescription", () => {
    const battery = defaultBattery().map((x) => x.slug);
    const fired: FiredObservation[] = [
      { testSlug: "overhead_squat", observationKey: "knees_inward", side: "both" },
      { testSlug: "single_leg_squat", observationKey: "medial_knee_valgus", side: "L" },
    ];
    const comps = compensationsForDeficits(buildDeficitLedger(fired, battery));
    expect(comps).toContain("dynamic_valgus");
    const p = prescribeForCompensations(comps)!;
    expect(p.phases.flatMap((g) => g.items).length).toBeGreaterThan(0); // a real plan comes out
    expect(p.compensations.some((c) => c.key === "dynamic_valgus")).toBe(true);
  });
});
