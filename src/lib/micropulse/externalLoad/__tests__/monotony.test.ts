import { describe, it, expect } from "vitest";
import { weeklyMonotony, monotonyBand } from "../monotony";

describe("weeklyMonotony (Foster 1998)", () => {
  it("an even week (little day-to-day spread) scores HIGH monotony", () => {
    const even = weeklyMonotony([500, 520, 510, 505, 515, 500, 510]);
    const varied = weeklyMonotony([800, 0, 650, 300, 900, 0, 200]);
    expect(even).not.toBeNull();
    expect(varied).not.toBeNull();
    expect(even!.monotony).toBeGreaterThan(varied!.monotony);
    expect(even!.band).toBe("high"); // nearly identical every day
  });

  it("strain = weekly total × monotony", () => {
    const xs = [600, 200, 500, 100, 400, 0, 300];
    const m = weeklyMonotony(xs)!;
    const total = xs.reduce((s, x) => s + x, 0);
    expect(m.strain).toBe(Math.round(total * m.monotony));
  });

  it("returns null when it cannot be defined (too few days, zero mean, or zero spread)", () => {
    expect(weeklyMonotony([500, 500])).toBeNull();        // < minDays (3)
    expect(weeklyMonotony([0, 0, 0, 0])).toBeNull();        // zero mean
    expect(weeklyMonotony([400, 400, 400, 400])).toBeNull(); // SD = 0 → undefined
  });

  it("bands follow Foster thresholds (ok <1.5, elevated 1.5–2.0, high >2.0)", () => {
    expect(monotonyBand(1.2)).toBe("ok");
    expect(monotonyBand(1.5)).toBe("elevated");
    expect(monotonyBand(2.0)).toBe("elevated");
    expect(monotonyBand(2.1)).toBe("high");
  });
});
