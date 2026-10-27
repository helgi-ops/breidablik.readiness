import { describe, it, expect } from "vitest";
import {
  getActiveWeeklyLoadMetrics,
  WEEKLY_LOAD_METRICS_OUTDOOR,
  WEEKLY_LOAD_METRICS_INDOOR,
  WEEKLY_LOAD_METRICS_BASKETBALL,
  WEEKLY_LOAD_METRICS_BASKETBALL_TITAN,
  WEEKLY_LOAD_LABELS,
} from "../weeklyLoadTypes";

describe("getActiveWeeklyLoadMetrics", () => {
  it("outdoor / indoor / Catapult basketball sets are unchanged", () => {
    expect(getActiveWeeklyLoadMetrics(false)).toEqual(WEEKLY_LOAD_METRICS_OUTDOOR);
    expect(getActiveWeeklyLoadMetrics(true)).toEqual(WEEKLY_LOAD_METRICS_INDOOR);
    expect(getActiveWeeklyLoadMetrics(true, true)).toEqual(WEEKLY_LOAD_METRICS_BASKETBALL);
    expect(getActiveWeeklyLoadMetrics(true, true, false)).toEqual(WEEKLY_LOAD_METRICS_BASKETBALL);
  });

  it("a Titan basketball team gets Load Index + jumps + impacts + high-intensity (no empty IMA)", () => {
    const set = getActiveWeeklyLoadMetrics(true, true, true);
    expect(set).toEqual(WEEKLY_LOAD_METRICS_BASKETBALL_TITAN);
    expect(set).toContain("totalPlayerLoad");
    expect(set).toContain("jumps");
    expect(set).toContain("impacts");
    // The full Movement-Profile buckets, same as the per-session Titan table.
    expect(set).toContain("settled");
    expect(set).toContain("lowIntensity");
    expect(set).toContain("midIntensity");
    expect(set).toContain("highIntensity");
    expect(set).not.toContain("imaAccel"); // the empty IMA tiles are gone
  });

  it("the Titan basketball keys all have labels", () => {
    for (const k of WEEKLY_LOAD_METRICS_BASKETBALL_TITAN) expect(WEEKLY_LOAD_LABELS[k]).toBeTruthy();
  });
});
