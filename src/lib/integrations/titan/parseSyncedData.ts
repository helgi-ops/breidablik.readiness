/**
 * Titan (Integrated Bionics / Hudl) indoor IMU — `_synced_data` parser.
 *
 * Titan is an INDOOR IMU system: no usable GPS indoors, the signal is Player Load + Impacts +
 * Jumps + active durations. The Titan "Indoor Report" workbook syncs per-session rows to a
 * `_synced_data` tab (9 columns). This pure, deterministic parser maps those columns — alias- and
 * case-tolerant — into typed rows, treating blanks and spreadsheet error strings (#DIV/0!, #REF!,
 * #N/A) as **null, never 0** (the summary tabs show those strings before any session exists).
 *
 * No I/O, no DB, no load math. GPS metrics are always absent for Titan (left to the adapter to null).
 *
 * Confirmed header row (A1:I1), exact strings:
 *   Date | Player Name | IMU Player Load | IMU Duration | Load / Minute |
 *   Low Active Duration | High Active Duration | IMU Jumps | Impacts
 */

/** Canonical Titan fields. `loadPerMinute` is derived in the sheet; we keep it only for reference. */
export interface TitanRow {
  /** yyyy-mm-dd (normalised), or null when the date cell is blank/unparseable. */
  date: string | null;
  /** Raw player name as it appears in the sheet (matched to a player downstream). */
  playerName: string;
  imuPlayerLoad: number | null;
  imuDurationMin: number | null;
  lowActiveMin: number | null;
  highActiveMin: number | null;
  imuJumps: number | null;
  impacts: number | null;
  /**
   * Load/Minute = player_load ÷ duration, RECOMPUTED here from the two trusted
   * fields — we never trust the sheet's own column (a degenerate export carries a
   * flat `1` for every player). Null when duration is missing (the common case in
   * the malformed `_synced_data` export).
   */
  loadPerMinute: number | null;
}

type CanonicalKey =
  | "date" | "playerName" | "imuPlayerLoad" | "imuDurationMin" | "loadPerMinute"
  | "lowActiveMin" | "highActiveMin" | "imuJumps" | "impacts";

/** Normalise a header for alias matching: lowercase, strip punctuation, collapse whitespace. */
function normHeader(h: string): string {
  return String(h ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Alias set — each canonical key maps to the normalised forms it accepts. */
const HEADER_ALIASES: Record<CanonicalKey, string[]> = {
  date: ["date", "session date"],
  playerName: ["player name", "player", "name", "athlete", "athlete name"],
  imuPlayerLoad: ["imu player load", "imu playerload", "player load", "playerload", "imu load"],
  imuDurationMin: ["imu duration", "duration", "active duration", "session duration"],
  loadPerMinute: ["load minute", "load per minute", "load min", "imu load minute"],
  lowActiveMin: ["low active duration", "low active", "low intensity duration"],
  highActiveMin: ["high active duration", "high active", "high intensity duration"],
  imuJumps: ["imu jumps", "jumps", "jump count"],
  impacts: ["impacts", "impact", "impact count"],
};

/** Spreadsheet error strings / blanks that must read as missing (null), never 0. */
const ERROR_STRINGS = new Set(["#div/0!", "#ref!", "#n/a", "#value!", "#name?", "#num!", "#null!", "na", "n/a", "-", "—", ""]);

/** Parse a Titan numeric cell. Blank / error strings → null (never 0). Strips thousands commas. */
export function parseTitanNumber(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim();
  if (ERROR_STRINGS.has(s.toLowerCase())) return null;
  const cleaned = s.replace(/,/g, "");
  if (!/^[+-]?\d*\.?\d+$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a Titan date cell → yyyy-mm-dd, or null. Accepts ISO (yyyy-mm-dd[THH..]) and day-first
 * European forms (dd/mm/yyyy, dd.mm.yyyy, dd-mm-yyyy); Icelandic/European locale is day-first.
 */
export function parseTitanDate(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || ERROR_STRINGS.has(s.toLowerCase())) return null;
  // ISO yyyy-mm-dd (optionally with a time) → take the date part.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Day-first dd[sep]mm[sep]yyyy.
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, "0"), m = dmy[2].padStart(2, "0"), y = dmy[3];
    if (Number(m) >= 1 && Number(m) <= 12 && Number(d) >= 1 && Number(d) <= 31) return `${y}-${m}-${d}`;
  }
  return null;
}

/** Resolve each canonical key to its column index in the header row (or -1 when absent). */
export function resolveTitanHeaderMap(headers: string[]): Record<CanonicalKey, number> {
  const normed = headers.map(normHeader);
  const out = {} as Record<CanonicalKey, number>;
  (Object.keys(HEADER_ALIASES) as CanonicalKey[]).forEach((key) => {
    out[key] = normed.findIndex((h) => HEADER_ALIASES[key].includes(h));
  });
  return out;
}

/**
 * Map the `_synced_data` headers + rows to typed TitanRow[]. Alias-tolerant; null (not 0) for
 * blanks / error strings. A row with no player name is skipped (a trailing/blank sheet row).
 */
export function parseTitanSyncedData(headers: string[], rows: string[][]): TitanRow[] {
  const map = resolveTitanHeaderMap(headers);
  const cell = (row: string[], key: CanonicalKey): string | null => {
    const i = map[key];
    return i >= 0 && i < row.length ? row[i] : null;
  };
  const out: TitanRow[] = [];
  for (const row of rows) {
    const playerName = String(cell(row, "playerName") ?? "").trim();
    if (!playerName) continue; // skip blank / total rows
    const imuPlayerLoad = parseTitanNumber(cell(row, "imuPlayerLoad"));
    const imuDurationMin = parseTitanNumber(cell(row, "imuDurationMin"));
    // Recompute load/minute from the two trusted fields — never trust the sheet's
    // own column (the degenerate export carries a flat `1` for every player). No
    // duration → null, not the bogus sheet value.
    const loadPerMinute =
      imuPlayerLoad != null && imuDurationMin != null && imuDurationMin > 0
        ? Number((imuPlayerLoad / imuDurationMin).toFixed(3))
        : null;
    out.push({
      date: parseTitanDate(cell(row, "date")),
      playerName,
      imuPlayerLoad,
      imuDurationMin,
      lowActiveMin: parseTitanNumber(cell(row, "lowActiveMin")),
      highActiveMin: parseTitanNumber(cell(row, "highActiveMin")),
      imuJumps: parseTitanNumber(cell(row, "imuJumps")),
      impacts: parseTitanNumber(cell(row, "impacts")),
      loadPerMinute,
    });
  }
  return out;
}

/**
 * Non-blocking data-quality warnings for a `_synced_data` header row — surfaced
 * to the upload UI + the cron result so a coach knows WHY only part of the export
 * was imported. Detects the two tells of the malformed report-template export:
 * duplicated canonical columns (e.g. "IMU Player Load" repeated across 3,4,6,7,8)
 * and absent IMU Duration / Jumps. Never blocks — the valid columns still ingest.
 */
export function titanExportWarnings(headers: string[]): string[] {
  const normed = headers.map(normHeader);
  const warnings: string[] = [];

  // A canonical key is "duplicated" when >1 header column matches its alias set.
  const dupLabels: string[] = [];
  const DUP_CHECK: Array<[CanonicalKey, string]> = [
    ["imuPlayerLoad", "IMU Player Load"], ["impacts", "Impacts"], ["imuDurationMin", "IMU Duration"], ["imuJumps", "IMU Jumps"],
  ];
  for (const [key, label] of DUP_CHECK) {
    const count = normed.filter((h) => HEADER_ALIASES[key].includes(h)).length;
    if (count > 1) dupLabels.push(`${label} ×${count}`);
  }
  if (dupLabels.length) {
    warnings.push(`This export has duplicated columns (${dupLabels.join(", ")}) — only the first of each was used. Re-export the \`_synced_data\` tab from Titan/Hudl with the correct one-column-each layout.`);
  }

  const map = resolveTitanHeaderMap(headers);
  const missing: string[] = [];
  if (map.imuDurationMin < 0) missing.push("IMU Duration");
  if (map.imuJumps < 0) missing.push("IMU Jumps");
  if (missing.length) {
    warnings.push(`This export is missing ${missing.join(" / ")} (only the available columns — e.g. player load + impacts — were imported). Re-export the \`_synced_data\` tab from Titan/Hudl with the full column set for complete data.`);
  }
  return warnings;
}

/** True when a row carries at least one usable IMU signal (so blank-but-named rows are droppable). */
export function titanRowHasSignal(r: TitanRow): boolean {
  return r.imuPlayerLoad != null || r.imuJumps != null || r.impacts != null || r.imuDurationMin != null;
}

/** Quote-aware CSV → matrix. Comma or semicolon delimited (auto-detected from the first line). */
export function csvToMatrix(text: string): string[][] {
  const t = String(text ?? "").replace(/^﻿/, "");
  const firstLine = t.split("\n")[0] ?? "";
  const delim = (firstLine.split(";").length) > (firstLine.split(",").length) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); out.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); out.push(row); }
  return out;
}

/**
 * Parse a full `_synced_data` CSV string → { headers, rows }. The first non-empty line is the header
 * (A1:I1). Used by both the browser upload page and the server-side Google-Sheet sync so they read
 * identically.
 */
export function parseTitanCsv(csvText: string): { headers: string[]; rows: TitanRow[]; warnings: string[] } {
  const matrix = csvToMatrix(csvText);
  const firstIdx = matrix.findIndex((r) => r.some((c) => String(c).trim() !== ""));
  if (firstIdx < 0) return { headers: [], rows: [], warnings: [] };
  const headers = matrix[firstIdx];
  return { headers, rows: parseTitanSyncedData(headers, matrix.slice(firstIdx + 1)), warnings: titanExportWarnings(headers) };
}
