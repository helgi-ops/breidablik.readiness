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
  /**
   * Senior-squad filter on the Team column. When omitted, the senior team is
   * inferred from the file (most common Team value), so any club's export works
   * regardless of Wyscout spelling. Pass an explicit value only to force a
   * specific Team string.
   */
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

/**
 * Pick the senior-team "Team" value to keep. When the caller passes an explicit
 * `teamName`, honour it (accent/case tolerant via normHeader). Otherwise infer
 * it from the file: an Advanced-Search squad export is overwhelmingly the club's
 * own senior side, so the MOST COMMON Team value IS the senior team. This works
 * for every club regardless of Wyscout's spelling ("Breidablik", "Keflavík",
 * "Keflavík ÍF", …) and still drops minority youth rows ("Breidablik U19"),
 * which by construction are not the majority.
 */
function resolveSeniorTeamNorm(rows: WyscoutRow[], explicit?: string): string {
  const wanted = (explicit ?? "").trim();
  if (wanted) return normHeader(wanted);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const idx = indexRow(row);
    const playerKey = idx.get(normHeader("Player"));
    const teamKey = idx.get(normHeader("Team"));
    const player = playerKey === undefined ? "" : String(row[playerKey] ?? "").trim();
    const team = teamKey === undefined ? "" : String(row[teamKey] ?? "").trim();
    if (!player || !team) continue; // only real player rows vote
    const k = normHeader(team);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let best = "";
  let bestN = 0;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
  return best;
}

export function parseWyscoutPlayerList(rows: WyscoutRow[], opts: WyscoutParseOpts): WyscoutParseResult {
  const teamName = resolveSeniorTeamNorm(rows, opts.teamName);
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

  // Disambiguate DISTINCT players that collapse to the same initial+surname ref —
  // e.g. Keflavík's "A. Magnússon" (full-back) and "Á. Magnússon" (keeper) both key
  // to "a.magnusson". source_player_ref is the natural key, so without this only one
  // survives (the other is silently dropped, and the batch upsert even errors on the
  // dup). We append an accent-PRESERVING slug of the raw Wyscout name so the two
  // differ. Only collisions between different raw names are touched — every
  // non-colliding ref (so every other squad) is left exactly as before, and a true
  // duplicate (identical raw name twice) is left to collapse on upsert.
  const byRef = new Map<string, PlayerSeasonStat[]>();
  for (const s of stats) {
    const g = byRef.get(s.sourcePlayerRef) ?? [];
    g.push(s);
    byRef.set(s.sourcePlayerRef, g);
  }
  const slug = (nm: string) => nm.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 24);
  for (const group of byRef.values()) {
    if (group.length > 1 && new Set(group.map((s) => s.wyscoutPlayerName)).size > 1) {
      for (const s of group) s.sourcePlayerRef = `${s.sourcePlayerRef}#${slug(s.wyscoutPlayerName)}`;
    }
  }

  return { stats, skipped };
}

// NOTE: there is intentionally no per-match Excel parser. Wyscout has no
// per-match per-player Excel export (only a metered PDF, which is rejected), so
// player_match_stats is populated ONLY by Adapter B (the Wyscout Data API).
// See docs/samples/wyscout/README.md (handoff update 2026-07-30, option A).
