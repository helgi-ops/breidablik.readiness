/**
 * Transfer-report Excel workbook — reads the SAME normalised RawDossierInput the PDF/JSON use
 * (one source of truth), so the Excel and the dossier can never drift. Multi-sheet .xlsx via
 * exceljs (Node): Overview + per-match GPS/IMA/Output + weekly load + CMJ + strength/fitness +
 * movement direction. Summary rows are AVERAGE/SUM formulas so they recalc for the recipient.
 * Descriptive performance export — it encodes no readiness/availability judgement.
 */

import ExcelJS from "exceljs";
import type { RawDossierInput, LoadDaily } from "@/lib/micropulse/transferReport";
import { QUALITY_BY_ID, type QualityId } from "@/lib/micropulse/playerAnalysis/athleteProfile";

const HEADER_FILL = "FF1F3A5F";
const SUBHEAD_FILL = "FFE8EDF3";
const FONT = { name: "Arial", size: 10 } as const;
const colLetter = (i: number) => { let s = "", n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

type Col = { header: string; width?: number; sum?: "avg" | "sum" };

function styleHeaderRow(ws: ExcelJS.Worksheet, rowNum: number, nCols: number) {
  const row = ws.getRow(rowNum);
  for (let c = 1; c <= nCols; c++) {
    const cell = row.getCell(c);
    cell.font = { ...FONT, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: c === 1 ? "left" : "right", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFAAB4C0" } } };
  }
  row.height = 24;
}

/** A titled table with a styled header, data rows, and (optional) formula summary row. */
function addTable(ws: ExcelJS.Worksheet, cols: Col[], rows: Array<Array<string | number | null>>, startRow: number): number {
  const headerRow = ws.getRow(startRow);
  cols.forEach((c, i) => { headerRow.getCell(i + 1).value = c.header; ws.getColumn(i + 1).width = Math.max(ws.getColumn(i + 1).width ?? 0, c.width ?? 12); });
  styleHeaderRow(ws, startRow, cols.length);
  rows.forEach((r, ri) => {
    const row = ws.getRow(startRow + 1 + ri);
    r.forEach((v, ci) => { const cell = row.getCell(ci + 1); cell.value = v; cell.font = FONT; cell.alignment = { horizontal: ci === 0 ? "left" : "right" }; });
  });
  const dataStart = startRow + 1, dataEnd = startRow + rows.length;
  if (cols.some((c) => c.sum) && rows.length > 0) {
    const sumRowNum = dataEnd + 1;
    const sumRow = ws.getRow(sumRowNum);
    const anyAvg = cols.some((c) => c.sum === "avg");
    sumRow.getCell(1).value = anyAvg ? "Average" : "Total";
    cols.forEach((c, i) => {
      const cell = sumRow.getCell(i + 1);
      cell.font = { ...FONT, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUBHEAD_FILL } };
      cell.alignment = { horizontal: i === 0 ? "left" : "right" };
      if (c.sum && i > 0) { const L = colLetter(i); cell.value = { formula: `${c.sum === "avg" ? "AVERAGE" : "SUM"}(${L}${dataStart}:${L}${dataEnd})` }; }
    });
    return sumRowNum;
  }
  return dataEnd;
}

function sheet(wb: ExcelJS.Workbook, title: string): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(title.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.properties.defaultRowHeight = 15;
  return ws;
}

const r1 = (v: number | null, d = 1): number | null => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const isoWeek = (dateStr: string): string => {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86_400_000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};
const sum = (xs: Array<number | null>): number | null => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
const avg = (xs: Array<number | null>): number | null => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

export async function buildTransferXlsx(raw: RawDossierInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MicroPulse"; wb.created = new Date(raw.end + "T00:00:00Z");
  const matches = raw.load.filter((l) => l.isMatch);
  const oppByDate = new Map(raw.matches.map((m) => [m.date, m.opponent]));

  // ── Overview ──
  {
    const ws = sheet(wb, "Overview");
    ws.getColumn(1).width = 26; ws.getColumn(2).width = 22;
    let r = 1;
    const kv = (k: string, v: string | number | null, bold = false) => { const row = ws.getRow(r++); row.getCell(1).value = k; row.getCell(1).font = { ...FONT, bold: true }; const c = row.getCell(2); c.value = v; c.font = { ...FONT, bold }; };
    ws.mergeCells(r, 1, r, 4); const t = ws.getRow(r).getCell(1); t.value = "Performance data export"; t.font = { ...FONT, size: 14, bold: true }; r += 2;
    kv("Player", raw.identity.name); kv("Position", raw.identity.position ?? "—");
    kv("Window", `${raw.start} → ${raw.end} (${raw.windowDays} days)`);
    kv("Sessions", raw.load.length); kv("Matches", matches.length);
    kv("Data sources", "Catapult GPS/IMA · VALD ForceDecks · GymAware VBT · fitness tests · match minutes/output");
    kv("Generated", raw.end);
    r++;
    ws.mergeCells(r, 1, r, 4);
    const note = ws.getRow(r).getCell(1);
    note.value = "Descriptive performance export over the window above, shared as part of an agreed transfer; figures do not encode any readiness/availability judgement.";
    note.font = { ...FONT, italic: true, color: { argb: "FF666666" } }; note.alignment = { wrapText: true }; ws.getRow(r).height = 30; r += 2;

    // Athlete percentiles
    if (raw.athlete && raw.athlete.qualities.some((q) => q.positionPercentile != null)) {
      const rows = raw.athlete.qualities.filter((q) => q.positionPercentile != null).map((q) => [QUALITY_BY_ID[q.id as QualityId]?.en ?? q.id, r1(q.value ?? null, 1), q.unit ?? "", q.positionPercentile as number]);
      r = addTable(ws, [{ header: "Athletic quality", width: 26 }, { header: "Value" }, { header: "Unit", width: 8 }, { header: "Percentile (position)", width: 18 }], rows, r) + 2;
    }
    // Worst-case (peak periods) — best value per metric+window
    if (raw.peakPeriods.length) {
      const best = new Map<string, { metric: string; win: number; value: number; unit: string | null }>();
      for (const p of raw.peakPeriods) { const k = `${p.metric}|${p.windowMin}`; const cur = best.get(k); if (!cur || p.value > cur.value) best.set(k, { metric: p.metric, win: p.windowMin, value: p.value, unit: p.unit }); }
      const rows = [...best.values()].sort((a, b) => a.metric.localeCompare(b.metric) || a.win - b.win).map((b) => [b.metric, b.win, r1(b.value, 1), b.unit ?? ""]);
      r = addTable(ws, [{ header: "Worst-case metric", width: 22 }, { header: "Window (min)" }, { header: "Peak value" }, { header: "Unit", width: 8 }], rows, r) + 1;
    }
  }

  // ── Matches - GPS ──
  addTable(sheet(wb, "Matches - GPS"),
    [{ header: "Date", width: 12 }, { header: "Opponent", width: 18 }, { header: "Min", sum: "avg" }, { header: "Distance (m)", sum: "avg" }, { header: "HSR (m)", sum: "avg" }, { header: "Sprint (m)", sum: "avg" }, { header: "Max vel (km/h)", sum: "avg" }, { header: "Player Load", sum: "avg" }, { header: "PL/min", sum: "avg" }, { header: "Peak metab (W/kg)", sum: "avg" }],
    matches.map((l) => [l.date, oppByDate.get(l.date) ?? "", r1(l.durationMin, 0), r1(l.totalDistance, 0), r1(l.highSpeedDistance, 0), r1(l.sprintDistance, 0), r1(l.maxVelocity, 1), r1(l.playerLoad, 0), r1(l.playerLoadPerMin, 1), r1(l.metabolicPowerPeak, 1)]), 1);

  // ── Matches - IMA ──
  addTable(sheet(wb, "Matches - IMA"),
    [{ header: "Date", width: 12 }, { header: "Opponent", width: 18 }, { header: "Accel", sum: "avg" }, { header: "Decel", sum: "avg" }, { header: "CoD", sum: "avg" }, { header: "Accel efforts", sum: "avg" }, { header: "Decel efforts", sum: "avg" }, { header: "Strides", sum: "avg" }, { header: "Stride B6", sum: "avg" }, { header: "Stride B7", sum: "avg" }, { header: "Stride B8", sum: "avg" }],
    matches.map((l) => [l.date, oppByDate.get(l.date) ?? "", r1(l.accel, 0), r1(l.decel, 0), r1(l.cod, 0), r1(l.accelEfforts, 0), r1(l.decelEfforts, 0), r1(l.strideCount, 0), r1(l.strideB6, 0), r1(l.strideB7, 0), r1(l.strideB8, 0)]), 1);

  // ── Matches - Output ──
  addTable(sheet(wb, "Matches - Output"),
    [{ header: "Date", width: 12 }, { header: "Opponent", width: 18 }, { header: "Min", sum: "sum" }, { header: "Goals", sum: "sum" }, { header: "Assists", sum: "sum" }, { header: "xG", sum: "sum" }],
    raw.matches.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((m) => [m.date, m.opponent ?? "", r1(m.minutes, 0), m.goals, m.assists, r1(m.xg, 2)]), 1);

  // ── Weekly (GPS + IMA) ──
  const weeks = new Map<string, LoadDaily[]>();
  for (const l of raw.load) { const w = isoWeek(l.date); (weeks.get(w) ?? weeks.set(w, []).get(w)!).push(l); }
  const weekKeys = [...weeks.keys()].sort();
  addTable(sheet(wb, "Weekly - GPS"),
    [{ header: "Week", width: 12 }, { header: "Sessions", sum: "sum" }, { header: "Distance (m)", sum: "sum" }, { header: "HSR (m)", sum: "sum" }, { header: "Sprint (m)", sum: "sum" }, { header: "Player Load", sum: "sum" }, { header: "PL/min (avg)", sum: "avg" }],
    weekKeys.map((w) => { const ls = weeks.get(w)!; return [w, ls.length, r1(sum(ls.map((l) => l.totalDistance)), 0), r1(sum(ls.map((l) => l.highSpeedDistance)), 0), r1(sum(ls.map((l) => l.sprintDistance)), 0), r1(sum(ls.map((l) => l.playerLoad)), 0), r1(avg(ls.map((l) => l.playerLoadPerMin)), 1)]; }), 1);
  addTable(sheet(wb, "Weekly - IMA"),
    [{ header: "Week", width: 12 }, { header: "Sessions", sum: "sum" }, { header: "Accel", sum: "sum" }, { header: "Decel", sum: "sum" }, { header: "CoD", sum: "sum" }, { header: "Strides", sum: "sum" }],
    weekKeys.map((w) => { const ls = weeks.get(w)!; return [w, ls.length, r1(sum(ls.map((l) => l.accel)), 0), r1(sum(ls.map((l) => l.decel)), 0), r1(sum(ls.map((l) => l.cod)), 0), r1(sum(ls.map((l) => l.strideCount)), 0)]; }), 1);

  // ── Force plates - CMJ ──
  {
    const ws = sheet(wb, "Force plates - CMJ");
    const tests = raw.vald?.tests ?? [];
    addTable(ws,
      [{ header: "Date", width: 12 }, { header: "Jump 1 (cm)" }, { header: "Jump 2 (cm)" }, { header: "Jump 3 (cm)" }, { header: "Mean jump (cm)", sum: "avg" }, { header: "RSI-mod", sum: "avg" }, { header: "Rel peak power (W/kg)", sum: "avg" }, { header: "Asymmetry %", sum: "avg" }],
      tests.map((t) => [t.date, r1(t.jumps[0] ?? null, 1), r1(t.jumps[1] ?? null, 1), r1(t.jumps[2] ?? null, 1), r1(t.meanJumpCm, 1), r1(t.rsiMod, 2), r1(t.relPeakPowerWkg, 1), r1(t.asymmetryPct, 1)]), 1);
  }

  // ── Strength & Fitness (VBT + fitness tests) ──
  {
    const ws = sheet(wb, "Strength & Fitness");
    const fitStart = addTable(ws,
      [{ header: "VBT date", width: 12 }, { header: "Exercise", width: 20 }, { header: "Load (kg)" }, { header: "Mean vel (m/s)" }, { header: "Peak vel (m/s)" }, { header: "Mean power (W)" }, { header: "Peak power (W)" }],
      raw.vbt.map((v) => [v.date, v.exercise ?? "", r1(v.loadKg, 1), r1(v.meanVelocity, 2), r1(v.peakVelocity, 2), r1(v.meanPower, 0), r1(v.peakPower, 0)]), 1) + 2;
    addTable(ws,
      [{ header: "Fitness date", width: 12 }, { header: "Test", width: 20 }, { header: "Value" }, { header: "Unit", width: 8 }, { header: "MAS (km/h)" }, { header: "VO2max est" }],
      raw.fitness.map((f) => [f.date, f.type, r1(f.value, 1), f.unit ?? "", r1(f.masKmh, 1), r1(f.vo2maxEst, 1)]), fitStart);
  }

  // ── Movement direction (IMA) — aggregate high-intensity clock events ──
  {
    const agg = new Map<string, number>();
    for (const l of raw.load) if (l.clock) for (const [dir, v] of Object.entries(l.clock)) agg.set(dir, (agg.get(dir) ?? 0) + (Number.isFinite(v) ? v : 0));
    const total = [...agg.values()].reduce((a, b) => a + b, 0) || 1;
    const rows = [...agg.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([dir, v]) => [`${dir} o'clock`, v, r1((v / total) * 100, 1)]);
    addTable(sheet(wb, "Movement direction (IMA)"),
      [{ header: "Clock direction", width: 16 }, { header: "High-intensity events", sum: "sum" }, { header: "Share %" }], rows, 1);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
