import { describe, it, expect } from "vitest";
import { computeMechanicalLoad, type MechanicalLoadSourceRow } from "../mechanicalLoad";

/**
 * Measured-beats-derived promotion: when a provider reports a direct session
 * mechanical load (Kinexon "Mechanical Load"), the headline MLI is that
 * measurement's acute-vs-personal-baseline ratio, not the accel/decel estimate.
 */

const EMPTY: Omit<MechanicalLoadSourceRow, "date"> = {
  high_decels: null, total_decels: null, ima_decel: null,
  high_accels: null, total_accels: null, ima_accel: null,
  cod_events: null, ima_cod: null, ima_total: null,
  playerload_per_min: null, impacts: null, mechanical_load: null,
};

function day(date: string, over: Partial<MechanicalLoadSourceRow>): MechanicalLoadSourceRow {
  return { ...EMPTY, date, ...over };
}

// Six baseline days (≥ MLI_MIN_BASELINE_OBSERVATIONS) ending before the ref date.
function baseline(mechLoad: number, extra: Partial<MechanicalLoadSourceRow> = {}): MechanicalLoadSourceRow[] {
  return ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"].map((d) =>
    day(d, { mechanical_load: mechLoad, ...extra }),
  );
}

const REF = "2026-10-20";

describe("computeMechanicalLoad — measured mechanical load (Kinexon)", () => {
  it("uses the measured mechanical load as the headline MLI (ratio 2.0 → 100)", () => {
    const rows = [...baseline(1000), day(REF, { mechanical_load: 2000 })];
    const out = computeMechanicalLoad(rows, REF);
    expect(out).not.toBeNull();
    expect(out!.mliBasis).toBe("measured");
    expect(out!.mli).toBe(100); // (min(2,2)/2)*100
    expect(out!.mliBand).toBe("EXTREME");
    expect(out!.confidence).toBe("high");
    expect(out!.confidenceReason).toBe("measured_mechanical_load");
  });

  it("tracks the measured ratio (ratio 1.5 → 75)", () => {
    const rows = [...baseline(1000), day(REF, { mechanical_load: 1500 })];
    expect(computeMechanicalLoad(rows, REF)!.mli).toBe(75);
  });

  it("falls back to the derived composite when no mechanical load is present", () => {
    const over = { high_decels: 10, total_decels: 20, high_accels: 8, total_accels: 16, cod_events: 12, playerload_per_min: 9 };
    const rows = [
      ...baseline(0, { ...over, mechanical_load: null }).map((r) => ({ ...r, mechanical_load: null })),
      day(REF, { ...over, mechanical_load: null }),
    ];
    const out = computeMechanicalLoad(rows, REF);
    expect(out).not.toBeNull();
    expect(out!.mliBasis).toBe("derived");
    expect(out!.confidenceReason).not.toBe("measured_mechanical_load");
  });
});
