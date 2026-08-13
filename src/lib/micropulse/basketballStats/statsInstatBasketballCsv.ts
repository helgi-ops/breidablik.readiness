/**
 * InStat (Hudl) basketball manual table export — the PRIMARY structured source.
 *
 * In InStat a coach downloads a table with the metrics they select (box-score +
 * advanced) as CSV/Excel for Tableau/Looker/Power BI — the direct equivalent of
 * the StatsBomb CSV import on the football side. The route parses the file with
 * SheetJS (`XLSX.utils.sheet_to_json`) and hands us row-objects; this adapter is
 * pure (no IO), mirroring `statsbombPlayerMatch.ts`.
 *
 * Per-player box score + advanced metrics land here (source='instat'); the Four
 * Factors / per-quarter TEAM tables come from the Game Report PDF adapter. Purely
 * descriptive — NEVER touches the readiness colour, load, or daily decision.
 */

import type { BasketballBoxScoreRow } from "./types";
import {
  INSTAT_FIELD_MAP,
  normalizeInstatPlayer,
  type InstatIngestContext,
  type InstatRawRow,
} from "./statsInstatBasketball";

const hasHeader = (headers: string[], names: readonly string[]): boolean => {
  const lower = new Set(headers.map((h) => h.toLowerCase().trim()));
  return names.some((c) => lower.has(c.toLowerCase()));
};

/**
 * Fingerprint an InStat basketball player table. Requires a player-name column
 * plus points AND a basketball-specific shooting/rebounding column (so a football
 * export never routes here). Deliberately broad on the exact strings — the
 * source may add/remove metrics via InStat "adjustments".
 */
export function isInstatBasketballHeader(headers: string[]): boolean {
  const hasName = hasHeader(headers, INSTAT_FIELD_MAP.playerName);
  const hasPoints = hasHeader(headers, INSTAT_FIELD_MAP.points);
  const hasBasketballTell = hasHeader(headers, [
    ...INSTAT_FIELD_MAP.tpm,
    ...INSTAT_FIELD_MAP.oreb,
    ...INSTAT_FIELD_MAP.dreb,
    ...INSTAT_FIELD_MAP.efgPct,
    ...INSTAT_FIELD_MAP.fga,
  ]);
  // Guard against football files that happen to have "points"/"name".
  const looksFootball = hasHeader(headers, ["xg", "obv", "xgchain", "passes", "opposition passes"]);
  return hasName && hasPoints && hasBasketballTell && !looksFootball;
}

/** A row is a real player line if it has a non-empty name that isn't a total. */
function isPlayerRow(name: string): boolean {
  const f = name.toLowerCase().trim();
  return f.length > 0 && !["total", "totals", "team", "opponent", "average", "averages"].includes(f);
}

function readName(row: InstatRawRow): string {
  for (const key of INSTAT_FIELD_MAP.playerName) {
    const hit = Object.keys(row).find((k) => k.toLowerCase().trim() === key.toLowerCase());
    if (hit && row[hit] != null) return String(row[hit]).trim();
  }
  return "";
}

/** SheetJS yields `unknown` cell values; coerce to the InStat cell model. */
function coerceRow(row: Record<string, unknown>): InstatRawRow {
  const out: InstatRawRow = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v == null || typeof v === "number" || typeof v === "string" ? (v as string | number | null) : String(v);
  }
  return out;
}

/**
 * Parse InStat player rows → normalized box scores (source='instat'). Non-player
 * rows (team/total lines, empty names) are skipped and surfaced, never guessed.
 * Accepts raw SheetJS row-objects (`Record<string, unknown>`).
 */
export function parseInstatBasketballCsv(
  rawRows: Record<string, unknown>[],
  ctx: InstatIngestContext,
): { players: BasketballBoxScoreRow[]; skipped: { player: string; reason: string }[] } {
  const players: BasketballBoxScoreRow[] = [];
  const skipped: { player: string; reason: string }[] = [];
  for (const raw of rawRows) {
    const row = coerceRow(raw);
    const name = readName(row);
    if (!isPlayerRow(name)) {
      skipped.push({ player: name || "(blank)", reason: "not a player row" });
      continue;
    }
    players.push(normalizeInstatPlayer(row, ctx));
  }
  return { players, skipped };
}
