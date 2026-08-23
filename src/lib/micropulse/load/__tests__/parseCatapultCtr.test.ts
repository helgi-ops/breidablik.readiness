import { describe, it, expect } from "vitest";
import { parseCatapultCtr } from "../parseCatapultCtr";

const HEADER = ["Athlete", "Period Name", "Start Time", "Duration", "Avg Dist (m)", "Vel B5 Avg Dist (m)", "Vel B6 Avg Dist (m)", "Max Vel (km/h)", "Max Vel (% Max)", "HIR Dist (m)", "Avg PL"];

describe("parseCatapultCtr", () => {
  it("parses periods, maps the high-speed columns, and recognises peak windows", () => {
    const m = [
      HEADER,
      ["Ágúst Orri Þorsteinsson", "Peak 1min", "00:23:15", "1:00", "223", "163", "45", "29.2", "96", "208", "12"],
      ["Ágúst Orri Þorsteinsson", "Peak 3min", "00:20:00", "3:00", "600", "300", "100", "29.2", "96", "300", "10"],
      ["Ágúst Orri Þorsteinsson", "1st Half", "00:00:00", "45:00", "5000", "800", "200", "31.0", "100", "900", "8"],
    ];
    const p = parseCatapultCtr(m);
    expect(p.detectedColumns).toBeGreaterThanOrEqual(9);
    expect(p.athletes).toEqual(["Ágúst Orri Þorsteinsson"]);
    expect(p.rows).toHaveLength(3);

    const w1 = p.rows[0];
    expect(w1.windowMin).toBe(1);
    expect(w1.hsrM).toBe(208);
    expect(w1.vb5M).toBe(163);
    expect(w1.vb6M).toBe(45);
    expect(w1.maxKmh).toBe(29.2);
    expect(w1.windowStart).toBe("00:23:15");
    expect(w1.windowSeconds).toBe(60);

    expect(p.rows[1].windowMin).toBe(3);
    expect(p.rows[1].windowSeconds).toBe(180);

    // a coaching period is stored but not a peak window
    expect(p.rows[2].windowMin).toBeNull();
    expect(p.rows[2].windowSeconds).toBe(2700);
  });

  it("recognises a 1/3/5-min peak from duration even when the label doesn't say 'peak'", () => {
    const m = [HEADER, ["X Y", "Rolling max", "00:10:00", "5:00", "800", "300", "120", "30", "100", "260", "9"]];
    expect(parseCatapultCtr(m).rows[0].windowMin).toBe(5);
  });

  it("rejects a file with no athlete/period/high-speed columns", () => {
    const p = parseCatapultCtr([["Foo", "Bar"], ["1", "2"]]);
    expect(p.rows).toHaveLength(0);
    expect(p.warnings[0]).toMatch(/Not a CTR/);
  });

  it("warns when HIR Dist is absent (Ju score needs it)", () => {
    const noHir = ["Athlete", "Period Name", "Start Time", "Duration", "Vel B5 Avg Dist (m)", "Max Vel (km/h)"];
    const p = parseCatapultCtr([noHir, ["A B", "Peak 1min", "00:01:00", "1:00", "150", "28"]]);
    expect(p.rows[0].vb5M).toBe(150);
    expect(p.rows[0].hsrM).toBeNull();
    expect(p.warnings.some((w) => /HIR Dist/.test(w))).toBe(true);
  });
});
