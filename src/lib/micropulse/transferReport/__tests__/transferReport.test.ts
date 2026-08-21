import { describe, it, expect } from "vitest";
import { buildTransferDossier, type RawDossierInput, type LoadDaily, type MatchRow } from "../index";
import type { AthleteProfile } from "@/lib/micropulse/playerAnalysis/athleteProfile";

function loadRow(over: Partial<LoadDaily>): LoadDaily {
  return {
    date: "2026-05-01", isMatch: false, durationMin: 90,
    totalDistance: 6000, highSpeedDistance: 500, sprintDistance: 120, maxVelocity: 30,
    playerLoad: 500, playerLoadPerMin: 5.5, metabolicPowerPeak: 45,
    accel: 20, decel: 18, cod: 30, accelEfforts: 8, decelEfforts: 7, strideCount: 900,
    ...over,
  };
}

const emptyInput: RawDossierInput = {
  identity: { name: "Test Player", position: "CM", sport: "football", dob: "2000-01-01", heightCm: 182, massKg: 78 },
  windowDays: 120, start: "2026-04-23", end: "2026-08-21",
  load: [], vald: null, vbt: [], matches: [], fitness: [], peakPeriods: [], athlete: null,
};

describe("buildTransferDossier", () => {
  it("computes age from dob and the window end date", () => {
    const d = buildTransferDossier(emptyInput);
    expect(d.identity.ageYears).toBe(26); // 2000-01-01 -> 2026-08-21
    expect(d.identity.name).toBe("Test Player");
  });

  it("always emits all nine sections", () => {
    const d = buildTransferDossier(emptyInput);
    expect(d.sections.map((s) => s.id).sort()).toEqual(["athlete", "fitness", "games", "gps", "ima", "vald", "vbt", "wcs", "weekly"]);
  });

  it("empty input yields no present sections and overall confidence 'none'", () => {
    const d = buildTransferDossier(emptyInput);
    expect(d.sections.every((s) => !s.present)).toBe(true);
    expect(d.overallConfidence).toBe("none");
    // every section still carries a non-empty honest fact
    expect(d.sections.every((s) => s.facts.length > 0)).toBe(true);
  });

  it("aggregates GPS totals, match split and peaks", () => {
    const load: LoadDaily[] = [
      ...Array.from({ length: 20 }, (_, i) => loadRow({ date: `2026-05-${String(i + 1).padStart(2, "0")}`, totalDistance: 6000, maxVelocity: 29 })),
      loadRow({ date: "2026-06-01", isMatch: true, totalDistance: 11000, maxVelocity: 33, highSpeedDistance: 900, sprintDistance: 300, playerLoadPerMin: 9 }),
    ];
    const d = buildTransferDossier({ ...emptyInput, load });
    const gps = d.sections.find((s) => s.id === "gps")!;
    expect(gps.present).toBe(true);
    expect(gps.confidence).toBe("high"); // 21 sessions
    expect(gps.headline!.en).toContain("33.0 km/h"); // peak top speed
    expect(gps.table).not.toBeNull();
    expect(d.window.sessions).toBe(21);
    expect(d.window.matches).toBe(1);
  });

  it("WCS uses the true peak-period table when present, else labels the estimate", () => {
    const load = [loadRow({ date: "2026-06-01", isMatch: true, metabolicPowerPeak: 55 })];
    const withPeriod = buildTransferDossier({
      ...emptyInput, load,
      peakPeriods: [
        { date: "2026-06-01", metric: "distance", windowMin: 1, value: 200, unit: "m" },
        { date: "2026-06-01", metric: "distance", windowMin: 5, value: 800, unit: "m" },
      ],
    });
    const wcs = withPeriod.sections.find((s) => s.id === "wcs")!;
    expect(wcs.table).not.toBeNull();
    expect(wcs.facts.some((f) => f.en.includes("true rolling peak period"))).toBe(true);

    const noPeriod = buildTransferDossier({ ...emptyInput, load });
    const wcs2 = noPeriod.sections.find((s) => s.id === "wcs")!;
    expect(wcs2.confidence).toBe("low");
    expect(wcs2.facts.some((f) => f.en.includes("estimated"))).toBe(true);
  });

  it("VALD is high confidence only when both CMJ and IMTP are present", () => {
    const cmjOnly = buildTransferDossier({
      ...emptyInput,
      vald: { cmj: { testDate: "2026-07-01", jumpHeightCm: 38, rsiMod: 0.45, relPeakPowerWkg: 55, peakForceN: 2200, asymmetryPct: 4 }, imtp: null, cmjTrend: [] },
    });
    expect(cmjOnly.sections.find((s) => s.id === "vald")!.confidence).toBe("moderate");

    const both = buildTransferDossier({
      ...emptyInput,
      vald: {
        cmj: { testDate: "2026-07-01", jumpHeightCm: 38, rsiMod: 0.45, relPeakPowerWkg: 55, peakForceN: 2200, asymmetryPct: 4 },
        imtp: { testDate: "2026-07-01", peakForceN: 2600, relPeakForceNkg: 33, asymmetryPct: 6 },
        cmjTrend: [{ date: "2026-05-01", jumpHeightCm: 36 }, { date: "2026-07-01", jumpHeightCm: 38 }],
      },
    });
    const v = both.sections.find((s) => s.id === "vald")!;
    expect(v.confidence).toBe("high");
    expect(v.facts.some((f) => f.en.includes("up 2.0 cm"))).toBe(true);
  });

  it("surfaces athlete-profile strengths in the headline", () => {
    const profile: AthleteProfile = {
      playerId: "p1", position: "CM", positionGroup: "MID",
      qualities: [
        { id: "speed", value: 33, unit: "km/h", source: "GPS", date: "2026-06-01", sampleSize: 5, positionPercentile: 88, squadPercentile: 85, benchmark: "position", poolSize: 6, verdict: "strength", confidence: "high", trend: "stable" },
        { id: "max_strength", value: 33, unit: "N/kg", source: "IMTP", date: "2026-07-01", sampleSize: 2, positionPercentile: 20, squadPercentile: 25, benchmark: "position", poolSize: 6, verdict: "weakness", confidence: "moderate", trend: null },
      ],
      strengths: [{ id: "speed", value: 33, unit: "km/h", source: "GPS", date: "2026-06-01", sampleSize: 5, positionPercentile: 88, squadPercentile: 85, benchmark: "position", poolSize: 6, verdict: "strength", confidence: "high", trend: "stable" }],
      weaknesses: [{ id: "max_strength", value: 33, unit: "N/kg", source: "IMTP", date: "2026-07-01", sampleSize: 2, positionPercentile: 20, squadPercentile: 25, benchmark: "position", poolSize: 6, verdict: "weakness", confidence: "moderate", trend: null }],
      coverage: { sources: ["GPS", "IMTP"], qualitiesWithData: 2, totalQualities: 13, ratio: 2 / 13 },
    };
    const d = buildTransferDossier({ ...emptyInput, athlete: profile });
    const a = d.sections.find((s) => s.id === "athlete")!;
    expect(a.present).toBe(true);
    expect(a.headline!.en).toContain("speed");
    expect(a.facts[0].en).toContain("88th");
  });

  it("weekly section groups training by ISO week; match log joins GPS/IMA per game", () => {
    const load: LoadDaily[] = [
      loadRow({ date: "2026-06-01", totalDistance: 6000 }), // Mon
      loadRow({ date: "2026-06-03", totalDistance: 5000 }), // Wed (same week)
      loadRow({ date: "2026-06-08", totalDistance: 7000 }), // next Mon
      loadRow({ date: "2026-06-07", isMatch: true, totalDistance: 10500, highSpeedDistance: 850, accel: 40, decel: 35, cod: 55 }), // match
    ];
    const matches: MatchRow[] = [{ date: "2026-06-07", opponent: "Valur (A)", minutes: 90, goals: 1, assists: 0, xg: 0.3 }];
    const d = buildTransferDossier({ ...emptyInput, load, matches });
    const weekly = d.sections.find((s) => s.id === "weekly")!;
    expect(weekly.present).toBe(true);
    // two distinct training weeks (the match row is excluded from weekly)
    expect(weekly.table!.rows.length).toBe(2);
    const games = d.sections.find((s) => s.id === "games")!;
    expect(games.title.en).toContain("Match log");
    // the one match row carries the joined GPS distance (km) and IMA CoD
    const row = games.table!.rows[0];
    expect(row).toContain("10.50"); // distance km
    expect(row).toContain("55"); // CoD
    expect(row[1]).toBe("Valur"); // opponent shortened (drops "(A)")
  });

  it("confidence rises with more data across sections", () => {
    const sparse = buildTransferDossier({ ...emptyInput, load: [loadRow({})], matches: [] });
    const rich = buildTransferDossier({
      ...emptyInput,
      load: Array.from({ length: 25 }, (_, i) => loadRow({ date: `2026-05-${String((i % 28) + 1).padStart(2, "0")}` })),
    });
    const rank = { none: 0, low: 1, moderate: 2, high: 3 } as const;
    expect(rank[rich.overallConfidence]).toBeGreaterThan(rank[sparse.overallConfidence]);
  });
});
