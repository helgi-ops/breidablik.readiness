/**
 * WIMU CSV parser.
 *
 * Reads a SPRO "Export raw data" CSV (or any compatible delimited file)
 * and produces an array of WimuRawRow records keyed by the auto-detected
 * canonical metric names (see metricCatalog.ts). Detection is fuzzy:
 * column header "Total Distance (m)" and "Distancia Total" both resolve
 * to the totalDistance metric.
 *
 * Format quirks handled:
 *   - delimiter: comma OR semicolon (Spanish locale defaults to ;)
 *   - decimal separator: '.' OR ',' (Spanish locale uses ,)
 *   - quoted strings with embedded delimiters
 *   - leading BOM (Excel saves UTF-8 BOM by default)
 *   - empty trailing rows
 *
 * The parser does NOT type-coerce values — that happens in normalize.ts.
 * It just splits the file into rows and exposes raw cell strings keyed by
 * canonical metric name (with unmatched columns preserved under their
 * original header so the mapper UI can present them for manual mapping).
 */

import {
  buildHeaderAliasIndex,
  matchHeader,
  normalizeColumnName,
  type WimuMetricKey,
} from "./metricCatalog";
import type { WimuRawRow } from "./types";

/**
 * Auto-detect the delimiter by sampling the first non-empty line.
 * Returns the character that appears most often, with ',' as tiebreaker.
 */
export function detectDelimiter(text: string): "," | ";" | "\t" {
  const sample = text.split(/\r?\n/).find((l) => l.trim().length) ?? "";
  const candidates: Array<"," | ";" | "\t"> = [",", ";", "\t"];
  let best: "," | ";" | "\t" = ",";
  let bestCount = -1;
  for (const c of candidates) {
    const count = sample.split(c).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

/**
 * Strip UTF-8 BOM if present.
 */
function stripBOM(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Lightweight CSV row splitter that respects double-quoted strings.
 * Sufficient for SPRO exports — they don't include nested quotes inside
 * cells. For pathological CSVs we'd reach for PapaParse instead.
 */
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // toggle quote — handle escaped "" inside a quoted field
      if (inQuotes && line[i + 1] === '"') {
        buf += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delim && !inQuotes) {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out.map((c) => c.trim());
}

/**
 * Locate the header row in the file. SPRO sometimes prepends a couple of
 * metadata lines (export date, club name, etc.) before the actual table.
 * We scan the first 10 lines and pick the one with the most cells that
 * look like recognized metric names — that's the header.
 */
export function findHeaderLine(
  lines: string[],
  delim: string,
): { headerLineIndex: number; headerCells: string[] } {
  const aliasIndex = buildHeaderAliasIndex();
  let bestIdx = 0;
  let bestScore = -1;
  let bestCells: string[] = [];
  const limit = Math.min(lines.length, 10);
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

/**
 * Build the column-index → metric-key map AND a parallel index → original
 * header name map. The mapper UI uses both: matched columns are auto-applied,
 * unmatched ones get presented for manual confirmation.
 */
export function mapHeaderColumns(headerCells: string[]): {
  matched: Map<number, WimuMetricKey>;
  unmatched: Map<number, string>;
} {
  const aliasIndex = buildHeaderAliasIndex();
  const matched = new Map<number, WimuMetricKey>();
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
 * Parse a SPRO CSV file into a list of raw rows. Each row's `raw` dict is
 * keyed by canonical metric key for matched columns, plus original header
 * name for unmatched columns (so they can be inspected in the mapper UI).
 *
 * @param csvText  The complete file content as a UTF-8 string
 * @param overrides Optional manual header → metric overrides, applied on
 *                  top of auto-detection (used after the coach confirms
 *                  the mapping in the UI).
 */
export function parseWimuCsv(
  csvText: string,
  overrides?: Map<string, WimuMetricKey>,
): {
  rows: WimuRawRow[];
  headerCells: string[];
  matched: Map<number, WimuMetricKey>;
  unmatched: Map<number, string>;
  delimiter: string;
} {
  const cleaned = stripBOM(csvText).replace(/\r\n?/g, "\n");
  const delimiter = detectDelimiter(cleaned);
  const lines = cleaned.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { rows: [], headerCells: [], matched: new Map(), unmatched: new Map(), delimiter };
  }

  const { headerLineIndex, headerCells } = findHeaderLine(lines, delimiter);
  const { matched, unmatched } = mapHeaderColumns(headerCells);

  // Apply UI overrides on top of auto-detection
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

  const rows: WimuRawRow[] = [];
  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    if (!cells.some((c) => c.trim().length)) continue;  // skip blank rows

    const raw: Record<string, string> = {};
    let athleteName: string | null = null;
    let date: string | null = null;
    let sessionName: string | null = null;

    for (let j = 0; j < cells.length; j++) {
      const value = (cells[j] ?? "").trim();
      if (!value) continue;
      const key = matched.get(j);
      if (key) {
        raw[key] = value;
        if (key === "athleteName") athleteName = value;
        else if (key === "date") date = value;
        else if (key === "sessionName") sessionName = value;
      } else {
        // preserve unmatched cells under original header name
        const header = headerCells[j];
        if (header) raw[`__unmatched:${header}`] = value;
      }
    }

    if (Object.keys(raw).length === 0) continue;
    rows.push({ raw, athleteName, date, sessionName });
  }

  return { rows, headerCells, matched, unmatched, delimiter };
}
