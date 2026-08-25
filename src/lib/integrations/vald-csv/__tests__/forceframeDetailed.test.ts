import { describe, it, expect } from "vitest";
import { parseValdCsv, detectProduct } from "../parser";

// A ForceFrame "detailed test" export (support.vald.com ForceFrame protocols).
// The same Hip AD/AB test is measured in two Directions on one day: Pull
// (abduction) and Squeeze (adduction). They must stay DISTINCT, and the detailed
// columns (avg force, max RFD, per-kg) must be captured.
const HEADER = '"Name","ExternalId","Date","Time","Device","Mode","Test","Direction","Position","L Reps","R Reps","L Max Force (N)","R Max Force (N)","Max Imbalance","L Max Ratio","R Max Ratio","L Avg Force (N)","R Avg Force (N)","Avg Imbalance","L Max Force Per kg (N/kg)","R Max Force Per kg (N/kg)","L Max RFD (N/s)","R Max RFD (N/s)","L Max RFD 50ms (N/s)","R Max RFD 50ms (N/s)","Notes"';
const PULL = '"Jónatan Arnarsson","","28/04/2026","1:48 PM","ForceFrame-2810","Bar + Frame","Hip AD/AB","Pull","Hip AD/AB - 60","3","3","463.25","472.5","1.96","0.88","0.87","436.33","452.92","3.66","5.79","5.91","3141.18","3035.29","260","395",""';
const SQUEEZE = '"Jónatan Arnarsson","","28/04/2026","1:48 PM","ForceFrame-2810","Bar + Frame","Hip AD/AB","Squeeze","Hip AD/AB - 60","3","3","406.75","409.75","0.73","0.88","0.87","388.17","391.92","0.96","5.08","5.12","564.71","582.35","235","195",""';
const CSV = [HEADER, PULL, SQUEEZE].join("\n");

describe("detailed ForceFrame CSV", () => {
  it("is auto-detected as ForceFrame (Direction/Position, not 'relative force')", () => {
    const cells = HEADER.replace(/"/g, "").split(",");
    expect(detectProduct(cells)).toBe("forceframe");
  });

  it("parses Pull and Squeeze as two distinct rows with direction + position", () => {
    const parsed = parseValdCsv(CSV, { product: "forceframe" });
    expect(parsed.rows).toHaveLength(2);
    const [pull, squeeze] = parsed.rows;
    expect(pull.direction).toBe("Pull");
    expect(squeeze.direction).toBe("Squeeze");
    expect(pull.position).toBe("Hip AD/AB - 60");
    expect(pull.testType).toBe("Hip AD/AB");
  });

  it("captures peak force, per-kg, avg force, max RFD and asymmetry", () => {
    const [pull] = parseValdCsv(CSV, { product: "forceframe" }).rows;
    expect(pull.leftPeakForce).toBe(463.25);
    expect(pull.rightPeakForce).toBe(472.5);
    expect(pull.leftRelativeForce).toBe(5.79);   // L Max Force Per kg
    expect(pull.leftAvgForce).toBe(436.33);
    expect(pull.leftMaxRfd).toBe(3141.18);       // headline, not the 50ms band
    expect(pull.asymmetryPercent).toBe(1.96);    // Max Imbalance
  });

  it("does not confuse the headline Max RFD with the time-banded 50ms column", () => {
    const [pull] = parseValdCsv(CSV, { product: "forceframe" }).rows;
    expect(pull.leftMaxRfd).not.toBe(260);       // that is L Max RFD 50ms
  });

  it("keeps the full row for audit (nothing lost)", () => {
    const [pull] = parseValdCsv(CSV, { product: "forceframe" }).rows;
    expect(pull.raw["L Max RFD 50ms (N/s)"]).toBe("260");
    expect(pull.raw["Mode"]).toBe("Bar + Frame");
  });
});
