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
  | "direction"         // ForceFrame (Pull / Squeeze / Push ...)
  | "position"          // ForceFrame (test position / angle)
  | "leftMaxRfd"        // ForceFrame
  | "rightMaxRfd"       // ForceFrame
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
  /** Each alias is a set of tokens that must ALL appear in the normalised
   *  header. Multiple aliases = OR. */
  aliases: string[][];
  /** If ANY of these tokens appears in the header, the field is disqualified
   *  — even if an alias matched. This is what stops the broad "force l"
   *  pattern from grabbing "L Max Force Per Kg" or "L Time to Peak Force". */
  exclude?: string[];
  /** Which products this field is relevant for. Omitted = both. NordBord has
   *  no relative-force column; ForceFrame has no avg-force column — gating
   *  here keeps the column-mapping summary honest per product. */
  products?: ValdCsvProduct[];
};

/**
 * Header catalog. VALD "Test Metrics" CSV headers carry display names with
 * units (e.g. "L Max Force (N)", "L Max Force Per Kg (N/kg)"). normaliseHeader
 * lowercases and strips bracket units, keeping the "(L)"/"(R)" side token.
 *
 * Real NordBord headers (verified from a Breiðablik export, 20 May 2026):
 *   Name · Date UTC · Test · L/R Max Force (N) · L/R Avg Force (N) ·
 *   Max/Avg/Impulse Imbalance (%) · L/R Min/Avg Time to Peak Force (s) ·
 *   L/R Max/Avg Force Per Kg (N/kg) · L/R Max/Avg Impulse 100-250ms (N·s) ·
 *   L/R Max/Avg Torque Per Kg (Nm/kg) · Notes
 *
 * The exclude lists keep us pinned to the four force columns + Max Imbalance
 * and ignore the per-kg / time / impulse / torque derivatives.
 */
const FORCE_DERIVATIVE_EXCLUDE = ["per", "kg", "time", "impulse", "torque", "rate", "rfd", "rsi"];

const FIELD_CATALOG: FieldDef[] = [
  { key: "profileName", aliases: [["profile"], ["athlete"], ["player"], ["name"]] },
  { key: "testDate", aliases: [["date"]], exclude: ["birth", "dob"] },
  { key: "testType", aliases: [["test"]], exclude: ["date"] },
  { key: "bodyRegion", aliases: [["body", "region"], ["region"]], products: ["forceframe"] },
  { key: "movementPattern", aliases: [["movement"], ["pattern"]], products: ["forceframe"] },
  // Detailed ForceFrame export: "Direction" (Pull/Squeeze/Push) + "Position"
  // (e.g. "Hip AD/AB - 60"). Together with the test name these identify the
  // movement, so two rows of the same test (abduction vs adduction) stay distinct.
  { key: "direction", aliases: [["direction"]], products: ["forceframe"] },
  { key: "position", aliases: [["position"]], products: ["forceframe"], exclude: ["date"] },
  // Peak / max force — left. Matches "L Max Force (N)" / "L Peak Force (N)".
  {
    key: "leftPeakForce",
    aliases: [["max", "force", "l"], ["peak", "force", "l"]],
    exclude: [...FORCE_DERIVATIVE_EXCLUDE, "avg", "min", "mean", "relative"],
  },
  {
    key: "rightPeakForce",
    aliases: [["max", "force", "r"], ["peak", "force", "r"]],
    exclude: [...FORCE_DERIVATIVE_EXCLUDE, "avg", "min", "mean", "relative"],
  },
  // Average force — left. Matches "L Avg Force (N)" (NordBord + detailed ForceFrame).
  {
    key: "leftAvgForce",
    aliases: [["avg", "force", "l"], ["average", "force", "l"], ["mean", "force", "l"]],
    exclude: [...FORCE_DERIVATIVE_EXCLUDE, "max", "min", "peak", "relative"],
  },
  {
    key: "rightAvgForce",
    aliases: [["avg", "force", "r"], ["average", "force", "r"], ["mean", "force", "r"]],
    exclude: [...FORCE_DERIVATIVE_EXCLUDE, "max", "min", "peak", "relative"],
  },
  // Max rate of force development — headline only ("L Max RFD (N/s)"), excluding
  // the time-banded 50/100/150/200/250 ms derivatives and the avg-RFD columns.
  {
    key: "leftMaxRfd",
    aliases: [["max", "rfd", "l"]],
    exclude: ["avg", "average", "mean", "impulse", "50ms", "100ms", "150ms", "200ms", "250ms"],
    products: ["forceframe"],
  },
  {
    key: "rightMaxRfd",
    aliases: [["max", "rfd", "r"]],
    exclude: ["avg", "average", "mean", "impulse", "50ms", "100ms", "150ms", "200ms", "250ms"],
    products: ["forceframe"],
  },
  // Relative / per-bodyweight force — left (ForceFrame). Here per-kg is wanted.
  {
    key: "leftRelativeForce",
    aliases: [["relative", "force", "l"], ["rel", "force", "l"], ["force", "per", "kg", "l"]],
    exclude: ["time", "impulse", "torque", "avg", "mean", "min", "imbalance"],
    products: ["forceframe"],
  },
  {
    key: "rightRelativeForce",
    aliases: [["relative", "force", "r"], ["rel", "force", "r"], ["force", "per", "kg", "r"]],
    exclude: ["time", "impulse", "torque", "avg", "mean", "min", "imbalance"],
    products: ["forceframe"],
  },
  // Asymmetry — only the headline "Max Imbalance (%)" / "Asymmetry" column,
  // not the Avg / Impulse imbalance derivatives.
  {
    key: "asymmetryPercent",
    aliases: [["max", "imbalance"], ["asymmetry"], ["lsi"]],
    exclude: ["side", "time", "torque"],
  },
  {
    key: "asymmetrySide",
    aliases: [["imbalance", "side"], ["asymmetry", "side"], ["weaker", "side"], ["dominant", "side"]],
  },
];

export type ValdCsvRow = {
  raw: Record<string, string>;
  profileName: string | null;
  testDate: string | null;       // ISO YYYY-MM-DD
  testType: string | null;
  bodyRegion: string | null;
  movementPattern: string | null;
  direction: string | null;
  position: string | null;
  leftPeakForce: number | null;
  rightPeakForce: number | null;
  leftAvgForce: number | null;
  rightAvgForce: number | null;
  leftRelativeForce: number | null;
  rightRelativeForce: number | null;
  leftMaxRfd: number | null;
  rightMaxRfd: number | null;
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

/** Returns the field key a raw header maps to, or null.
 *  A field matches when one of its aliases is fully present AND none of its
 *  exclude tokens appear. When several fields match, the one whose matching
 *  alias has the most tokens (most specific) wins. When `product` is given,
 *  fields not relevant to that product are skipped — so a NordBord CSV won't
 *  surface ForceFrame-only relative-force columns and vice versa. */
export function matchHeader(rawHeader: string, product?: ValdCsvProduct): ValdCsvFieldKey | null {
  const norm = normaliseHeader(rawHeader);
  if (!norm) return null;
  const headerTokens = norm.split(" ").filter(Boolean);
  const tokenSet = new Set(headerTokens);

  let best: { key: ValdCsvFieldKey; tokens: number } | null = null;
  for (const def of FIELD_CATALOG) {
    if (product && def.products && !def.products.includes(product)) continue;
    if (def.exclude?.some((t) => tokenSet.has(t))) continue;
    for (const alias of def.aliases) {
      const matched = alias.every((t) => tokenSet.has(t));
      if (matched && (!best || alias.length > best.tokens)) {
        best = { key: def.key, tokens: alias.length };
      }
    }
  }
  return best?.key ?? null;
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
  // ForceFrame is distinguished by relative/per-kg force, body-region, a
  // Direction/Position/Ratio column, or a joint-movement code (AD/AB, IR/ER,
  // IN/EV) — the detailed export uses "Direction" + "Position" + "Force Per kg".
  if (/relative force|body region|direction|position|ratio|hip add|hip abd|groin|adduct|abduct|ad\/ab|ir\/er|in\/ev/.test(joined)) {
    return "forceframe";
  }
  // NordBord is distinguished by "nordic" or a plain avg/mean force column.
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
    const key = override ?? matchHeader(header, product);
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
      direction: byField.direction?.trim() || null,
      position: byField.position?.trim() || null,
      leftPeakForce: toNumber(byField.leftPeakForce),
      rightPeakForce: toNumber(byField.rightPeakForce),
      leftAvgForce: toNumber(byField.leftAvgForce),
      rightAvgForce: toNumber(byField.rightAvgForce),
      leftRelativeForce: toNumber(byField.leftRelativeForce),
      rightRelativeForce: toNumber(byField.rightRelativeForce),
      leftMaxRfd: toNumber(byField.leftMaxRfd),
      rightMaxRfd: toNumber(byField.rightMaxRfd),
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
