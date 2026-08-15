import { describe, it, expect } from "vitest";
import {
  buildCapacityReference,
  ceilingFor,
  pctOfPeakCapacity,
  scoreSessionDrills,
  bandOf,
  PEAK_PCT,
  type DrillLoad,
} from "../peakCapacity";

describe("bandOf", () => {
  it("buckets durations", () => {
    expect(bandOf(3)).toBe("0-5");
    expect(bandOf(10)).toBe("5-15");
    expect(bandOf(90)).toBe("60+");
  });
});

describe("buildCapacityReference", () => {
  it("takes the p90 per-min within each duration band, with an overall fallback", () => {
    // Band 5-15: values 10,10,11,12,20 → p90 ≈ 16. Short band too thin (< MIN_BAND_DRILLS) → null.
    const hist: DrillLoad[] = [
      { durationMin: 8, valuePerMin: 10 }, { durationMin: 9, valuePerMin: 10 },
      { durationMin: 10, valuePerMin: 11 }, { durationMin: 12, valuePerMin: 12 },
      { durationMin: 11, valuePerMin: 20 },
      { durationMin: 3, valuePerMin: 30 }, // lone short drill → 0-5 band stays null (thin)
    ];
    const ref = buildCapacityReference(hist);
    expect(ref.byBand["5-15"]).toBeGreaterThan(11);
    expect(ref.byBand["5-15"]).toBeLessThan(20);
    expect(ref.byBand["0-5"]).toBeNull(); // only 1 drill
    expect(ceilingFor(ref, 3)).toBe(ref.overall); // thin band falls back to overall
    expect(ceilingFor(ref, 10)).toBe(ref.byBand["5-15"]);
  });
});

describe("pctOfPeakCapacity", () => {
  it("computes % of ceiling and classifies", () => {
    expect(pctOfPeakCapacity({ durationMin: 10, valuePerMin: 14 }, 14).pctOfPeak).toBe(100);
    expect(pctOfPeakCapacity({ durationMin: 10, valuePerMin: 14 }, 14).level).toBe("peak");
    expect(pctOfPeakCapacity({ durationMin: 10, valuePerMin: 11.2 }, 14).pctOfPeak).toBe(80);
    expect(pctOfPeakCapacity({ durationMin: 10, valuePerMin: 11.2 }, 14).level).toBe("high");
    expect(pctOfPeakCapacity({ durationMin: 10, valuePerMin: 9 }, 14).level).toBe("moderate"); // 64%
    expect(pctOfPeakCapacity({ durationMin: 10, valuePerMin: 7 }, 14).level).toBe("low"); // 50%
  });

  it("reads over 100% (a genuinely peak-level drill) when above the p90 ceiling", () => {
    const r = pctOfPeakCapacity({ durationMin: 10, valuePerMin: 18 }, 14);
    expect(r.pctOfPeak).toBeGreaterThan(PEAK_PCT);
    expect(r.level).toBe("peak");
  });

  it("insufficient when the ceiling or value is missing", () => {
    expect(pctOfPeakCapacity({ durationMin: 10, valuePerMin: 14 }, null).level).toBe("insufficient");
    expect(pctOfPeakCapacity({ durationMin: 10, valuePerMin: null }, 14).level).toBe("insufficient");
  });
});

describe("scoreSessionDrills", () => {
  it("scores each drill against the duration-matched ceiling, keeping labels", () => {
    const hist: DrillLoad[] = Array.from({ length: 6 }, (_, i) => ({ durationMin: 10, valuePerMin: 10 + (i % 3) }));
    const ref = buildCapacityReference(hist);
    const out = scoreSessionDrills([
      { durationMin: 10, valuePerMin: 12, label: "Rondo" },
      { durationMin: 10, valuePerMin: 6, label: "Recovery" },
    ], ref);
    expect(out).toHaveLength(2);
    expect(out[0].label).toBe("Rondo");
    expect((out[0].pctOfPeak ?? 0)).toBeGreaterThan(out[1].pctOfPeak ?? 0);
  });
});
