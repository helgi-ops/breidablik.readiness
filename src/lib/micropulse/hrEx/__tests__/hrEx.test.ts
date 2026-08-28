import { describe, it, expect } from "vitest";
import { computeHrExTrend, HREX_SWC_PCT, HRR_SWC_PCT, type HrExTest } from "../index";

const t = (date: string, hrexBpm: number, hrrBpm: number | null = null): HrExTest => ({ date, hrexBpm, hrrBpm, speedKmh: 9 });

describe("computeHrExTrend", () => {
  it("insufficient with 0 or 1 test", () => {
    expect(computeHrExTrend([]).trend).toBe("insufficient");
    expect(computeHrExTrend([t("2026-01-01", 160)]).trend).toBe("insufficient");
  });

  it("improving: HRex drops beyond the 1% SWC (lower HR at the same run)", () => {
    const r = computeHrExTrend([t("2026-01-01", 165), t("2026-03-01", 158)]); // −4.2%
    expect(r.trend).toBe("improving");
    expect(r.hrexMeaningful).toBe(true);
    expect(r.hrexDeltaPct).toBeLessThan(-HREX_SWC_PCT);
    expect(r.verdict.en).toMatch(/fitness trending up/i);
  });

  it("declining: HRex rises beyond the SWC", () => {
    const r = computeHrExTrend([t("2026-01-01", 158), t("2026-03-01", 166)]); // +5%
    expect(r.trend).toBe("declining");
    expect(r.verdict.en).toMatch(/declining fitness or accumulated fatigue/i);
  });

  it("stable: change within the 1% band is noise", () => {
    const r = computeHrExTrend([t("2026-01-01", 160), t("2026-03-01", 160.8)]); // +0.5%
    expect(r.trend).toBe("stable");
    expect(r.hrexMeaningful).toBe(false);
  });

  it("improving reinforced when HRR also improves (≥7%)", () => {
    const r = computeHrExTrend([t("2026-01-01", 165, 30), t("2026-03-01", 158, 34)]); // HRex −4%, HRR +13%
    expect(r.trend).toBe("improving");
    expect(r.hrrMeaningful).toBe(true);
    expect(r.verdict.en).toMatch(/recovery quicker too/i);
  });

  it("mixed when HRex and HRR disagree (ambiguous alone)", () => {
    const r = computeHrExTrend([t("2026-01-01", 165, 34), t("2026-03-01", 158, 30)]); // HRex better (−4%), HRR worse (−12%)
    expect(r.trend).toBe("mixed");
    expect(r.verdict.en).toMatch(/ambiguous alone/i);
  });

  it("HRR SWC is 7% — a small HRR move alone doesn't flip the verdict", () => {
    const r = computeHrExTrend([t("2026-01-01", 160, 30), t("2026-03-01", 160.3, 31)]); // HRex noise, HRR +3.3% < 7%
    expect(r.trend).toBe("stable");
    expect(r.hrrMeaningful).toBe(false);
    expect(HRR_SWC_PCT).toBe(7);
  });

  it("baseline = mean of the first 2 weeks; caveat + citation always present", () => {
    const r = computeHrExTrend([t("2026-01-01", 166), t("2026-01-08", 164), t("2026-04-01", 158)]);
    expect(r.baseline?.hrexBpm).toBe(165); // mean of 166,164
    expect(r.trend).toBe("improving");
    expect(r.caveat.en).toMatch(/ambiguous on its own/i);
    expect(r.citation).toMatch(/Buchheit/);
  });
});
