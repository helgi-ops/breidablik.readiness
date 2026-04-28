/**
 * Catapult OpenField CSV parser.
 *
 * Reads an Activity Report CSV (or Custom Parameter export) from OpenField
 * Cloud and emits normalized rows keyed by canonical metric names. Handles
 * the same file-format quirks as the WIMU parser:
 *   - delimiter: comma OR semicolon
 *   - decimal separator: '.' OR ','
 *   - UTF-8 BOM
 *   - prepended metadata lines before the actual header row
 *   - trailing blank rows
 *
 * Produces one row per (athlete, date, period) combination as it appears
 * in the CSV. Aggregation across periods (e.g. summing all drills into a
 * session-level row) happens in normalize.ts.
 */

import {
  buildHeaderAliasIndex,
  matchHeader,
  normalizeColumnName,
  type CatapultMetricKey,
} from "./catalog";

export type CatapultCsvRow = {
  /** Map keyed by canonical metric key for matched columns; "__unmatched:<header>" for unrecognised ones */
  raw: Record<string, string>;
  athleteName: string | null;
  athleteId: string | null;
  date: string | null;
  sessionName: string | null;
  periodName: string | null;
};

export type ParseResult = {
  rows: CatapultCsvRow[];
  headerCells: string[];
  matched: Map<number, CatapultMetricKey>;
  unmatched: Map<number, string>;
  delimiter: string;
};

function stripBOM(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function detectDelimiter(text: string): "," | ";" | "\t" {
  const sample = text.split(/\r?\n/).find((l) => l.trim().length) ?? "";
  const candidates: Array<"," | ";" | "\t"> = [",", ";", "\t"];
  let best: "," | ";" | "\t" = ",";
  let bestCount = -1;
  for (const c of candidates) {
    const count = sample.split(c).length - 1;
    if (count > bestCount) { bestCount = count; best = c; }
  }
  return best;
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { buf += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      out.push(buf); buf = "";
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out.map((c) => c.trim());
}

/**
 * Locate the header row. OpenField sometimes prepends a few metadata lines
 * (export date, organization name, applied filters). We pick the line in
 * the first 15 with the most cells that look like recognized metric names.
 */
export function findHeaderLine(
  lines: string[],
  delim: string,
): { headerLineIndex: number; headerCells: string[] } {
  const aliasIndex = buildHeaderAliasIndex();
  let bestIdx = 0;
  let bestScore = -1;
  let bestCells: string[] = [];
  const limit = Math.min(lines.length, 15);
  for (let i = 0; i < limit; i++) {
    const cells = splitCsvLine(lines[i], delim);
    if (cells.length < 2) continue;
    let score = 0;
    for (const c of cells) {
      if (aliasIndex.has(normalizeColumnName(c))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
      bestCells = cells;
    }
  }
  return { headerLineIndex: bestIdx, headerCells: bestCells };
}

export function mapHeaderColumns(headerCells: string[]): {
  matched: Map<number, CatapultMetricKey>;
  unmatched: Map<number, string>;
} {
  const aliasIndex = buildHeaderAliasIndex();
  const matched = new Map<number, CatapultMetricKey>();
  const unmatched = new Map<number, string>();
  for (let i = 0; i < headerCells.length; i++) {
    const raw = headerCells[i] ?? "";
    if (!raw.trim()) continue;
    const key = matchHeader(raw, aliasIndex);
    if (key) matched.set(i, key);
    else unmatched.set(i, raw);
  }
  return { matched, unmatched };
}

/**
 * Convert a date cell to ISO YYYY-MM-DD. Catapult exports use:
 *   - "2026-04-28" (ISO)
 *   - "28/04/2026" (UK)
 *   - "04/28/2026" (US)
 *   - "28-Apr-2026" (legacy)
 * If parsing fails returns the original value so the upstream caller can flag it.
 */
export function normalizeDateCell(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  // ISO already
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  // dd/mm/yyyy or mm/dd/yyyy — Catapult defaults to UK/EU dd/mm/yyyy
  const slash = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    let [, a, b, y] = slash;
    if (y.length === 2) y = `20${y}`;
    // Heuristic: if first part > 12, it must be the day (UK)
    const isDayFirst = parseInt(a, 10) > 12 || parseInt(b, 10) <= 12;
    const dd = isDayFirst ? a : b;
    const mm = isDayFirst ? b : a;
    return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // Fallback: let JS Date parse and re-emit ISO
  const ts = Date.parse(trimmed);
  if (Number.isFinite(ts)) {
    return new Date(ts).toISOString().slice(0, 10);
  }
  return null;
}

export function parseCatapultCsv(
  csvText: string,
  overrides?: Map<string, CatapultMetricKey>,
): ParseResult {
  const cleaned = stripBOM(csvText).replace(/\r\n?/g, "\n");
  const delimiter = detectDelimiter(cleaned);
  const lines = cleaned.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { rows: [], headerCells: [], matched: new Map(), unmatched: new Map(), delimiter };
  }

  const { headerLineIndex, headerCells } = findHeaderLine(lines, delimiter);
  const { matched, unmatched } = mapHeaderColumns(headerCells);

  // Apply UI overrides on top of auto-detection (coach manually mapped some columns)
  if (overrides && overrides.size > 0) {
    for (let i = 0; i < headerCells.length; i++) {
      const raw = headerCells[i];
      const override = overrides.get(raw);
      if (override) {
        matched.set(i, override);
        unmatched.delete(i);
      }
    }
  }

  const rows: CatapultCsvRow[] = [];
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    if (!cells.some((c) => c.trim().length)) continue;

    const raw: Record<string, string> = {};
    let athleteName: string | null = null;
    let athleteId:   string | null = null;
    let date:        string | null = null;
    let sessionName: string | null = null;
    let periodName:  string | null = null;

    for (let j = 0; j < cells.length; j++) {
      const value = (cells[j] ?? "").trim();
      if (!value) continue;
      const key = matched.get(j);
      if (key) {
        raw[key] = value;
        if      (key === "athleteName") athleteName = value;
        else if (key === "athleteId")   athleteId   = value;
        else if (key === "date")        date        = normalizeDateCell(value);
        else if (key === "sessionName") sessionName = value;
        else if (key === "periodName")  periodName  = value;
      } else {
        const header = headerCells[j];
        if (header) raw[`__unmatched:${header}`] = value;
      }
    }

    if (Object.keys(raw).length === 0) continue;
    rows.push({ raw, athleteName, athleteId, date, sessionName, periodName });
  }

  return { rows, headerCells, matched, unmatched, delimiter };
}
