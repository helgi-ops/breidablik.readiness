/**
 * Wyscout Team → Stats "Passing" and "Attacking" preset parsers — pure, no IO.
 *
 * Like the Indexes/Defending aux parsers, these are separate DISPLAY tabs the coach
 * exports (with "Show opponents" ON, one row per team per match). Unlike PPDA they
 * carry SEVERAL coach-relevant columns, so this reads MANY columns per row keyed by
 * (matchDate, own/opponent), plus a full `raw` record (nothing lost). Accuracy sits
 * either in a packed "163 / 113" cell OR in the trio's blank-header %-column two to
 * the right of the count — both are handled here exactly as the General parser does.
 *
 * Descriptive football context only — it never touches the readiness colour.
 */

import { normTeam, normHeader, num, toDateStr, inferOwnTeamName, pairAt, rawRowRecord } from "./wyscoutTeamStats";

/** One promoted column: DB column name = key. `match` is tested against normalised headers. */
export type ColSpec = { key: string; match: (h: string) => boolean; kind: "count" | "pct" };

export type MultiStatRow = {
  matchDate: string;
  isOpponent: boolean;
  values: Record<string, number | null>;
  raw: Record<string, unknown>;
};
export type MultiStatParse = {
  rows: MultiStatRow[];
  /** True when the header row was found AND at least one target column resolved. */
  matched: boolean;
  matchedKeys: string[];
  headerRow: string[];
  skipped: number;
};

// ── Column specs (key === team_match_stats column). match by normalised substring,
// never exact spelling, so locale/version differences don't break it. ────────────
export const PASSING_COLUMNS: ColSpec[] = [
  { key: "forward_passes", match: (h) => h.includes("forward pass"), kind: "count" },
  { key: "forward_pass_acc_pct", match: (h) => h.includes("forward pass"), kind: "pct" },
  { key: "passes_final_third", match: (h) => h.includes("final third"), kind: "count" },
  { key: "passes_final_third_acc_pct", match: (h) => h.includes("final third"), kind: "pct" },
  { key: "passes_penalty_area", match: (h) => h.includes("penalty area") && h.includes("pass"), kind: "count" },
  { key: "passes_penalty_area_acc_pct", match: (h) => h.includes("penalty area") && h.includes("pass"), kind: "pct" },
  { key: "progressive_passes", match: (h) => h.includes("progressive"), kind: "count" },
  { key: "smart_passes", match: (h) => h.includes("smart"), kind: "count" },
  { key: "smart_pass_acc_pct", match: (h) => h.includes("smart"), kind: "pct" },
];
export const ATTACKING_COLUMNS: ColSpec[] = [
  { key: "touches_in_box", match: (h) => (h.includes("touches in") && (h.includes("box") || h.includes("penalty area"))), kind: "count" },
  { key: "positional_attacks", match: (h) => h.includes("positional"), kind: "count" },
  { key: "counterattacks", match: (h) => h.includes("counter"), kind: "count" },
  // Crosses live in the Attacking preset (not Passing) in the real Wyscout export.
  { key: "crosses", match: (h) => h.includes("cross"), kind: "count" },
  { key: "cross_acc_pct", match: (h) => h.includes("cross"), kind: "pct" },
  { key: "offensive_duels_won_pct", match: (h) => h.includes("offensive dual") || h.includes("offensive duel"), kind: "pct" },
];

/** Columns whose presence proves this is the Passing / Attacking export (not General/Defending/Indexes). */
const PASSING_SIGNATURE = (h: string) => h.includes("forward pass") || h.includes("final third") || h.includes("smart") || h.includes("progressive");
const ATTACKING_SIGNATURE = (h: string) => h.includes("positional") || h.includes("counter") || (h.includes("touches in") && (h.includes("box") || h.includes("penalty area"))) || h.includes("offensive du");

function findHeaderRow(matrix: unknown[][], signature: (h: string) => boolean): { idx: number; headers: string[] } | null {
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const norm = (matrix[i] ?? []).map((c) => normHeader(String(c ?? "")));
    const hasTeam = norm.some((h) => h === "team" || (h.includes("team") && !h.includes("opponent")));
    const hasDate = norm.some((h) => h.includes("date"));
    const hasTarget = norm.some((h) => h && signature(h));
    if (hasTeam && hasDate && hasTarget) return { idx: i, headers: (matrix[i] ?? []).map((c) => String(c ?? "")) };
  }
  return null;
}

/** First NON-blank header whose normalised text matches `pred`. -1 when absent. */
function findCol(headers: string[], pred: (h: string) => boolean): number {
  for (let i = 0; i < headers.length; i++) {
    const nh = normHeader(String(headers[i] ?? ""));
    if (nh && pred(nh)) return i;
  }
  return -1;
}

/** Accuracy %: the trio's blank-header %-column (count / accurate / %), else computed from the pair. */
function accuracyPct(cells: unknown[], headers: string[], baseIdx: number): number | null {
  if (baseIdx < 0) return null;
  const twoRight = baseIdx + 2;
  const twoRightBlank = twoRight < headers.length && normHeader(String(headers[twoRight] ?? "")) === "";
  const trioPct = twoRightBlank ? num(cells[twoRight]) : null;
  if (trioPct != null) return trioPct;
  const [total, accurate] = pairAt(cells, headers, baseIdx);
  if (total != null && total > 0 && accurate != null) return Math.round((accurate / total) * 1000) / 10;
  return null;
}

export function parseWyscoutMultiStats(
  matrix: unknown[][],
  columns: ColSpec[],
  signature: (h: string) => boolean,
  teamName?: string,
): MultiStatParse {
  const ourKey = normTeam(teamName ?? inferOwnTeamName(matrix) ?? "Breidablik");
  const head = findHeaderRow(matrix, signature);
  if (!head) return { rows: [], matched: false, matchedKeys: [], headerRow: [], skipped: 0 };

  const norm = head.headers.map((h) => normHeader(String(h ?? "")));
  const teamIdx = norm.findIndex((h) => h === "team" || (h.includes("team") && !h.includes("opponent")));
  const dateIdx = norm.findIndex((h) => h.includes("date"));
  // Resolve each column's base index ONCE from the header row.
  const baseIdx = new Map<string, number>();
  for (const c of columns) baseIdx.set(c.key, findCol(head.headers, c.match));
  const matchedKeys = columns.filter((c) => (baseIdx.get(c.key) ?? -1) >= 0).map((c) => c.key);
  if (teamIdx < 0 || dateIdx < 0 || matchedKeys.length === 0) {
    return { rows: [], matched: false, matchedKeys: [], headerRow: head.headers, skipped: 0 };
  }

  const rows: MultiStatRow[] = [];
  let curDate: string | null = null;
  let skipped = 0;
  for (let i = head.idx + 1; i < matrix.length; i++) {
    const cells = matrix[i] ?? [];
    if (cells.every((c) => c == null || String(c).trim() === "")) continue;

    const dateCell = cells[dateIdx];
    if (dateCell != null && String(dateCell).trim() !== "") {
      const d = toDateStr(dateCell);
      if (d) curDate = d;
    }
    const team = String(cells[teamIdx] ?? "").trim();
    if (!team || !curDate) { skipped++; continue; }
    if (normTeam(team) === "average") { skipped++; continue; }

    const values: Record<string, number | null> = {};
    for (const c of columns) {
      const idx = baseIdx.get(c.key) ?? -1;
      values[c.key] = idx < 0 ? null : c.kind === "pct" ? accuracyPct(cells, head.headers, idx) : pairAt(cells, head.headers, idx)[0];
    }
    rows.push({ matchDate: curDate, isOpponent: normTeam(team) !== ourKey, values, raw: rawRowRecord(head.headers, cells) });
  }

  return { rows, matched: true, matchedKeys, headerRow: head.headers, skipped };
}

/** Wyscout "Passing" export → forward/final-third/penalty-area/progressive/cross/smart passes (+ accuracy). */
export function parsePassing(matrix: unknown[][], teamName?: string): MultiStatParse {
  return parseWyscoutMultiStats(matrix, PASSING_COLUMNS, PASSING_SIGNATURE, teamName);
}
/** Wyscout "Attacking" export → touches in box, positional/counter attacks, offensive-duels won %. */
export function parseAttacking(matrix: unknown[][], teamName?: string): MultiStatParse {
  return parseWyscoutMultiStats(matrix, ATTACKING_COLUMNS, ATTACKING_SIGNATURE, teamName);
}
