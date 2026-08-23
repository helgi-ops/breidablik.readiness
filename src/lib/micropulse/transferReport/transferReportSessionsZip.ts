/**
 * Transfer-report per-session pack — one .xlsx per training/match session (Session summary sheet
 * + drill-by-drill sheet), zipped. Reads the SAME LoadDaily rows the dossier uses (one source of
 * truth) plus the drill-level rows the PDF doesn't (loadDrillRows). Descriptive export only.
 */

import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { RawDossierInput, LoadDaily } from "@/lib/micropulse/transferReport";
import { asciiSlug, type DrillRow } from "@/lib/micropulse/transferReport/loadData";

const FONT = { name: "Arial", size: 10 } as const;
const HEADER_FILL = "FF1F3A5F";
const r1 = (v: number | null, d = 1): number | null => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

function headerRow(ws: ExcelJS.Worksheet, values: string[]) {
  const row = ws.addRow(values);
  values.forEach((_, i) => {
    const cell = row.getCell(i + 1);
    cell.font = { ...FONT, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: i === 0 ? "left" : "right" };
  });
  ws.views = [{ state: "frozen", ySplit: row.number }];
}

async function sessionWorkbook(player: string, day: LoadDaily, drills: DrillRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MicroPulse";

  const s = wb.addWorksheet("Session");
  s.getColumn(1).width = 26; s.getColumn(2).width = 16;
  const kv = (k: string, v: string | number | null) => { const row = s.addRow([k, v]); row.getCell(1).font = { ...FONT, bold: true }; row.getCell(2).font = FONT; row.getCell(2).alignment = { horizontal: "right" }; };
  const title = s.addRow([`${player} — session ${day.date}`]); title.getCell(1).font = { ...FONT, size: 13, bold: true }; s.addRow([]);
  kv("Date", day.date);
  kv("Type", day.isMatch ? "Match" : "Training");
  kv("Duration (min)", r1(day.durationMin, 0));
  kv("Total distance (m)", r1(day.totalDistance, 0));
  kv("High-speed running (m)", r1(day.highSpeedDistance, 0));
  kv("Sprint distance (m)", r1(day.sprintDistance, 0));
  kv("Max velocity (km/h)", r1(day.maxVelocity, 1));
  kv("Player Load (AU)", r1(day.playerLoad, 0));
  kv("Player Load / min", r1(day.playerLoadPerMin, 1));
  kv("Peak metabolic power (W/kg)", r1(day.metabolicPowerPeak, 1));
  kv("Accelerations", r1(day.accel, 0));
  kv("Decelerations", r1(day.decel, 0));
  kv("Change of direction", r1(day.cod, 0));
  kv("High accel efforts", r1(day.accelEfforts, 0));
  kv("High decel efforts", r1(day.decelEfforts, 0));
  kv("Strides (total)", r1(day.strideCount, 0));
  kv("Strides B6 / B7 / B8", [day.strideB6, day.strideB7, day.strideB8].map((x) => (x == null ? "–" : Math.round(x))).join(" / "));

  const d = wb.addWorksheet("Drills");
  const cols = ["Period", "Order", "Duration (min)", "Distance (m)", "Player Load", "PL/min", "HIR (m)", "Max vel (km/h)", "IMA accel", "IMA decel", "IMA CoD", "Peak metab (W/kg)", "Jumps"];
  headerRow(d, cols);
  cols.forEach((_, i) => (d.getColumn(i + 1).width = i === 0 ? 22 : 12));
  if (drills.length === 0) {
    const row = d.addRow(["No drill-level breakdown for this session."]);
    row.getCell(1).font = { ...FONT, italic: true, color: { argb: "FF666666" } };
    d.mergeCells(row.number, 1, row.number, cols.length);
  } else {
    for (const dr of drills) {
      const row = d.addRow([dr.periodName ?? dr.periodNorm ?? "—", dr.periodOrder, r1(dr.durationMin, 0), r1(dr.distanceM, 0), r1(dr.playerLoad, 0), r1(dr.playerLoadPerMin, 1), r1(dr.hirTotal, 0), r1(dr.maxVelocity, 1), r1(dr.imaAccel, 0), r1(dr.imaDecel, 0), r1(dr.imaCodTotal, 0), r1(dr.metabolicPowerPeak, 1), r1(dr.jumps, 0)]);
      row.eachCell((c, ci) => { c.font = FONT; c.alignment = { horizontal: ci === 1 ? "left" : "right" }; });
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildSessionsZip(raw: RawDossierInput, drillRows: DrillRow[]): Promise<Buffer> {
  const player = asciiSlug(raw.identity.name || "player") || "player";
  const drillsByDate = new Map<string, DrillRow[]>();
  for (const dr of drillRows) (drillsByDate.get(dr.date) ?? drillsByDate.set(dr.date, []).get(dr.date)!).push(dr);

  const zip = new JSZip();
  const days = raw.load.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const day of days) {
    const buf = await sessionWorkbook(player, day, drillsByDate.get(day.date) ?? []);
    zip.file(`${player}_${day.date}.xlsx`, buf);
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) as Promise<Buffer>;
}
