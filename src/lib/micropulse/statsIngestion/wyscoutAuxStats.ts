/**
 * Wyscout Team → Stats AUXILIARY-tab parser — pure, no IO.
 *
 * The "General" export (parsed by wyscoutTeamStats.ts) carries goals/xG/shots/…
 * but NOT PPDA or defensive duels — those live in two other DISPLAY tabs the coach
 * exports separately (both with "Show opponents" ON, one row per team per match):
 *   • "Indexes"   → a plain numeric `PPDA` column.
 *   • "Defending" → `Defensive duels / won` as a Wyscout trio: total in column N,
 *                   won count in N+1 (blank header), won % in N+2 (blank header).
 *
 * This reads ONE such sheet matrix and pulls ONE column (plus an optional
 * secondary-offset for the trio %) per (matchDate, own/opponent). It reuses the
 * exact date/team/number coercers from the General parser so parsing never drifts.
 *
 * Descriptive football context only — it never touches the readiness colour.
 */

import { normTeam, normHeader, num, toDateStr } from "./wyscoutTeamStats";

export type AuxStatRow = {
  matchDate: string; // ISO yyyy-mm-dd
  isOpponent: boolean;
  value: number | null;
};

export type AuxStatParse = {
  rows: AuxStatRow[];
  /** True when the requested header was found — lets the caller fail loudly on the wrong export. */
  matched: boolean;
  /** The header string we matched (for logging), or null. */
  matchedHeader: string | null;
  headerRow: string[];
  skipped: number;
};

export type AuxStatOpts = {
  teamName?: string;
  /** Normalised-substring the target column header must contain (e.g. "ppda"). */
  headerMatch: string;
  /** 0 = the matched column itself; 2 = the "won %" of a Wyscout total/won/won% trio. */
  secondaryOffset?: number;
};

/** First row (within the first 20) that has a Team column, a Date column, and the target header. */
function findHeaderRow(matrix: unknown[][], headerMatch: string): { idx: number; headers: string[] } | null {
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const norm = (matrix[i] ?? []).map((c) => normHeader(String(c ?? "")));
    const hasTeam = norm.some((h) => h === "team" || (h.includes("team") && !h.includes("opponent")));
    const hasDate = norm.some((h) => h.includes("date"));
    const hasTarget = norm.some((h) => h.includes(headerMatch));
    if (hasTeam && hasDate && hasTarget) return { idx: i, headers: (matrix[i] ?? []).map((c) => String(c ?? "")) };
  }
  return null;
}

/**
 * Pull one auxiliary column keyed by (matchDate, isOpponent).
 *
 * Wyscout blanks repeated Date/Match cells and prepends an AVERAGE block
 * (Date = "Breidablik"/"Opponents", no Team) — we carry the last real date
 * forward and skip any row whose date doesn't parse to a real ISO date or whose
 * Team cell is empty, so the average block never leaks in.
 */
export function parseWyscoutAuxColumn(matrix: unknown[][], opts: AuxStatOpts): AuxStatParse {
  const teamName = opts.teamName ?? "Breidablik";
  const ourKey = normTeam(teamName);
  const offset = opts.secondaryOffset ?? 0;

  const head = findHeaderRow(matrix, opts.headerMatch);
  if (!head) return { rows: [], matched: false, matchedHeader: null, headerRow: [], skipped: 0 };

  const norm = head.headers.map((h) => normHeader(String(h ?? "")));
  const teamIdx = norm.findIndex((h) => h === "team" || (h.includes("team") && !h.includes("opponent")));
  const dateIdx = norm.findIndex((h) => h.includes("date"));
  const targetIdx = norm.findIndex((h) => h.includes(opts.headerMatch));
  if (teamIdx < 0 || dateIdx < 0 || targetIdx < 0) {
    return { rows: [], matched: false, matchedHeader: null, headerRow: head.headers, skipped: 0 };
  }

  const rows: AuxStatRow[] = [];
  let curDate: string | null = null;
  let skipped = 0;
  for (let i = head.idx + 1; i < matrix.length; i++) {
    const cells = matrix[i] ?? [];
    if (cells.every((c) => c == null || String(c).trim() === "")) continue;

    const dateCell = cells[dateIdx];
    if (dateCell != null && String(dateCell).trim() !== "") {
      const d = toDateStr(dateCell);
      if (d) curDate = d; // real date row; average-block "Breidablik"/"Opponents" won't parse → curDate unchanged
    }

    const team = String(cells[teamIdx] ?? "").trim();
    if (!team || !curDate) { skipped++; continue; } // subtitle / average / pre-first-date row
    if (normTeam(team) === "average") { skipped++; continue; }

    rows.push({
      matchDate: curDate,
      isOpponent: normTeam(team) !== ourKey,
      value: num(cells[targetIdx + offset]),
    });
  }

  return { rows, matched: true, matchedHeader: head.headers[targetIdx] ?? null, headerRow: head.headers, skipped };
}

/** Wyscout "Indexes" export → PPDA per (matchDate, own/opponent). */
export function parsePpda(matrix: unknown[][], teamName?: string): AuxStatParse {
  return parseWyscoutAuxColumn(matrix, { teamName, headerMatch: "ppda", secondaryOffset: 0 });
}

/** Wyscout "Defending" export → defensive-duels WON % (the trio's third column). */
export function parseDefDuelsWonPct(matrix: unknown[][], teamName?: string): AuxStatParse {
  return parseWyscoutAuxColumn(matrix, { teamName, headerMatch: "defensive duels won", secondaryOffset: 2 });
}
