import { describe, it, expect } from "vitest";
import {
  seasonReportAvailable,
  seasonReportMissingHint,
  seasonReportProvenance,
  seasonReportSourceLabel,
  seasonReportFileSuffix,
} from "../seasonReportMeta";

describe("seasonReportMeta — season report source binding", () => {
  it("labels the source by name (never the wrong provider)", () => {
    expect(seasonReportSourceLabel("statsbomb")).toBe("StatsBomb");
    expect(seasonReportSourceLabel("wyscout")).toBe("Wyscout");
  });

  it("is available only when the SELECTED provider has season data", () => {
    // StatsBomb selected, only Wyscout imported → NOT available (never a Wyscout fallback).
    expect(seasonReportAvailable("statsbomb", { wyscout: true, statsbomb: false })).toBe(false);
    expect(seasonReportAvailable("statsbomb", { wyscout: true, statsbomb: true })).toBe(true);
    expect(seasonReportAvailable("wyscout", { wyscout: false, statsbomb: true })).toBe(false);
    expect(seasonReportAvailable("wyscout", { wyscout: true, statsbomb: false })).toBe(true);
    expect(seasonReportAvailable("statsbomb", null)).toBe(false);
  });

  it("gives a source-specific, bilingual disabled hint (points at the right export)", () => {
    expect(seasonReportMissingHint("statsbomb", "EN")).toContain("StatsBomb Match Stats");
    expect(seasonReportMissingHint("statsbomb", "IS")).toContain("StatsBomb Match Stats");
    expect(seasonReportMissingHint("wyscout", "EN")).toContain("Wyscout Team → Stats");
    expect(seasonReportMissingHint("wyscout", "IS")).toContain("Wyscout Team → Stats");
  });

  it("provenance names the source in both languages", () => {
    expect(seasonReportProvenance("statsbomb", "EN")).toContain("StatsBomb");
    expect(seasonReportProvenance("wyscout", "EN")).toContain("Wyscout");
    expect(seasonReportProvenance("statsbomb", "IS")).toContain("StatsBomb");
  });

  it("filename suffix keeps the two provider reports from colliding", () => {
    expect(seasonReportFileSuffix("statsbomb")).toBe("statsbomb");
    expect(seasonReportFileSuffix("wyscout")).toBe("wyscout");
    expect(seasonReportFileSuffix("statsbomb")).not.toBe(seasonReportFileSuffix("wyscout"));
  });
});
