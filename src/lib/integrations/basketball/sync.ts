import "server-only";

/**
 * Basketball feed sync (server-only) — the Adapter-B equivalent for basketball,
 * mirroring the Wyscout Data API sync.
 *
 * The orchestration is complete and production-ready: read config, pull the
 * season's per-game box scores, resolve players (remembered mapping first, then
 * the exact-only matcher), upsert the per-game rows into
 * player_basketball_match_stats, and roll them up into a season row in
 * player_season_stats (source='baskethotel') so the existing sport-aware
 * surfaces render it. Descriptive only — never touches the readiness verdict.
 *
 * The ONE piece that needs the chosen feed's docs is the HTTP fetch + field
 * mapping; it is isolated in `fetchBasketballSeason` and, until a real contract
 * is provided, throws rather than GUESSING endpoints. Everything else is done.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { rollupBasketballSeason } from "@/lib/micropulse/basketballStats/rollup";
import { basketballGameStatToDbRow, BASKETBALL_MATCH_CONFLICT } from "@/lib/micropulse/basketballStats/persist";
import { parseBoxScore, parseSchedule } from "@/lib/micropulse/basketballStats/parseWidget";
import type { BasketballBoxScoreRow } from "@/lib/micropulse/basketballStats/types";
import { seasonStatToDbRow, SEASON_CONFLICT } from "@/lib/micropulse/statsIngestion/persist";
import { matchByInitialSurname, normalizeName } from "@/lib/micropulse/statsIngestion/nameMatch";
import type { SquadPlayer } from "@/lib/micropulse/statsIngestion/types";
import { buildScheduleUrl, buildBoxScoreUrl, fetchWidget, DEFAULT_STAGE_ID } from "./kkiWidget";

export type BasketballSyncResult = {
  teamId: string;
  ok: boolean;
  reason?: "not_basketball_feed" | "missing_team_ref" | "api_not_configured" | "not_implemented" | "fetch_failed";
  detail?: string;
  games?: number;
  gameRowsUpserted?: number;
  seasonUpserted?: number;
  mapped?: number;
  unmatched?: number;
};

/**
 * Pull a team's season box scores from the free KKÍ (baskethotel MBT) feed.
 *
 * `teamRef` = "<season_id>:<KKÍ team name>" (e.g. "130403:Grindavík"); the team
 * name filters the box scores to the tracked team (the plain "<season_id>" form
 * returns every team's rows, relying on player-mapping downstream). Walks the
 * season schedule (paginated), then pulls + parses each finished game the team
 * played, tagging date/opponent/home-away from the schedule.
 */
async function fetchBasketballSeason(
  teamRef: string,
  _season: string,
  teamId: string,
): Promise<BasketballBoxScoreRow[]> {
  const [seasonId, teamFilterRaw] = teamRef.split(":");
  const teamFilter = teamFilterRaw ? normalizeName(teamFilterRaw) : null;
  const matchesTeam = (name: string | null) =>
    !teamFilter || (name != null && normalizeName(name) === teamFilter);

  // 1) Discover the season's finished games (paginate; stop when a page adds none).
  const games: Array<{ gameId: string; date: string; home: string; away: string }> = [];
  const seen = new Set<string>();
  for (let page = 1; page <= 30; page++) {
    let sched: string;
    try { sched = await fetchWidget(buildScheduleUrl(seasonId, DEFAULT_STAGE_ID, page)); }
    catch { break; }
    const parsed = parseSchedule(sched).filter((g) => g.finished);
    const fresh = parsed.filter((g) => !seen.has(g.gameId));
    if (fresh.length === 0) break; // no new games (or the page param is a no-op) → done
    for (const g of fresh) {
      seen.add(g.gameId);
      if (teamFilter && !matchesTeam(g.homeTeam) && !matchesTeam(g.awayTeam)) continue;
      games.push({ gameId: g.gameId, date: g.date, home: g.homeTeam, away: g.awayTeam });
    }
  }

  // 2) Per game: parse the box score, keep the tracked team's rows, tag context.
  const rows: BasketballBoxScoreRow[] = [];
  for (const g of games) {
    let box: string;
    try { box = await fetchWidget(buildBoxScoreUrl(g.gameId, seasonId)); }
    catch { continue; }
    const parsed = parseBoxScore(box, g.gameId, teamId, "baskethotel");
    for (const r of parsed) {
      if (!matchesTeam(r.team)) continue;
      const isHome = matchesTeam(g.home);
      const { team, ...row } = r; void team; // drop the tag; not a table column
      rows.push({ ...row, gameDate: g.date, opponent: isHome ? g.away : g.home, homeAway: isHome ? "home" : "away" });
    }
  }
  return rows;
}

export async function syncBasketballTeam(
  supabase: SupabaseClient,
  teamId: string,
  season: string,
): Promise<BasketballSyncResult> {
  const { data: cfg } = await supabase
    .from("stat_ingestion_config")
    .select("source, basketball_team_ref, enabled")
    .eq("team_id", teamId)
    .maybeSingle();
  const c = cfg as { source?: string; basketball_team_ref?: string | null; enabled?: boolean } | null;
  if (!c || c.source !== "baskethotel" || c.enabled === false) return { teamId, ok: false, reason: "not_basketball_feed" };
  if (!c.basketball_team_ref) return { teamId, ok: false, reason: "missing_team_ref" };
  // No secret needed — the KKÍ feed is a public GET.

  let rows: BasketballBoxScoreRow[];
  try {
    rows = await fetchBasketballSeason(c.basketball_team_ref, season, teamId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "fetch_failed";
    return { teamId, ok: false, reason: msg.startsWith("not_implemented") ? "not_implemented" : "fetch_failed", detail: msg };
  }

  // Resolve players — remembered mapping first, then the (initial, surname)
  // matcher, exact-only in the unattended job (never auto-applies a fuzzy guess).
  const { data: squadRows } = await supabase.from("players").select("id, full_name, is_active").eq("team_id", teamId);
  const squad: SquadPlayer[] = (squadRows ?? [])
    .filter((p) => (p as { is_active: boolean | null }).is_active !== false)
    .map((p) => ({ id: (p as { id: string }).id, fullName: (p as { full_name: string | null }).full_name ?? "—" }));
  const { data: mapRows } = await supabase.from("stat_player_mapping").select("source_player_ref, player_id").eq("team_id", teamId);
  const remembered = new Map<string, string | null>();
  for (const m of (mapRows ?? []) as Array<{ source_player_ref: string; player_id: string | null }>) {
    remembered.set(m.source_player_ref, m.player_id);
  }
  const playerIdFor = new Map<string, string | null>();
  for (const r of rows) {
    if (playerIdFor.has(r.sourcePlayerRef)) continue;
    const mem = remembered.get(r.sourcePlayerRef);
    if (mem) { playerIdFor.set(r.sourcePlayerRef, mem); continue; }
    const m = matchByInitialSurname(r.playerName, squad);
    playerIdFor.set(r.sourcePlayerRef, m.confidence === "exact" ? m.playerId : null);
  }

  // Persist newly-resolved mappings so the coach doesn't re-map next sync.
  const seenName = new Map<string, string>();
  for (const r of rows) if (!seenName.has(r.sourcePlayerRef)) seenName.set(r.sourcePlayerRef, r.playerName);
  const mappingUpserts = [...playerIdFor.entries()]
    .filter(([ref, pid]) => pid && !remembered.has(ref)) // only newly-resolved mappings
    .map(([ref, pid]) => ({
      team_id: teamId,
      source_player_ref: ref,
      wyscout_player_name: seenName.get(ref) ?? "—",
      player_id: pid,
      confidence: "exact",
      confirmed_at: new Date().toISOString(),
    }));
  if (mappingUpserts.length > 0) {
    await supabase.from("stat_player_mapping").upsert(mappingUpserts as never, { onConflict: "team_id,source_player_ref" });
  }

  // Per-game rows (idempotent on team+game+player).
  const gameRows = rows.map((r) => basketballGameStatToDbRow(r, playerIdFor.get(r.sourcePlayerRef) ?? null));
  const { error: gErr } = await supabase
    .from("player_basketball_match_stats").upsert(gameRows as never, { onConflict: BASKETBALL_MATCH_CONFLICT });
  if (gErr) return { teamId, ok: false, reason: "fetch_failed", detail: `game upsert: ${gErr.message}` };

  // Season rollup → the same table the sport-aware surfaces read.
  const seasonStats = rollupBasketballSeason(rows, teamId, season);
  const seasonRows = seasonStats.map((s) => seasonStatToDbRow(s, playerIdFor.get(s.sourcePlayerRef) ?? null));
  const { error: sErr } = await supabase
    .from("player_season_stats").upsert(seasonRows as never, { onConflict: SEASON_CONFLICT });
  if (sErr) return { teamId, ok: false, reason: "fetch_failed", detail: `season upsert: ${sErr.message}` };

  const gameCount = new Set(rows.map((r) => r.gameId)).size;
  const mapped = [...playerIdFor.values()].filter(Boolean).length;
  return {
    teamId, ok: true,
    games: gameCount,
    gameRowsUpserted: gameRows.length,
    seasonUpserted: seasonRows.length,
    mapped,
    unmatched: playerIdFor.size - mapped,
  };
}
