/**
 * src/lib/integrations/physical-assessment/parser.ts
 *
 * Parser for the Physical Assessment Battery CSV — the periodic strength +
 * physical test exported by Háskólinn í Reykjavík (or any tester) for the
 * afrekshópur.
 *
 * Expected shape: a WIDE CSV — one row per player, columns are the player
 * name, an optional test date, then one column per measured metric. Headers
 * are auto-mapped against the metric catalog; anything unmatched is offered
 * for manual mapping in the upload wizard.
 *
 * Design mirrors the VALD CSV parser: tolerant delimiter detection,
 * header-row detection, token-set aliases with exclude tokens, and support
 * for coach-supplied column overrides.
 */

import {
  ASSESSMENT_METRIC_CATALOG,
  getMetricDef,
  type AssessmentMetricCategory,
} from "./metricCatalog";

/** A mapped column key: a metric code, an identity field, or ignore. */
export type AssessmentFieldKey =
  | "profileName"
  | "assessmentDate"
  | "__ignore__"
  | string; // metric code

/** Identity (non-metric) column aliases. */
const IDENTITY_CATALOG: { key: "profileName" | "assessmentDate"; aliases: string[][]; exclude?: string[] }[] = [
  {
    key: "profileName",
    aliases: [["name"], ["full", "name"], ["player"], ["athlete"], ["profile"], ["nafn"]],
    exclude: ["date", "team"],
  },
  {
    key: "assessmentDate",
    aliases: [["date"], ["test", "date"], ["assessment", "date"], ["tested"], ["dagsetning"]],
    exclude: ["birth", "dob"],
  },
];

export type AssessmentMetricCell = {
  code: string;
  category: AssessmentMetricCategory;
  value: number;
  unit: string;
  rawLabel: string;
};

export type PhysAssessmentRow = {
  raw: Record<string, string>;
  profileName: string | null;
  assessmentDate: string | null; // ISO YYYY-MM-DD
  metrics: AssessmentMetricCell[];
};

export type PhysAssessmentParseResult = {
  delimiter: "," | ";" | "\t";
  headerCells: string[];
  /** Auto-mapped (or override-mapped) columns. */
  matched: Array<{ index: number; header: string; key: AssessmentFieldKey }>;
  /** Columns that did not map — offered for manual mapping in the UI. */
  unmatched: Array<{ index: number; header: string }>;
  rows: PhysAssessmentRow[];
};

// ── CSV primitives ───────────────────────────────────────────────────────────

function stripBOM(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function detectDelimiter(text: string): "," | ";" | "\t" {
  const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
  const counts: Record<string, number> = {
    ",": (sample.match(/,/g) || []).length,
    ";": (sample.match(/;/g) || []).length,
    "\t": (sample.match(/\t/g) || []).length,
  };
  let best: "," | ";" | "\t" = ",";
  let bestN = -1;
  for (const d of [",", ";", "\t"] as const) {
    if (counts[d] > bestN) { bestN = counts[d]; best = d; }
  }
  return best;
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === delim && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Find the row that looks like a header — the line whose cells map to the
 *  most known fields. The HÍR export may carry a title row above the table. */
function findHeaderLine(lines: string[], delim: string): { index: number; cells: string[] } {
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cells = splitCsvLine(lines[i], delim);
    if (cells.length < 2) continue;
    let score = 0;
    for (const cell of cells) {
      if (matchHeader(cell) != null) score++;
    }
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  return { index: bestIdx, cells: splitCsvLine(lines[bestIdx], delim) };
}

// ── Header matching ──────────────────────────────────────────────────────────

/** Normalise a header: lowercase, strip bracket units, collapse distance
 *  tokens ("10 m" / "10 metre" → "10m"), keep alphanumerics + spaces. */
function normaliseHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")          // strip [s], [cm]
    .replace(/\([^)]*\)/g, " ")           // strip (s), (cm), (N)
    .replace(/[^a-z0-9 ]/g, " ")          // punctuation → space
    .replace(/(\d+)\s*(?:metres?|meters?|m)\b/g, "$1m") // "10 m" → "10m"
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns the field key a raw header maps to, or null. Identity fields are
 *  matched first; then the metric catalog. Most-specific alias wins. */
export function matchHeader(rawHeader: string): AssessmentFieldKey | null {
  const norm = normaliseHeader(rawHeader);
  if (!norm) return null;
  const tokenSet = new Set(norm.split(" ").filter(Boolean));

  // Identity columns take priority — a "Name" column is never a metric.
  for (const def of IDENTITY_CATALOG) {
    if (def.exclude?.some((t) => tokenSet.has(t))) continue;
    for (const alias of def.aliases) {
      if (alias.every((t) => tokenSet.has(t))) return def.key;
    }
  }

  // Metric catalog — most-specific (most-token) matching alias wins.
  let best: { code: string; tokens: number } | null = null;
  for (const def of ASSESSMENT_METRIC_CATALOG) {
    if (def.exclude?.some((t) => tokenSet.has(t))) continue;
    for (const alias of def.aliases) {
      if (alias.every((t) => tokenSet.has(t)) && (!best || alias.length > best.tokens)) {
        best = { code: def.code, tokens: alias.length };
      }
    }
  }
  return best?.code ?? null;
}

// ── Value coercion ───────────────────────────────────────────────────────────

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.,\-]/g, "").replace(",", ".");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Dates: "YYYY-MM-DD", "DD/MM/YYYY", "DD.MM.YYYY" (Icelandic), ISO stamps. */
export function normaliseDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const m = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const [, a, b] = m;
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    // Icelandic / European locale: day-first.
    const dayFirst = parseInt(a, 10) > 12 || parseInt(b, 10) <= 12;
    const dd = dayFirst ? a : b;
    const mm = dayFirst ? b : a;
    return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const ts = Date.parse(trimmed);
  return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : null;
}

// ── Main parse ───────────────────────────────────────────────────────────────

export function parsePhysicalAssessmentCsv(
  csvText: string,
  opts?: { overrides?: Map<string, AssessmentFieldKey> },
): PhysAssessmentParseResult {
  const cleaned = stripBOM(csvText).replace(/\r\n?/g, "\n");
  const delimiter = detectDelimiter(cleaned);
  const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { delimiter, headerCells: [], matched: [], unmatched: [], rows: [] };
  }

  const { index: headerIndex, cells: headerCells } = findHeaderLine(lines, delimiter);

  // Build column → field key map.
  const colKey = new Map<number, AssessmentFieldKey>();
  const matched: PhysAssessmentParseResult["matched"] = [];
  const unmatched: PhysAssessmentParseResult["unmatched"] = [];
  for (let i = 0; i < headerCells.length; i++) {
    const header = headerCells[i];
    if (!header) continue;
    const override = opts?.overrides?.get(header);
    const key = override ?? matchHeader(header);
    if (key && key !== "__ignore__") {
      colKey.set(i, key);
      matched.push({ index: i, header, key });
    } else if (key === "__ignore__") {
      // explicitly ignored by the coach — neither matched nor unmatched
    } else {
      unmatched.push({ index: i, header });
    }
  }

  // Parse data rows.
  const rows: PhysAssessmentRow[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    if (!cells.some((c) => c.length > 0)) continue;

    const raw: Record<string, string> = {};
    let profileName: string | null = null;
    let assessmentDate: string | null = null;
    const metrics: AssessmentMetricCell[] = [];

    for (let j = 0; j < cells.length; j++) {
      const value = cells[j] ?? "";
      const header = headerCells[j];
      if (header) raw[header] = value;
      const key = colKey.get(j);
      if (!key || !value) continue;

      if (key === "profileName") {
        if (!profileName) profileName = value.trim() || null;
      } else if (key === "assessmentDate") {
        if (!assessmentDate) assessmentDate = normaliseDate(value);
      } else {
        const def = getMetricDef(key);
        const num = toNumber(value);
        if (def && num != null) {
          metrics.push({
            code: def.code,
            category: def.category,
            value: num,
            unit: def.unit,
            rawLabel: header ?? def.code,
          });
        }
      }
    }

    if (Object.keys(raw).length === 0) continue;
    // Skip pure-empty rows (no name and no metrics).
    if (!profileName && metrics.length === 0) continue;

    rows.push({ raw, profileName, assessmentDate, metrics });
  }

  return { delimiter, headerCells, matched, unmatched, rows };
}
