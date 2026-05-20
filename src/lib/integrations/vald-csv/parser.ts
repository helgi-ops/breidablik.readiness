/**
 * src/lib/integrations/vald-csv/parser.ts
 *
 * Parser for VALD Hub "Test Metrics" CSV exports — specifically NordBord
 * (Nordic hamstring) and ForceFrame (isometric strength frame).
 *
 * Why a CSV path exists: VALD's external/partner API exposes ForceDecks for
 * this tenant but not NordBord or ForceFrame (different subdomains /
 * permissions). The API sync covers ForceDecks; this CSV upload covers the
 * other two so the data still lands in vald_nordbord_results /
 * vald_forceframe_results and flows into the VALD/CMJ dashboards.
 *
 * Design mirrors the Catapult CSV parser: tolerant delimiter detection,
 * header-row detection, and an alias-based column catalog so the upload
 * wizard can auto-map most columns and let the coach manually map the rest.
 */

export type ValdCsvProduct = "nordbord" | "forceframe";

/** Normalised column keys the parser maps raw CSV headers onto. */
export type ValdCsvFieldKey =
  | "profileName"
  | "testDate"
  | "testType"
  | "bodyRegion"        // ForceFrame
  | "movementPattern"   // ForceFrame
  | "leftPeakForce"     // → left_peak_force_n
  | "rightPeakForce"    // → right_peak_force_n
  | "leftAvgForce"      // → left_avg_force_n  (NordBord)
  | "rightAvgForce"     // → right_avg_force_n (NordBord)
  | "leftRelativeForce" // → left_relative_force  (ForceFrame)
  | "rightRelativeForce"// → right_relative_force (ForceFrame)
  | "asymmetryPercent"
  | "asymmetrySide";

type FieldDef = {
  key: ValdCsvFieldKey;
  /** Lower-cased header substrings/aliases. First non-empty match wins. */
  aliases: string[];
};

/**
 * Header aliases. VALD CSV headers carry display names with units in
 * brackets (e.g. "Max Force (L) [N]"). We match case-insensitively on
 * normalised headers (lowercased, brackets/units stripped). A header is
 * matched if it CONTAINS one of the aliases — so "l max force [n]" matches
 * the alias "max force l" via token comparison handled in matchHeader().
 */
const FIELD_CATALOG: FieldDef[] = [
  { key: "profileName", aliases: ["profile", "athlete", "player", "name", "full name"] },
  { key: "testDate", aliases: ["date", "test date", "date utc", "recorded", "timestamp"] },
  { key: "testType", aliases: ["test type", "test", "protocol", "exercise", "metric"] },
  { key: "bodyRegion", aliases: ["body region", "region"] },
  { key: "movementPattern", aliases: ["movement", "pattern", "movement pattern", "direction"] },
  // Peak / max force — left
  { key: "leftPeakForce", aliases: [
    "left peak force", "l peak force", "peak force l", "left max force", "l max force",
    "max force l", "force l", "left force", "newtons l",
  ] },
  // Peak / max force — right
  { key: "rightPeakForce", aliases: [
    "right peak force", "r peak force", "peak force r", "right max force", "r max force",
    "max force r", "force r", "right force", "newtons r",
  ] },
  // Average force — left (NordBord)
  { key: "leftAvgForce", aliases: [
    "left avg force", "l avg force", "avg force l", "left average force", "average force l",
    "mean force l", "l mean force",
  ] },
  // Average force — right (NordBord)
  { key: "rightAvgForce", aliases: [
    "right avg force", "r avg force", "avg force r", "right average force", "average force r",
    "mean force r", "r mean force",
  ] },
  // Relative force — left (ForceFrame)
  { key: "leftRelativeForce", aliases: [
    "left relative force", "l relative force", "relative force l", "left rel force",
    "rel force l", "force/bw l", "l force/bw",
  ] },
  // Relative force — right (ForceFrame)
  { key: "rightRelativeForce", aliases: [
    "right relative force", "r relative force", "relative force r", "right rel force",
    "rel force r", "force/bw r", "r force/bw",
  ] },
  { key: "asymmetryPercent", aliases: [
    "asymmetry", "imbalance", "max imbalance", "asymmetry index", "l/r imbalance", "lsi",
  ] },
  { key: "asymmetrySide", aliases: [
    "asymmetry side", "imbalance side", "weaker side", "dominant side", "side",
  ] },
];

export type ValdCsvRow = {
  raw: Record<string, string>;
  profileName: string | null;
  testDate: string | null;       // ISO YYYY-MM-DD
  testType: string | null;
  bodyRegion: string | null;
  movementPattern: string | null;
  leftPeakForce: number | null;
  rightPeakForce: number | null;
  leftAvgForce: number | null;
  rightAvgForce: number | null;
  leftRelativeForce: number | null;
  rightRelativeForce: number | null;
  asymmetryPercent: number | null;
  asymmetrySide: string | null;
};

export type ValdCsvParseResult = {
  product: ValdCsvProduct;
  delimiter: "," | ";" | "\t";
  headerCells: string[];
  /** column index → field key (auto-detected) */
  matched: Map<number, ValdCsvFieldKey>;
  /** column index → raw header (unmatched, for manual mapping in the UI) */
  unmatched: Map<number, string>;
  rows: ValdCsvRow[];
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

/** Find the row that looks like a header — the line with the most cells that
 *  match a known field alias. VALD exports sometimes have a title row above. */
function findHeaderLine(lines: string[], delim: string): { index: number; cells: string[] } {
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cells = splitCsvLine(lines[i], delim);
    if (cells.length < 3) continue;
    let score = 0;
    for (const cell of cells) {
      if (matchHeader(cell) != null) score++;
    }
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }
  return { index: bestIdx, cells: splitCsvLine(lines[bestIdx], delim) };
}

// ── Header matching ──────────────────────────────────────────────────────────

/** Normalise a header: lowercase, strip units in brackets, collapse spaces. */
function normaliseHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")   // strip [N], [%], [kg]
    .replace(/\([^)]*\)/g, (m) => ` ${m.replace(/[()]/g, "")} `) // keep (L)/(R) content
    .replace(/[^a-z0-9/ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns the field key a raw header maps to, or null. */
export function matchHeader(rawHeader: string): ValdCsvFieldKey | null {
  const norm = normaliseHeader(rawHeader);
  if (!norm) return null;
  // Try most-specific aliases first (longer alias = more specific).
  let best: { key: ValdCsvFieldKey; len: number } | null = null;
  for (const def of FIELD_CATALOG) {
    for (const alias of def.aliases) {
      if (headerContainsAlias(norm, alias) && (!best || alias.length > best.len)) {
        best = { key: def.key, len: alias.length };
      }
    }
  }
  return best?.key ?? null;
}

/** True if the normalised header contains all tokens of the alias, where a
 *  bare "l"/"r" token also matches "(l)"/"(r)" style side markers. */
function headerContainsAlias(normHeader: string, alias: string): boolean {
  const tokens = alias.split(" ").filter(Boolean);
  const headerTokens = normHeader.split(" ").filter(Boolean);
  return tokens.every((t) => headerTokens.includes(t));
}

// ── Value coercion ───────────────────────────────────────────────────────────

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.,\-]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** VALD dates: "DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY", ISO timestamps. */
export function normaliseDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const slash = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (slash) {
    const [, a, b] = slash;
    const y = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    // VALD Hub UK locale defaults to DD/MM/YYYY.
    const dayFirst = parseInt(a, 10) > 12 || parseInt(b, 10) <= 12;
    const dd = dayFirst ? a : b;
    const mm = dayFirst ? b : a;
    return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const ts = Date.parse(trimmed);
  return Number.isFinite(ts) ? new Date(ts).toISOString().slice(0, 10) : null;
}

// ── Product detection ────────────────────────────────────────────────────────

/** Best-effort guess of which VALD product a CSV is for, from its headers. */
export function detectProduct(headerCells: string[]): ValdCsvProduct {
  const joined = headerCells.map((h) => h.toLowerCase()).join(" | ");
  // ForceFrame is distinguished by relative-force / body-region / hip patterns.
  if (/relative force|body region|hip add|hip abd|groin|adduct|abduct/.test(joined)) {
    return "forceframe";
  }
  // NordBord is distinguished by avg/mean force or "nordic".
  if (/nordic|avg force|average force|mean force/.test(joined)) {
    return "nordbord";
  }
  // Default to nordbord (the more common upload).
  return "nordbord";
}

// ── Main parse ───────────────────────────────────────────────────────────────

export function parseValdCsv(
  csvText: string,
  opts?: { product?: ValdCsvProduct; overrides?: Map<string, ValdCsvFieldKey> },
): ValdCsvParseResult {
  const cleaned = stripBOM(csvText).replace(/\r\n?/g, "\n");
  const delimiter = detectDelimiter(cleaned);
  const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return {
      product: opts?.product ?? "nordbord",
      delimiter,
      headerCells: [],
      matched: new Map(),
      unmatched: new Map(),
      rows: [],
    };
  }

  const { index: headerIndex, cells: headerCells } = findHeaderLine(lines, delimiter);
  const product = opts?.product ?? detectProduct(headerCells);

  // Build column → field map.
  const matched = new Map<number, ValdCsvFieldKey>();
  const unmatched = new Map<number, string>();
  for (let i = 0; i < headerCells.length; i++) {
    const header = headerCells[i];
    const override = opts?.overrides?.get(header);
    const key = override ?? matchHeader(header);
    if (key) matched.set(i, key);
    else if (header) unmatched.set(i, header);
  }

  // Parse data rows.
  const rows: ValdCsvRow[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    if (!cells.some((c) => c.length > 0)) continue;

    const raw: Record<string, string> = {};
    const byField: Partial<Record<ValdCsvFieldKey, string>> = {};
    for (let j = 0; j < cells.length; j++) {
      const value = cells[j] ?? "";
      const header = headerCells[j];
      if (header) raw[header] = value;
      const key = matched.get(j);
      if (key && value && byField[key] == null) byField[key] = value;
    }
    if (Object.keys(raw).length === 0) continue;

    rows.push({
      raw,
      profileName: byField.profileName?.trim() || null,
      testDate: normaliseDate(byField.testDate),
      testType: byField.testType?.trim() || null,
      bodyRegion: byField.bodyRegion?.trim() || null,
      movementPattern: byField.movementPattern?.trim() || null,
      leftPeakForce: toNumber(byField.leftPeakForce),
      rightPeakForce: toNumber(byField.rightPeakForce),
      leftAvgForce: toNumber(byField.leftAvgForce),
      rightAvgForce: toNumber(byField.rightAvgForce),
      leftRelativeForce: toNumber(byField.leftRelativeForce),
      rightRelativeForce: toNumber(byField.rightRelativeForce),
      asymmetryPercent: toNumber(byField.asymmetryPercent),
      asymmetrySide: normaliseSide(byField.asymmetrySide),
    });
  }

  return { product, delimiter, headerCells, matched, unmatched, rows };
}

function normaliseSide(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v.startsWith("l")) return "left";
  if (v.startsWith("r")) return "right";
  return null;
}
