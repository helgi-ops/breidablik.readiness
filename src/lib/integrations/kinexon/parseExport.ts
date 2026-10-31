/**
 * Kinexon Perform (IMU / local-positioning) export parser — Path B (grounded).
 *
 * The Kinexon export is a semicolon-delimited, UTF-8-BOM table of ~190 per-player
 * per-session metrics. This parses it to typed rows the ingest maps into
 * player_external_load_daily (source='kinexon'). Kinexon fills the two gaps the
 * Titan feed has: per-session Duration (hh:mm:ss) and Changes of Direction
 * (total + left/right) — both surfaced here.
 *
 * Pure (no IO). European-number/BOM/`;`-delimiter handling is explicit, blanks
 * and `-` read as null (never 0 — that corrupts baselines). Descriptive external
 * load only: the mapper never writes a readiness colour.
 *
 * Variable mapping: docs/tasks/kinexon-ingestion-brief.md.
 */

/** Blank / dash / spreadsheet-error cells that must read as missing (null), never 0. */
const NULLISH = new Set(["", "-", "—", "n/a", "na", "#div/0!", "#ref!", "#n/a", "#value!"]);

/** Normalise a header for tolerant alias matching: strip BOM, lowercase, drop
 *  units/punctuation, collapse whitespace. "Distance (speed | high) (m)" →
 *  "distance speed high m". */
export function normHeader(h: string): string {
  return String(h ?? "")
    .replace(/^﻿/, "")
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a Kinexon numeric cell, tolerant of European and US number formats.
 * The rightmost of `.`/`,` is treated as the decimal separator (so `1.234,56`
 * and `1,234.56` both → 1234.56); a lone `,` is a European decimal (`12,5` →
 * 12.5). Blank / `-` → null (never 0).
 */
export function parseKinexonNumber(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (NULLISH.has(s.toLowerCase())) return null;
  s = s.replace(/\s/g, "").replace(/[^\d.,+-]/g, "");
  if (!s || s === "-" || s === "+") return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", "."); // European 1.234,56
    else s = s.replace(/,/g, "");                                        // US 1,234.56
  } else if (lastComma >= 0) {
    s = s.replace(",", ".");                                             // European decimal 12,5
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Parse "hh:mm:ss" (or "mm:ss", or plain seconds/minutes) → minutes. Null on blank. */
export function parseDurationToMinutes(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (NULLISH.has(s.toLowerCase())) return null;
  const parts = s.split(":").map((p) => p.trim());
  if (parts.length >= 2) {
    const nums = parts.map((p) => Number(p));
    if (nums.some((n) => !Number.isFinite(n))) return null;
    let secs: number;
    if (nums.length === 3) secs = nums[0] * 3600 + nums[1] * 60 + nums[2];
    else secs = nums[0] * 60 + nums[1];
    return Math.round((secs / 60) * 100) / 100;
  }
  // No colon → a plain number; treat as minutes.
  return parseKinexonNumber(s);
}

/** Tolerant session-date parse → yyyy-mm-dd. Accepts ISO and slash/dot/dash forms
 *  (day-first European default; an unambiguous >12 component wins). */
export function parseKinexonDate(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || NULLISH.has(s.toLowerCase())) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), y = m[3];
    let day: number, month: number;
    if (a > 12 && b <= 12) { day = a; month = b; }
    else if (b > 12 && a <= 12) { month = a; day = b; }
    else { day = a; month = b; } // European default: day first
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

/** One parsed Kinexon session row (per player, per session), in MicroPulse units. */
export interface KinexonRow {
  playerName: string;
  date: string | null;
  durationMin: number | null;
  totalDistance: number | null;
  highSpeedDistance: number | null;   // high + very-high
  sprintDistance: number | null;      // extreme
  velocityBand5: number | null;       // very-high
  velocityBand6: number | null;       // extreme
  maxVelocity: number | null;         // m/s (converted from km/h)
  playerLoad: number | null;          // Accumulated Acceleration Load
  playerLoadPerMinute: number | null;
  accelerations: number | null;       // sum Accel 1..4
  decelerations: number | null;       // sum Decel 1..4
  accelHighEfforts: number | null;    // Accel 3 + 4
  decelHighEfforts: number | null;    // Decel 3 + 4
  codEvents: number | null;           // Changes of Direction (fills the CoD gap)
  codLeft: number | null;
  codRight: number | null;
  mechanicalLoad: number | null;      // Kinexon vendor metric (labelled)
  jumps: number | null;
  jumpLoadJ: number | null;
  metabolicPower: number | null;
  metabolicPowerPeak: number | null;
  metabolicEnergyKj: number | null;   // kcal × 4.184
  highMetabolicLoadDistanceM: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  minHeartRate: number | null;
  footstrikes: number | null;         // Steps
  /** Full original row (header → raw cell), preserved for raw_payload_json. */
  raw: Record<string, string>;
}

/** Find a column index whose normalised header matches ALL of `includes` tokens
 *  (and NONE of `excludes`). Returns -1 when absent. */
function findCol(normed: string[], includes: string[], excludes: string[] = []): number {
  return normed.findIndex((h) => includes.every((t) => h.includes(t)) && !excludes.some((t) => h.includes(t)));
}

/** Split the raw export text into headers + rows. Strips the UTF-8 BOM and
 *  auto-detects the delimiter (`;` Kinexon default, else `,` / tab). */
export function splitKinexonCsv(text: string): { headers: string[]; rows: string[][] } {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const delim = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  // Quote-aware split: a delimiter inside "double quotes" is part of the field
  // (e.g. a "Last, First" name in a comma export), "" is an escaped quote.
  const split = (l: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (inQ) {
        if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1).map(split);
  return { headers, rows };
}

/** Sum a set of numeric columns (null-tolerant); null when none present. */
const sumCols = (get: (i: number) => number | null, idxs: number[]): number | null => {
  const vals = idxs.filter((i) => i >= 0).map(get).filter((v): v is number => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
};

/**
 * Map Kinexon export headers + rows to typed KinexonRow[]. Alias-tolerant (header
 * names vary by account config); blanks / `-` → null. Rows with no player name are
 * skipped. The caller resolves `playerName` to a roster player and upserts.
 */
export function parseKinexonExport(headers: string[], rows: string[][]): KinexonRow[] {
  const normed = headers.map(normHeader);
  const col = {
    player: findCol(normed, ["player"], ["load", "id"]) >= 0 ? findCol(normed, ["player"], ["load", "id"]) : findCol(normed, ["name"]),
    date: findCol(normed, ["date"]) >= 0 ? findCol(normed, ["date"]) : findCol(normed, ["day"]),
    duration: findCol(normed, ["duration"]),
    distance: findCol(normed, ["distance"], ["speed", "high", "metabolic", "min"]),
    distHigh: findCol(normed, ["distance", "speed", "high"], ["very", "extreme"]),
    distVeryHigh: findCol(normed, ["distance", "speed", "very", "high"]),
    distExtreme: findCol(normed, ["distance", "speed", "extreme"]),
    maxSpeed: findCol(normed, ["speed", "max"]),
    accLoad: findCol(normed, ["accumulated", "acceleration", "load"], ["min"]),
    accLoadMin: findCol(normed, ["accumulated", "acceleration", "load", "min"]),
    accel1: findCol(normed, ["accel", "1"]), accel2: findCol(normed, ["accel", "2"]),
    accel3: findCol(normed, ["accel", "3"]), accel4: findCol(normed, ["accel", "4"]),
    decel1: findCol(normed, ["decel", "1"]), decel2: findCol(normed, ["decel", "2"]),
    decel3: findCol(normed, ["decel", "3"]), decel4: findCol(normed, ["decel", "4"]),
    cod: findCol(normed, ["changes", "direction"], ["left", "right"]),
    codLeft: findCol(normed, ["changes", "direction", "left"]),
    codRight: findCol(normed, ["changes", "direction", "right"]),
    mechLoad: findCol(normed, ["mechanical", "load"]),
    jumps: findCol(normed, ["jumps"], ["load"]),
    jumpLoad: findCol(normed, ["jump", "load"]),
    metPowerAvg: findCol(normed, ["metabolic", "power"], ["max", "distance", "high"]),
    metPowerMax: findCol(normed, ["metabolic", "power", "max"]),
    metWork: findCol(normed, ["metabolic", "work"]),
    hmld: findCol(normed, ["high", "metabolic", "power", "distance"]),
    hrAvg: findCol(normed, ["heart", "rate"], ["max", "min", "time", "zone"]),
    hrMax: findCol(normed, ["heart", "rate", "max"]),
    hrMin: findCol(normed, ["heart", "rate", "min"]),
    steps: findCol(normed, ["steps"]),
  };
  const out: KinexonRow[] = [];
  for (const row of rows) {
    const cellRaw = (i: number): string | null => (i >= 0 && i < row.length ? row[i] : null);
    const n = (i: number) => parseKinexonNumber(cellRaw(i));
    const playerName = String(cellRaw(col.player) ?? "").trim();
    if (!playerName) continue; // blank / totals row

    const maxKmh = n(col.maxSpeed);
    const metKcal = n(col.metWork);
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { if (i < row.length && row[i] !== "") raw[h] = row[i]; });

    out.push({
      playerName,
      date: parseKinexonDate(cellRaw(col.date)),
      durationMin: parseDurationToMinutes(cellRaw(col.duration)),
      totalDistance: n(col.distance),
      highSpeedDistance: sumCols(n, [col.distHigh, col.distVeryHigh]),
      sprintDistance: n(col.distExtreme),
      velocityBand5: n(col.distVeryHigh),
      velocityBand6: n(col.distExtreme),
      maxVelocity: maxKmh != null ? Math.round((maxKmh / 3.6) * 100) / 100 : null,
      playerLoad: n(col.accLoad),
      playerLoadPerMinute: n(col.accLoadMin),
      accelerations: sumCols(n, [col.accel1, col.accel2, col.accel3, col.accel4]),
      decelerations: sumCols(n, [col.decel1, col.decel2, col.decel3, col.decel4]),
      accelHighEfforts: sumCols(n, [col.accel3, col.accel4]),
      decelHighEfforts: sumCols(n, [col.decel3, col.decel4]),
      codEvents: n(col.cod),
      codLeft: n(col.codLeft),
      codRight: n(col.codRight),
      mechanicalLoad: n(col.mechLoad),
      jumps: n(col.jumps),
      jumpLoadJ: n(col.jumpLoad),
      metabolicPower: n(col.metPowerAvg),
      metabolicPowerPeak: n(col.metPowerMax),
      metabolicEnergyKj: metKcal != null ? Math.round(metKcal * 4.184 * 100) / 100 : null,
      highMetabolicLoadDistanceM: n(col.hmld),
      avgHeartRate: n(col.hrAvg),
      maxHeartRate: n(col.hrMax),
      minHeartRate: n(col.hrMin),
      footstrikes: n(col.steps),
      raw,
    });
  }
  return out;
}

/** Non-blocking data-quality warnings for a Kinexon header row — surfaced to the
 *  upload UI so a coach knows what did/didn't map. */
export function kinexonExportWarnings(headers: string[]): string[] {
  const normed = headers.map(normHeader);
  const w: string[] = [];
  if (findCol(normed, ["player"], ["load", "id"]) < 0 && findCol(normed, ["name"]) < 0) w.push("No Player/Name column found — no rows will match.");
  if (findCol(normed, ["date"]) < 0 && findCol(normed, ["day"]) < 0) w.push("No Date column found — sessions can't be keyed.");
  if (findCol(normed, ["accumulated", "acceleration", "load"]) < 0) w.push("No 'Accumulated Acceleration Load' (PlayerLoad) column — load bands will be empty.");
  if (findCol(normed, ["changes", "direction"]) < 0) w.push("No 'Changes of Direction' column — the CoD metrics Kinexon adds won't populate.");
  return w;
}
