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

import type { PlayerSeasonStat, PlayerMatchStat } from "./types";
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

/** The per-player core both parsers share (Wyscout metric headers are identical
 *  across the season player-list and the per-match report). */
type CoreExtract = {
  minutes: number | null; goals: number | null; assists: number | null;
  shots: number | null; shotsOnTarget: number | null; passes: number | null;
  passAccuracyPct: number | null; keyPasses: number | null; duelsWon: number | null;
  xg: number | null; rating: number | null;
  metrics: Record<string, number | string | null>;
  sourcePlayerRef: string; wyscoutPlayerName: string;
};

type RowExtract =
  | { ok: true; player: string; team: string; core: CoreExtract }
  | { ok: false; blank: boolean; player: string; team: string; reason: string };

/** Extract one player row → normalized core, or a skip/blank verdict. */
function extractRow(row: WyscoutRow, teamNameNorm: string): RowExtract {
  const idx = indexRow(row);
  const get = (header: string): unknown => {
    const key = idx.get(normHeader(header));
    return key === undefined ? undefined : row[key];
  };
  const player = String(get("Player") ?? "").trim();
  const team = String(get("Team") ?? "").trim();
  if (!player) return { ok: false, blank: true, player: "", team, reason: "blank" };
  if (normHeader(team) !== teamNameNorm) return { ok: false, blank: false, player, team, reason: "not the senior team" };

  const shots = num(get("Shots"));
  const sotPct = num(get("Shots on target, %"));
  const shotsOnTarget = shots != null && sotPct != null ? Math.round((shots * sotPct) / 100) : null;

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

  return {
    ok: true, player, team,
    core: {
      minutes: num(get("Minutes played")), goals: num(get("Goals")), assists: num(get("Assists")),
      shots, shotsOnTarget,
      // per-90 export → totals stay null, per-90 preserved in metrics (README caveat).
      passes: null, passAccuracyPct: num(get("Accurate passes, %")), keyPasses: null,
      duelsWon: null, // "Duels won, %" is a rate, not a count → metrics
      xg: num(get("xG")), rating: null, // rating not present in this export
      metrics,
      sourcePlayerRef: initialSurnameKey(player).replace(" ", ".") || normalizeName(player),
      wyscoutPlayerName: player,
    },
  };
}

export function parseWyscoutPlayerList(rows: WyscoutRow[], opts: WyscoutParseOpts): WyscoutParseResult {
  const teamName = normHeader(opts.teamName ?? "Breidablik");
  const stats: PlayerSeasonStat[] = [];
  const skipped: WyscoutParseResult["skipped"] = [];
  for (const row of rows) {
    const r = extractRow(row, teamName);
    if (!r.ok) { if (!r.blank) skipped.push({ player: r.player, team: r.team, reason: r.reason }); continue; }
    stats.push({
      teamId: opts.teamId, playerId: null, season: opts.season, competition: null,
      ...r.core, source: "wyscout_excel", sourceRef: opts.sourceRef,
    });
  }
  return { stats, skipped };
}

// ── Per-match report ─────────────────────────────────────────────────────────
export type WyscoutMatchParseOpts = {
  teamId: string;
  matchDate: string; // ISO yyyy-mm-dd (coach-supplied — a match export may not carry it)
  opponent?: string | null;
  homeAway?: "home" | "away" | null;
  sourceRef: string;
  teamName?: string;
};
export type WyscoutMatchParseResult = {
  stats: PlayerMatchStat[];
  skipped: { player: string; team: string; reason: string }[];
};

/**
 * Parse a Wyscout per-match player report. Reuses the season field logic (the
 * per-player metric headers are identical across Wyscout reports); the match
 * context — date/opponent/home-away — is supplied by the caller, since a match
 * export may not carry it as columns. NOTE: validated against the season export's
 * shape — re-check against a real match-report export when one is available.
 */
export function parseWyscoutMatchReport(rows: WyscoutRow[], opts: WyscoutMatchParseOpts): WyscoutMatchParseResult {
  const teamName = normHeader(opts.teamName ?? "Breidablik");
  const stats: PlayerMatchStat[] = [];
  const skipped: WyscoutMatchParseResult["skipped"] = [];
  for (const row of rows) {
    const r = extractRow(row, teamName);
    if (!r.ok) { if (!r.blank) skipped.push({ player: r.player, team: r.team, reason: r.reason }); continue; }
    stats.push({
      teamId: opts.teamId, playerId: null,
      matchDate: opts.matchDate, opponent: opts.opponent ?? null, homeAway: opts.homeAway ?? null,
      ...r.core, source: "wyscout_excel", sourceRef: opts.sourceRef,
    });
  }
  return { stats, skipped };
}
