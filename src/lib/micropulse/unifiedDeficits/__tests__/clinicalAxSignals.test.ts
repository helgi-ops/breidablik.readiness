import { describe, it, expect } from "vitest";
import { clinicalAxDeficits } from "../clinicalAxSignals";
import { reconcile } from "../reconcile";

describe("clinical-Ax writer (King Initial Ax → confirmed deficits)", () => {
  it("low hip-abduction strength → confirmed glute-med/ER deficit, weaker side tagged", () => {
    const [d] = clinicalAxDeficits([{ fieldId: "hip_abduction", scoreR: 4, scoreL: 3 }]);
    expect(d.quality).toBe("glute_med_er_control");
    expect(d.source).toBe("clinical_ax");
    expect(d.status).toBe("confirmed");
    expect(d.side).toBe("L"); // 3 < 4
    expect(d.severity).toBe("moderate"); // min 3
  });

  it("strength ≤ 2 is severe", () => {
    const [d] = clinicalAxDeficits([{ fieldId: "hip_abduction", scoreR: 2, scoreL: 2 }]);
    expect(d.severity).toBe("severe");
  });

  it("good strength (both ≥ 4, no flag) → no deficit", () => {
    expect(clinicalAxDeficits([{ fieldId: "hip_abduction", scoreR: 5, scoreL: 5 }])).toHaveLength(0);
  });

  it("a pain flag routes the row to the clinician (medical)", () => {
    const [d] = clinicalAxDeficits([{ fieldId: "hip_abduction", scoreR: 3, scoreL: 3, pain: 6 }]);
    expect(d.medical).toBe(true);
  });

  it("a ROM field is flagged only by the clinician's abnormal flag → hip-rotation mobility", () => {
    expect(clinicalAxDeficits([{ fieldId: "hip_ir", scoreR: 20, scoreL: 20 }])).toHaveLength(0); // no flag
    const [d] = clinicalAxDeficits([{ fieldId: "hip_ir", scoreR: 20, scoreL: 8, flag: true }]);
    expect(d.quality).toBe("hip_rotation_mobility");
    expect(d.side).toBe("L");
  });

  it("unmapped fields (adductor, obliques, cuff) don't route to the ledger", () => {
    expect(clinicalAxDeficits([{ fieldId: "hip_adduction", scoreR: 2, scoreL: 2 }, { fieldId: "obliques", scoreR: 3, scoreL: 3 }])).toHaveLength(0);
  });

  it("a confirmed clinical deficit promotes a matching screen hypothesis", () => {
    const out = reconcile([
      { quality: "glute_med_er_control", source: "movement_form", status: "hypothesis", confidence: 0.5, provenance: { en: "form", is: "form" } },
      ...clinicalAxDeficits([{ fieldId: "hip_abduction", scoreR: 3, scoreL: 3 }]),
    ]);
    const d = out.find((x) => x.quality === "glute_med_er_control")!;
    expect(d.status).toBe("confirmed"); // clinical confirms the screen hypothesis
    expect(d.sources.map((s) => s.source).sort()).toEqual(["clinical_ax", "movement_form"]);
  });
});
