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
 * Two confirmed header layouts (alias-tolerant — either ingests):
 *   Legacy:  Date | Player Name | IMU Player Load | IMU Duration | Load / Minute |
 *            Low Active Duration | High Active Duration | IMU Jumps | Impacts
 *   Current: Date | Player Name | IMU Load Index |
 *            IMU Movement Profile (Idx) Settled Duration |
 *            IMU Movement Profile (Idx) Low Intensity Duration |
 *            IMU Movement Profile (Idx) Mid Intensity Duration |
 *            IMU Movement Profile (Idx) High Intensity Duration | IMU Jumps | Impacts
 *
 * The current export is the one Titan/Hudl produces once the full IMU metric set is enabled on the
 * team's account (the legacy export fell back to duplicated Player-Load columns). "IMU Load Index" is
 * the load anchor (mapped onto imuPlayerLoad → total_player_load); it is read on a personal norm, so
 * the absolute scale does not need to equal the old "IMU Player Load". The Movement-Profile columns are
 * the time-in-intensity breakdown (settled / low / mid / high); the engine reads them on the player's
 * own baseline, so their unit (as Titan reports it) is preserved verbatim, never converted.
 */

/** Canonical Titan fields. `loadPerMinute` is derived in the sheet; we keep it only for reference. */
export interface TitanRow {
  /** yyyy-mm-dd (normalised), or null when the date cell is blank/unparseable. */
  date: string | null;
  /** Raw player name as it appears in the sheet (matched to a player downstream). */
  playerName: string;
  /** Load anchor — "IMU Player Load" (legacy) OR "IMU Load Index" (current export). */
  imuPlayerLoad: number | null;
  imuDurationMin: number | null;
  /** Movement-Profile "Settled Duration" (current export; absent in legacy). */
  settledMin: number | null;
  /** Movement-Profile "Low Intensity Duration" (current) / "Low Active Duration" (legacy). */
  lowActiveMin: number | null;
  /** Movement-Profile "Mid Intensity Duration" (current export; absent in legacy). */
  midActiveMin: number | null;
  /** Movement-Profile "High Intensity Duration" (current) / "High Active Duration" (legacy). */
  highActiveMin: number | null;
  imuJumps: number | null;
  impacts: number | null;
  /**
   * Load/Minute = player_load ÷ duration, RECOMPUTED here from the two trusted
   * fields — we never trust the sheet's own column (a degenerate export carries a
   * flat `1` for every player). Null when duration is missing (the common case in
   * the current `_synced_data` export, which carries intensity durations but no
   * single IMU Duration column).
   */
  loadPerMinute: number | null;
}

type CanonicalKey =
  | "date" | "playerName" | "imuPlayerLoad" | "imuDurationMin" | "loadPerMinute"
  | "settledMin" | "lowActiveMin" | "midActiveMin" | "highActiveMin" | "imuJumps" | "impacts";

/** Normalise a header for alias matching: lowercase, strip punctuation, collapse whitespace. */
function normHeader(h: string): string {
  return String(h ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Alias set — each canonical key maps to the normalised forms it accepts. */
const HEADER_ALIASES: Record<CanonicalKey, string[]> = {
  date: ["date", "session date"],
  playerName: ["player name", "player", "name", "athlete", "athlete name"],
  // Load anchor: legacy "IMU Player Load" OR current "IMU Load Index".
  imuPlayerLoad: ["imu player load", "imu playerload", "player load", "playerload", "imu load", "imu load index", "load index"],
  imuDurationMin: ["imu duration", "duration", "active duration", "session duration"],
  loadPerMinute: ["load minute", "load per minute", "load min", "imu load minute"],
  // Movement-Profile time-in-intensity buckets. Current export prefixes each with
  // "IMU Movement Profile (Idx)"; legacy used "Low/High Active Duration".
  settledMin: [
    "imu movement profile idx settled duration", "movement profile settled duration",
    "settled duration", "settled active duration", "settled",
  ],
  lowActiveMin: [
    "low active duration", "low active", "low intensity duration",
    "imu movement profile idx low intensity duration", "movement profile low intensity duration",
  ],
  midActiveMin: [
    "imu movement profile idx mid intensity duration", "movement profile mid intensity duration",
    "mid intensity duration", "mid active duration", "mid active",
  ],
  highActiveMin: [
    "high active duration", "high active", "high intensity duration",
    "imu movement profile idx high intensity duration", "movement profile high intensity duration",
  ],
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
 * Parse a Titan date cell → yyyy-mm-dd, or null. Accepts ISO (yyyy-mm-dd[THH..]) and slash/dot/dash
 * forms. `order` picks the ambiguous-case convention: "dmy" (dd/mm/yyyy — Icelandic/European, the
 * default) or "mdy" (mm/dd/yyyy — the Titan/Hudl US export). A component that is unambiguously a day
 * (>12) always wins over `order`, so a correct date survives either way.
 */
export function parseTitanDate(
  raw: string | number | null | undefined,
  order: "dmy" | "mdy" = "dmy",
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s || ERROR_STRINGS.has(s.toLowerCase())) return null;
  // ISO yyyy-mm-dd (optionally with a time) → take the date part.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (parts) {
    const a = Number(parts[1]), b = Number(parts[2]), y = parts[3];
    let day: number, month: number;
    if (a > 12 && b <= 12) { day = a; month = b; }        // first is unambiguously a day → d/m/y
    else if (b > 12 && a <= 12) { month = a; day = b; }    // second is unambiguously a day → m/d/y
    else { // both ≤ 12 (or both > 12): fall back to the declared order
      if (order === "mdy") { month = a; day = b; } else { day = a; month = b; }
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

/**
 * Infer the slash-date convention for a whole `_synced_data` file from its date column: if any cell
 * has an unambiguous day in the 2nd position (> 12) it is "mdy" (the Titan/Hudl US export); if any has
 * it in the 1st position it is "dmy". Ambiguous-only files default to "dmy" (European), unchanged.
 */
export function detectTitanDateOrder(rawDates: Array<string | number | null | undefined>): "dmy" | "mdy" {
  let mdy = false, dmy = false;
  for (const raw of rawDates) {
    const m = String(raw ?? "").trim().match(/^(\d{1,2})[./-](\d{1,2})[./-]\d{4}$/);
    if (!m) continue;
    const a = Number(m[1]), b = Number(m[2]);
    if (b > 12 && a <= 12) mdy = true;
    else if (a > 12 && b <= 12) dmy = true;
  }
  if (mdy && !dmy) return "mdy";
  return "dmy";
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
  // Decide the slash-date convention once for the whole file (Titan/Hudl exports day in the 2nd
  // position, US-style), so ambiguous rows (both parts ≤ 12) parse consistently with the clear ones.
  const dateOrder = detectTitanDateOrder(rows.map((r) => cell(r, "date")));
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
      date: parseTitanDate(cell(row, "date"), dateOrder),
      playerName,
      imuPlayerLoad,
      imuDurationMin,
      settledMin: parseTitanNumber(cell(row, "settledMin")),
      lowActiveMin: parseTitanNumber(cell(row, "lowActiveMin")),
      midActiveMin: parseTitanNumber(cell(row, "midActiveMin")),
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
  // Load anchor absent (neither "IMU Player Load" nor "IMU Load Index").
  if (map.imuPlayerLoad < 0) missing.push("IMU Load Index / Player Load");
  // Duration absent in EVERY form — the single IMU Duration column AND all four Movement-Profile
  // intensity buckets. (The current export carries the buckets instead of a single duration, so we
  // do not warn as long as at least one duration signal is present.)
  if (map.imuDurationMin < 0 && map.settledMin < 0 && map.lowActiveMin < 0 && map.midActiveMin < 0 && map.highActiveMin < 0) {
    missing.push("IMU durations");
  }
  if (map.imuJumps < 0) missing.push("IMU Jumps");
  if (missing.length) {
    warnings.push(`This export is missing ${missing.join(" / ")} (only the available columns were imported). Re-export the \`_synced_data\` tab from Titan/Hudl with the full column set for complete data.`);
  }
  return warnings;
}

/** True when a row carries at least one usable IMU signal (so blank-but-named rows are droppable). */
export function titanRowHasSignal(r: TitanRow): boolean {
  return r.imuPlayerLoad != null || r.imuJumps != null || r.impacts != null || r.imuDurationMin != null
    || r.settledMin != null || r.lowActiveMin != null || r.midActiveMin != null || r.highActiveMin != null;
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
