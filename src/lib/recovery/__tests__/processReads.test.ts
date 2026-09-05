import { describe, it, expect } from "vitest";
import { computeProcessReads, type ProcessInputs, type ProcessRead } from "../processReads";

const base: ProcessInputs = {
  md2Color: null,
  cmjJhPct: null,
  soreness: { value: null, baseline: null },
  sleepQuality: { value: null, baseline: null },
  hrv: { value: null, baseline: null },
  restingHr: { value: null, baseline: null },
  nightMatch: false,
};
const read = (rs: ProcessRead[], k: ProcessRead["key"]) => rs.find((r) => r.key === k)!;

describe("computeProcessReads", () => {
  it("neuromuscular: CMJ wins over colour; ≥5% drop = lagging", () => {
    expect(read(computeProcessReads({ ...base, md2Color: "green", cmjJhPct: -8 }), "neuromuscular").status).toBe("lagging");
    expect(read(computeProcessReads({ ...base, md2Color: "red", cmjJhPct: -2 }), "neuromuscular").status).toBe("recovered");
    // Falls back to the readiness colour when no jump test.
    expect(read(computeProcessReads({ ...base, md2Color: "yellow" }), "neuromuscular").status).toBe("lagging");
    expect(read(computeProcessReads({ ...base, md2Color: "green" }), "neuromuscular").status).toBe("recovered");
    expect(read(computeProcessReads(base), "neuromuscular").status).toBe("no_data");
  });

  it("autonomic: no_data without a wearable feed; HRV drop or RHR rise = lagging", () => {
    expect(read(computeProcessReads(base), "autonomic").status).toBe("no_data");
    expect(read(computeProcessReads({ ...base, hrv: { value: 40, baseline: 60 } }), "autonomic").status).toBe("lagging");
    expect(read(computeProcessReads({ ...base, restingHr: { value: 62, baseline: 55 } }), "autonomic").status).toBe("lagging");
    expect(read(computeProcessReads({ ...base, hrv: { value: 58, baseline: 60 }, restingHr: { value: 55, baseline: 55 } }), "autonomic").status).toBe("recovered");
  });

  it("perceptual: soreness below baseline (higher score = less sore) = lagging", () => {
    expect(read(computeProcessReads({ ...base, soreness: { value: 2, baseline: 4 } }), "perceptual").status).toBe("lagging");
    expect(read(computeProcessReads({ ...base, soreness: { value: 4, baseline: 4 } }), "perceptual").status).toBe("recovered");
    expect(read(computeProcessReads(base), "perceptual").status).toBe("no_data");
  });

  it("sleep: night match flags disruption even without a self-report", () => {
    expect(read(computeProcessReads({ ...base, nightMatch: true }), "sleep").status).toBe("lagging");
    expect(read(computeProcessReads({ ...base, sleepQuality: { value: 2, baseline: 4 } }), "sleep").status).toBe("lagging");
    expect(read(computeProcessReads({ ...base, sleepQuality: { value: 4, baseline: 4 }, nightMatch: false }), "sleep").status).toBe("recovered");
    expect(read(computeProcessReads(base), "sleep").status).toBe("no_data");
  });

  it("returns four independent processes, each with its own evidence — never blended", () => {
    const rs = computeProcessReads({ ...base, md2Color: "green", nightMatch: true });
    expect(rs.map((r) => r.key)).toEqual(["neuromuscular", "autonomic", "perceptual", "sleep"]);
    // Same input can be recovered on one process and lagging on another.
    expect(read(rs, "neuromuscular").status).toBe("recovered");
    expect(read(rs, "sleep").status).toBe("lagging");
    expect(rs.every((r) => r.evidence === "strong")).toBe(true);
  });
});
