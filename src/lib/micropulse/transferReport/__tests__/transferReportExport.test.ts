import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { buildTransferXlsx } from "../transferReportXlsx";
import { buildSessionsZip } from "../transferReportSessionsZip";
import type { RawDossierInput, LoadDaily } from "../index";
import type { DrillRow } from "../loadData";

const day = (over: Partial<LoadDaily>): LoadDaily => ({
  date: "2026-07-01", isMatch: false, durationMin: 60, totalDistance: 5000, highSpeedDistance: 400, sprintDistance: 120,
  maxVelocity: 30, playerLoad: 500, playerLoadPerMin: 8, metabolicPowerPeak: 40, accel: 20, decel: 22, cod: 15,
  accelEfforts: 5, decelEfforts: 6, strideCount: 300, strideB5: 40, strideB6: 30, strideB7: 10, strideB8: 3,
  clock: { "12": 4, "3": 2 }, ...over,
});

const raw: RawDossierInput = {
  identity: { name: "Ágúst Orri Þorsteinsson", position: "RW", sport: "football", dob: "2000-01-01", heightCm: 180, massKg: 75 },
  windowDays: 120, start: "2026-04-25", end: "2026-08-23",
  load: [
    day({ date: "2026-07-01", isMatch: false }),
    day({ date: "2026-07-05", isMatch: true, totalDistance: 10000, highSpeedDistance: 900 }),
    day({ date: "2026-07-12", isMatch: true, totalDistance: 11000, highSpeedDistance: 1100 }),
  ],
  vald: { cmj: null, imtp: null, cmjTrend: [], tests: [{ date: "2026-06-01", jumps: [38, 39, 40], meanJumpCm: 39, rsiMod: 0.45, relPeakPowerWkg: 55, asymmetryPct: 4 }] },
  vbt: [{ date: "2026-06-10", exercise: "Back Squat", loadKg: 100, meanVelocity: 0.6, peakVelocity: 1.1, meanPower: 800, peakPower: 1500 }],
  matches: [
    { date: "2026-07-05", opponent: "Valur", minutes: 90, goals: 1, assists: 0, xg: 0.4 },
    { date: "2026-07-12", opponent: "KR", minutes: 85, goals: 0, assists: 1, xg: 0.2 },
  ],
  fitness: [{ date: "2026-05-01", type: "30-15 IFT", value: 21, unit: "km/h", masKmh: 17, vo2maxEst: 58 }],
  peakPeriods: [{ date: "2026-07-05", metric: "distance", windowMin: 1, value: 200, unit: "m/min" }],
  athlete: null,
};

describe("buildTransferXlsx", () => {
  it("produces the expected sheets and a formula-driven average row that matches the manual mean", async () => {
    const buf = await buildTransferXlsx(raw);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const names = wb.worksheets.map((w) => w.name);
    for (const n of ["Overview", "Matches - GPS", "Matches - IMA", "Matches - Output", "Weekly - GPS", "Weekly - IMA", "Force plates - CMJ", "Strength & Fitness", "Movement direction (IMA)"]) {
      expect(names).toContain(n);
    }
    const gps = wb.getWorksheet("Matches - GPS")!;
    // 2 match rows → header(1) + 2 data + 1 average = 4 rows
    expect(gps.rowCount).toBe(4);
    const avgRow = gps.getRow(4);
    expect(avgRow.getCell(1).value).toBe("Average");
    const distCell = avgRow.getCell(4).value as { formula?: string };
    expect(distCell.formula).toMatch(/^AVERAGE\(D2:D3\)$/); // no #NAME?, real range
    // Output sheet totals are SUM formulas
    const out = wb.getWorksheet("Matches - Output")!;
    expect((out.getRow(out.rowCount).getCell(4).value as { formula?: string }).formula).toMatch(/^SUM\(/);
    // Overview carries the provenance note
    const ov = wb.getWorksheet("Overview")!;
    let hasNote = false;
    ov.eachRow((r) => r.eachCell((c) => { if (typeof c.value === "string" && c.value.includes("do not encode any readiness")) hasNote = true; }));
    expect(hasNote).toBe(true);
  });
});

describe("buildSessionsZip", () => {
  const drills: DrillRow[] = [
    { date: "2026-07-01", periodName: "Warm-up", periodNorm: "warmup", periodOrder: 1, durationMin: 15, distanceM: 1200, playerLoad: 120, playerLoadPerMin: 8, hirTotal: 50, maxVelocity: 24, imaAccel: 5, imaDecel: 6, imaCodTotal: 4, metabolicPowerPeak: 30, jumps: 0 },
    { date: "2026-07-01", periodName: "8v8 possession", periodNorm: "possession", periodOrder: 2, durationMin: 20, distanceM: 2000, playerLoad: 220, playerLoadPerMin: 11, hirTotal: 180, maxVelocity: 29, imaAccel: 12, imaDecel: 14, imaCodTotal: 9, metabolicPowerPeak: 42, jumps: 1 },
  ];

  it("writes one xlsx per session; drilled session has drill rows, others say so", async () => {
    const buf = await buildSessionsZip(raw, drills);
    const zip = await JSZip.loadAsync(buf as unknown as ArrayBuffer);
    const files = Object.keys(zip.files);
    expect(files.length).toBe(raw.load.length); // one per session (3)
    expect(files).toContain("Agust_Orri_Thorsteinsson_2026-07-01.xlsx");

    const withDrills = new ExcelJS.Workbook();
    await withDrills.xlsx.load(await zip.file("Agust_Orri_Thorsteinsson_2026-07-01.xlsx")!.async("nodebuffer") as unknown as ArrayBuffer);
    const dSheet = withDrills.getWorksheet("Drills")!;
    expect(dSheet.rowCount).toBe(1 + drills.length); // header + 2 drills

    const noDrills = new ExcelJS.Workbook();
    await noDrills.xlsx.load(await zip.file("Agust_Orri_Thorsteinsson_2026-07-05.xlsx")!.async("nodebuffer") as unknown as ArrayBuffer);
    const nd = noDrills.getWorksheet("Drills")!;
    expect(nd.getRow(2).getCell(1).value).toContain("No drill-level breakdown");
  });
});
