/**
 * Catapult OpenField "Peak Period" / rolling / interval export → long-format rows for
 * `player_load_peak_period`. Pure, no I/O.
 *
 * The peak-period export lists, per athlete (and usually per activity/date), the WORST
 * rolling window of each metric at several window lengths — the raw material of the power
 * curve (peakPeriod.ts). OpenField column names vary by template, so this parser
 * PATTERN-DETECTS the peak columns rather than hard-coding positions: any header that
 * carries a recognised metric phrase AND a window token (1:00 / "5 min" / "30 s") becomes
 * a (windowMin, metric, value) datum. This makes it resilient to the exact export layout
 * a club uses — the thing that bit us before was assuming a fixed column shape.
 *
 * ⚠️ Pending verification against a REAL OpenField peak-period export — the detection is
 * built from the documented column conventions; a club's first real file may need a small
 * synonym added to METRIC_SYNONYMS. It is deliberately generous (skips what it can't read,
 * warns) rather than guessing.
 */

export type PeakPeriodParsedRow = {
  /** Athlete name / id exactly as the export writes it (matched to a player downstream). */
  athlete: string;
  /** ISO date if a date/activity column is present, else null. */
  date: string | null;
  /** Rolling window length in minutes (1, 3, 5, 0.5 …). */
  windowMin: number;
  /** Canonical metric key: player_load | hsr | metabolic_power | accel_density | speed | distance. */
  metric: string;
  /** The peak value for that window+metric. */
  value: number | null;
  /** Unit label if inferable from the header, else null. */
  unit: string | null;
};

export type PeakPeriodParse = {
  rows: PeakPeriodParsedRow[];
  athletes: string[];
  windows: number[];
  metrics: string[];
  /** How many peak columns were recognised in the header. */
  detectedColumns: number;
  warnings: string[];
};

/** Metric phrase (lowercased, in the header) → canonical key. First hit wins, longest first. */
const METRIC_SYNONYMS: Array<[RegExp, string]> = [
  [/metabolic\s*power|met\s*power|\bmp\b/, "metabolic_power"],
  [/player\s*load|\bpl\b/, "player_load"],
  [/high\s*speed(\s*running)?|hsr|hi\s*speed/, "hsr"],
  [/accel(eration)?\s*(density|load)?/, "accel_density"],
  [/velocity|speed/, "speed"],
  [/distance/, "distance"],
];

const canonicalMetric = (headerLc: string): string | null => {
  for (const [re, key] of METRIC_SYNONYMS) if (re.test(headerLc)) return key;
  return null;
};

/**
 * Parse a window token found in a header into MINUTES. Handles "1:00" / "0:30" (mm:ss),
 * "5 min" / "5min" / "5m", "30 s" / "30sec" / "30s", and bare numbers with a min/sec hint
 * elsewhere in the header. Returns null when no window is present.
 */
export function parseWindowMinutes(headerLc: string): number | null {
  // mm:ss
  const clock = headerLc.match(/(\d{1,2}):(\d{2})/);
  if (clock) {
    const m = Number(clock[1]), s = Number(clock[2]);
    if (Number.isFinite(m) && Number.isFinite(s)) return Math.round((m + s / 60) * 100) / 100;
  }
  // N min / N m  (avoid matching the 'm' in 'metabolic')
  const min = headerLc.match(/(\d+(?:\.\d+)?)\s*(?:min(?:ute)?s?|(?<![a-z])m(?![a-z]))\b/);
  if (min) return Math.round(Number(min[1]) * 100) / 100;
  // N s / N sec
  const sec = headerLc.match(/(\d+(?:\.\d+)?)\s*(?:sec(?:ond)?s?|s)\b/);
  if (sec) return Math.round((Number(sec[1]) / 60) * 100) / 100;
  return null;
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};

/** Detect a unit inside a header, e.g. "(W/kg)", "[m]", "AU". */
function unitOf(header: string): string | null {
  const paren = header.match(/[([]([^)\]]+)[)\]]\s*$/);
  if (paren) {
    const u = paren[1].trim();
    // Skip the window token if it landed in the parens (e.g. "(1:00)").
    if (!/^\d{1,2}:\d{2}$/.test(u) && !/^\d+\s*(min|sec|s|m)\b/i.test(u)) return u;
  }
  if (/w\/kg/i.test(header)) return "W/kg";
  if (/\bau\b/i.test(header)) return "AU";
  return null;
}

/** Find the first column whose header matches any of the given keyword regexes. */
function findCol(header: string[], res: RegExp[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = header[i].toLowerCase();
    if (res.some((re) => re.test(h))) return i;
  }
  return -1;
}

/** Best-effort ISO date from a cell (dd/mm/yyyy, yyyy-mm-dd, etc.). Null if unparseable. */
function toIsoDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/); // dd/mm/yyyy (OpenField default)
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/**
 * Parse an OpenField peak-period export (a header row + data rows) into long-format
 * (athlete, date, window, metric, value) rows. Robust to column order and naming.
 */
export function parseCatapultPeakPeriod(matrix: string[][]): PeakPeriodParse {
  const warnings: string[] = [];
  const clean = (matrix ?? []).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
  if (clean.length < 2) {
    return { rows: [], athletes: [], windows: [], metrics: [], detectedColumns: 0, warnings: ["Empty or header-only export."] };
  }
  const header = clean[0].map((h) => String(h ?? "").trim());
  const body = clean.slice(1);

  const athleteCol = findCol(header, [/athlete|player|name/]);
  const dateCol = findCol(header, [/date|activity|session|period\s*start/]);
  if (athleteCol < 0) warnings.push("No athlete/name column detected — rows can't be attributed.");

  // Detect the peak columns: header carries BOTH a metric phrase AND a window token.
  const peakCols: Array<{ idx: number; windowMin: number; metric: string; unit: string | null }> = [];
  header.forEach((h, i) => {
    if (i === athleteCol || i === dateCol) return;
    const hl = h.toLowerCase();
    const windowMin = parseWindowMinutes(hl);
    const metric = canonicalMetric(hl);
    if (windowMin != null && metric) peakCols.push({ idx: i, windowMin, metric, unit: unitOf(h) });
  });
  if (peakCols.length === 0) {
    warnings.push("No peak-period columns recognised (need a metric + a window token like '1:00' or '5 min').");
    return { rows: [], athletes: [], windows: [], metrics: [], detectedColumns: 0, warnings };
  }

  const rows: PeakPeriodParsedRow[] = [];
  const athletes = new Set<string>();
  for (const r of body) {
    const athlete = athleteCol >= 0 ? String(r[athleteCol] ?? "").trim() : "";
    if (!athlete) continue;
    athletes.add(athlete);
    const date = dateCol >= 0 ? toIsoDate(r[dateCol]) : null;
    for (const pc of peakCols) {
      const value = num(r[pc.idx]);
      if (value == null) continue;
      rows.push({ athlete, date, windowMin: pc.windowMin, metric: pc.metric, value, unit: pc.unit });
    }
  }

  return {
    rows,
    athletes: [...athletes].sort(),
    windows: [...new Set(peakCols.map((p) => p.windowMin))].sort((a, b) => a - b),
    metrics: [...new Set(peakCols.map((p) => p.metric))].sort(),
    detectedColumns: peakCols.length,
    warnings,
  };
}
