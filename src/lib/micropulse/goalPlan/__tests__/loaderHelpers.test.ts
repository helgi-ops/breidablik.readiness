import { describe, expect, it } from "vitest";
import { freshTest, topSpeedRead, weakerLegFromBattery } from "../loader";
import type { RtpAssessment } from "@/lib/micropulse/rtp/types";

const row = (date: string, kmh: number) => ({ date, maxVelocity: kmh, maxVel: null, playerLoad: 500, totalDistance: 6000 });

describe("topSpeedRead (no 'recent GPS day' gate)", () => {
  // 12 days at 30–33 km/h in September; 3rd fastest = 32 → 90% = 28.8.
  const rows = [33, 32.5, 32, 31, 31, 30, 30, 30, 30, 30, 29, 29].map((v, i) => row(`2026-09-${String(i + 1).padStart(2, "0")}`, v));
  it("off-season (no GPS for weeks) still has a top speed, with a long gap", () => {
    const r = topSpeedRead(rows, "2026-11-13", null);
    expect(r?.refKmh).toBe(32);
    expect(r?.targetKmh).toBe(28.8);
    expect(r?.level).toBe("long_gap");
    expect(r?.daysSince).toBe(62); // 2026-09-12 (29 km/h ≥ 28.8) → 2026-11-13
  });
  it("too few GPS days and no sprint test → null", () => {
    expect(topSpeedRead(rows.slice(0, 5), "2026-11-13", null)).toBeNull();
  });
  it("a faster sprint test becomes the reference", () => {
    expect(topSpeedRead(rows, "2026-11-13", 34)?.refKmh).toBe(34);
  });
  it("indoor rows (load but under 200 m) are ignored", () => {
    const indoor = { date: "2026-11-12", maxVelocity: 31, maxVel: null, playerLoad: 300, totalDistance: 100 };
    expect(topSpeedRead([...rows, indoor], "2026-11-13", null)?.daysSince).toBe(62);
  });
});

describe("freshTest", () => {
  it("12 months or newer only; unknown date is not fresh", () => {
    expect(freshTest("2026-10-01", "2026-11-13")).toBe(true);
    expect(freshTest("2025-05-16", "2026-11-13")).toBe(false);
    expect(freshTest(null, "2026-11-13")).toBe(false);
  });
});

describe("weakerLegFromBattery", () => {
  const rtp = (battery: Partial<RtpAssessment["battery"][number]>[]) => ({ battery } as unknown as RtpAssessment);
  const t = (testType: string, left: number, right: number, testDate = "2026-10-01") =>
    ({ testType, label: testType, testDate, left, right, primaryLabel: "", primaryValue: null, primaryUnit: "", relForceNkg: null, asymmetryPct: null, lsiPct: null, stiffnessAsymPct: null, jumpHeightAsymPct: null });
  it("≥10% gap on a single-leg test names the lower side", () => {
    expect(weakerLegFromBattery(rtp([t("SLJ", 20, 25)]))?.side).toBe("left");
  });
  it("under 10% → no weaker leg", () => {
    expect(weakerLegFromBattery(rtp([t("SLJ", 24, 25)]))).toBeNull();
  });
  it("two-leg tests are ignored; the newest single-leg test wins", () => {
    expect(weakerLegFromBattery(rtp([t("DJ", 10, 20)]))).toBeNull();
    expect(weakerLegFromBattery(rtp([t("SLJ", 20, 25, "2026-01-01"), t("SLISOSQT", 1000, 800, "2026-10-01")]))?.side).toBe("right");
  });
  it("no assessment → null", () => {
    expect(weakerLegFromBattery(null)).toBeNull();
  });
});
