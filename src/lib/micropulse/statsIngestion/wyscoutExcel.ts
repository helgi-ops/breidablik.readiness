/**
 * Adapter A — Wyscout Excel/CSV import (pure mapper, no IO).
 *
 * Takes already-parsed rows (SheetJS reads the .xlsx in the API route) from a
 * Wyscout **Advanced Search player-list** export and emits normalized
 * `PlayerSeasonStat[]`. Pinned to the real Breiðablik export (docs/samples/wyscout):
 * one sheet, row 0 = headers, "Player" = abbreviated "A. Bjarnason", "Team" =
 * "Breidablik" for the senior side (youth rows are "Breidablik U19" etc.).
 *
 * Tolerant of column COUNT and ORDER: it reads by (normalized) header name, so
 * the 16-col and 115-col exports both parse; the long tail of metrics rides in
 * `metrics` jsonb keyed by the exact Wyscout header. No player matching here —
 * the route resolves player_id via stat_player_mapping + the name matcher.
 */

import type { PlayerSeasonStat } from "./types";
import { initialSurnameKey, normalizeName } from "./nameMatch";

export type WyscoutRow = Record<string, unknown>;

export type WyscoutParseOpts = {
  teamId: string;
  season: string; // chosen in Wyscout's timeframe; passed by the caller
  sourceRef: string; // uploaded file name
  /** Senior-squad filter on the Team column. Default "Breidablik". */
  teamName?: string;
};

export type WyscoutParseResult = {
  stats: PlayerSeasonStat[];
  skipped: { player: string; team: string; reason: string }[];
};

// Headers promoted to typed core columns — excluded from the `metrics` long tail
// (README: "Everything else → metrics"). "Shots on target, %" is NOT here: it's
// only used to derive shots_on_target and is kept in metrics.
const PROMOTED = new Set(
  ["Minutes played", "Goals", "Assists", "xG", "Shots", "Accurate passes, %"].map(normHeader),
);
// Identity columns never stored as a metric.
const IDENTITY = new Set(["Player", "Team"].map(normHeader));

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s || s === "-" || s === "–" || s === "N/A") return null;
  s = s.replace(/\s/g, "").replace(/%$/, "");
  // European decimal comma → dot (only when there's no dot already).
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Build a normalized-header → actual-key index for one row (tolerant lookup). */
function indexRow(row: WyscoutRow): Map<string, string> {
  const idx = new Map<string, string>();
  for (const k of Object.keys(row)) idx.set(normHeader(k), k);
  return idx;
}

export function parseWyscoutPlayerList(
  rows: WyscoutRow[],
  opts: WyscoutParseOpts,
): WyscoutParseResult {
  const teamName = normHeader(opts.teamName ?? "Breidablik");
  const stats: PlayerSeasonStat[] = [];
  const skipped: WyscoutParseResult["skipped"] = [];

  for (const row of rows) {
    const idx = indexRow(row);
    const get = (header: string): unknown => {
      const key = idx.get(normHeader(header));
      return key === undefined ? undefined : row[key];
    };

    const player = String(get("Player") ?? "").trim();
    const team = String(get("Team") ?? "").trim();
    if (!player) continue; // blank / total row
    if (normHeader(team) !== teamName) {
      skipped.push({ player, team, reason: "not the senior team" });
      continue;
    }

    const shots = num(get("Shots"));
    const sotPct = num(get("Shots on target, %"));
    const shotsOnTarget =
      shots != null && sotPct != null ? Math.round((shots * sotPct) / 100) : null;

    // Long tail — every non-identity, non-promoted header, keyed by exact string.
    const metrics: Record<string, number | string | null> = {};
    for (const key of Object.keys(row)) {
      const nh = normHeader(key);
      if (IDENTITY.has(nh) || PROMOTED.has(nh)) continue;
      const raw = row[key];
      if (raw == null || raw === "") continue;
      const n = num(raw);
      metrics[key] = n != null ? n : String(raw);
    }

    const ref = initialSurnameKey(player).replace(" ", ".") || normalizeName(player);

    stats.push({
      teamId: opts.teamId,
      playerId: null, // resolved by the route via stat_player_mapping + name matcher
      season: opts.season,
      competition: null,
      minutes: num(get("Minutes played")),
      goals: num(get("Goals")),
      assists: num(get("Assists")),
      shots,
      shotsOnTarget,
      // This export gives passes/key passes as PER-90 (not totals) — keep the
      // totals null and preserve the per-90 values in metrics (README caveat).
      passes: null,
      passAccuracyPct: num(get("Accurate passes, %")),
      keyPasses: null,
      duelsWon: null, // export carries "Duels won, %" (a rate), not a count → metrics
      xg: num(get("xG")),
      rating: null, // not present in this export
      metrics,
      source: "wyscout_excel",
      sourceRef: opts.sourceRef,
      sourcePlayerRef: ref,
      wyscoutPlayerName: player,
    });
  }

  return { stats, skipped };
}
