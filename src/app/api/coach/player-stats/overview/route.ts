export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never statically cache — always read live DB

/**
 * /api/coach/player-stats/overview?season=2026
 *
 * Per-player football-vs-physical view: each mapped player's Wyscout SEASON
 * stats beside his MicroPulse physical output (GPS/IMA) for the same season.
 * (The current Wyscout export is season aggregates; per-match side-by-side
 * arrives with a match-report export or Adapter B.) Descriptive — never touches
 * the readiness colour. Coach-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";
import { initialSurnameKey } from "@/lib/micropulse/statsIngestion/nameMatch";
import { scopeToCurrentSeason, aggregateOwnBox, pctOf, type FibaGame } from "@/lib/micropulse/basketballStats/fibaGamesRead";

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { teamId, supabase } as const;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const ctx = await authTeam(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { supabase, teamId } = ctx;

  const url = new URL(req.url);
  const seasonParam = (url.searchParams.get("season") || "").trim();

  // Resolve the season robustly: an explicit param wins IF it has rows; otherwise
  // default to the LATEST season that actually has stats (future-proof — no
  // hardcoded year that rots), so "Players" always lands on real data.
  const { data: latestRow } = await supabase
    .from("player_season_stats").select("season").eq("team_id", teamId)
    .order("season", { ascending: false }).limit(1).maybeSingle();
  const latestSeason = latestRow?.season ? String(latestRow.season) : null;
  let season = seasonParam || latestSeason || String(new Date().getUTCFullYear());
  if (seasonParam) {
    const { count } = await supabase
      .from("player_season_stats").select("*", { count: "exact", head: true })
      .eq("team_id", teamId).eq("season", seasonParam);
    if (!count) season = latestSeason || seasonParam;
  }
  // Physical window = the season's calendar year when season is a plain year,
  // else the last 365 days (honest fallback, never a fabricated range).
  const yr = /^\d{4}$/.test(season) ? Number(season) : null;
  const start = yr ? `${yr}-01-01` : new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const end = yr ? `${yr}-12-31` : new Date().toISOString().slice(0, 10);

  const { data: statRows, error: sErr } = await supabase
    .from("player_season_stats")
    .select("player_id, minutes, goals, assists, xg, shots, shots_on_target, pass_accuracy_pct, metrics, source, source_ref, synced_at, wyscout_player_name, players:player_id(full_name, position)")
    .eq("team_id", teamId)
    .eq("season", season);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

  // Basketball can have two season sources for a player: the KKÍ box score ('baskethotel')
  // and the richer InStat export ('instat', which also carries +/- and points-per-possession).
  // Prefer the InStat row where both exist so the player isn't listed twice. Both are
  // basketball-only sources, so football (statsbomb_csv / wyscout_*) is provably untouched.
  const instatPlayers = new Set<string>();
  for (const r of (statRows ?? []) as Array<Record<string, unknown>>) {
    if (String(r.source) === "instat" && r.player_id) instatPlayers.add(String(r.player_id));
  }
  const dedupedStatRows = (statRows ?? []).filter((r) => {
    const rr = r as Record<string, unknown>;
    return !(String(rr.source) === "baskethotel" && rr.player_id && instatPlayers.has(String(rr.player_id)));
  });

  // Physical season summary per player (Catapult GPS/IMA daily). A season is
  // ~2000+ daily rows, so page past the PostgREST 1000-row default — otherwise
  // the sums are truncated (~half) and coverage undercounts.
  const loadRows: Array<Record<string, unknown>> = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("player_external_load_daily")
      .select("player_id, total_distance, max_velocity, total_player_load, date")
      .eq("team_id", teamId).eq("source", "catapult").gte("date", start).lte("date", end)
      .order("date", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    loadRows.push(...(data as Array<Record<string, unknown>>));
    if (data.length < PAGE) break;
  }
  const phys = new Map<string, { sessions: number; distM: number; topSpeed: number | null; load: number }>();
  for (const r of (loadRows ?? []) as Array<Record<string, unknown>>) {
    const pid = String(r.player_id ?? ""); if (!pid) continue;
    const p = phys.get(pid) ?? { sessions: 0, distM: 0, topSpeed: null, load: 0 };
    p.sessions += 1;
    p.distM += num(r.total_distance) ?? 0;
    p.load += num(r.total_player_load) ?? 0;
    const mv = num(r.max_velocity);
    if (mv != null && mv <= 45 && (p.topSpeed == null || mv > p.topSpeed)) p.topSpeed = mv;
    phys.set(pid, p);
  }

  // Match minutes total (MicroPulse-side) for the same window.
  const { data: minRows } = await supabase
    .from("match_player_minutes")
    .select("player_id, minutes_played, match_date")
    .eq("team_id", teamId).gte("match_date", start).lte("match_date", end);
  const mins = new Map<string, number>();
  for (const r of (minRows ?? []) as Array<Record<string, unknown>>) {
    const pid = String(r.player_id ?? ""); if (!pid) continue;
    mins.set(pid, (mins.get(pid) ?? 0) + (num(r.minutes_played) ?? 0));
  }

  const players: unknown[] = [];
  let unmatched = 0;
  for (const r of dedupedStatRows as Array<Record<string, unknown>>) {
    const pid = r.player_id ? String(r.player_id) : null;
    if (!pid) { unmatched += 1; continue; }
    const pj = Array.isArray(r.players) ? r.players[0] : r.players;
    const p = phys.get(pid);
    players.push({
      playerId: pid,
      name: (pj as { full_name?: string } | null)?.full_name ?? r.wyscout_player_name ?? "—",
      position: (pj as { position?: string } | null)?.position ?? null,
      football: {
        minutes: num(r.minutes), goals: num(r.goals), assists: num(r.assists), xg: num(r.xg),
        shots: num(r.shots), shotsOnTarget: num(r.shots_on_target), passAccuracyPct: num(r.pass_accuracy_pct),
        metrics: (r.metrics as Record<string, unknown>) ?? {},
      },
      physical: {
        sessions: p?.sessions ?? 0,
        totalDistanceKm: p ? Math.round(p.distM / 100) / 10 : null,
        topSpeed: p?.topSpeed ?? null,
        playerLoad: p ? Math.round(p.load) : null,
        matchMinutes: mins.get(pid) ?? null,
      },
      source: r.source, sourceRef: r.source_ref, syncedAt: r.synced_at,
    });
  }
  // Sort by football minutes desc.
  players.sort((a, b) => ((b as { football: { minutes: number | null } }).football.minutes ?? 0) - ((a as { football: { minutes: number | null } }).football.minutes ?? 0));

  // Coverage honesty: which ACTIVE squad players are NOT in this import — so a
  // coach sees who's missing (e.g. absent from the Wyscout export), never a
  // silently short list.
  const importedIds = new Set(
    (statRows ?? []).map((r) => (r as { player_id: string | null }).player_id).filter(Boolean) as string[],
  );
  const { data: roster } = await supabase
    .from("players").select("id, full_name, position").eq("team_id", teamId).eq("is_active", true);
  const missing = ((roster ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>)
    .filter((p) => !importedIds.has(p.id))
    .map((p) => ({ playerId: p.id, name: p.full_name ?? "—", position: p.position ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const sport = await resolveTeamSport(supabase, teamId);

  // Basketball fallback: a team whose only basketball data is KKÍ-saved games has NO player_season_stats
  // rows (those come from the InStat/baskethotel sync). Aggregate the box scores in basketball_fiba_games
  // (current season) instead, so the Players tab is populated. Shaped like the season-stat rows the client
  // reads: football.minutes = season minutes; football.metrics carries the per-game/% keys it renders.
  if (sport === "basketball" && players.length === 0) {
    const { data: fibaRows } = await supabase
      .from("basketball_fiba_games")
      .select("match_date, own_box, season")
      .eq("owner_team_id", teamId);
    const { games: scoped, season: fibaSeason } = scopeToCurrentSeason(((fibaRows ?? []) as FibaGame[]));
    if (scoped.length > 0) {
      const rosterByKey = new Map<string, { id: string; name: string; position: string | null }>();
      for (const p of ((roster ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>)) {
        const k = initialSurnameKey(p.full_name ?? "");
        if (k && !rosterByKey.has(k)) rosterByKey.set(k, { id: p.id, name: p.full_name ?? "—", position: p.position ?? null });
      }
      const aggs = aggregateOwnBox(scoped, initialSurnameKey);
      const fallbackPlayers = aggs.map((a) => {
        const r = rosterByKey.get(a.key);
        const ph = r ? phys.get(r.id) : undefined;
        const d1 = (v: number) => Math.round((v / a.gp) * 10) / 10;
        return {
          playerId: r?.id ?? null,
          name: r?.name ?? a.name,
          position: r?.position ?? null,
          football: {
            minutes: Math.round(a.min), goals: null, assists: null, xg: null, shots: null, shotsOnTarget: null, passAccuracyPct: null,
            metrics: {
              "Points per game": d1(a.pts), "Rebounds per game": d1(a.reb), "Assists per game": d1(a.ast),
              "Steals per game": d1(a.stl), "Blocks per game": d1(a.blk),
              "Field goals %": pctOf(a.fgm, a.fga), "Three-point %": pctOf(a.tpm, a.tpa), "Free throws %": pctOf(a.ftm, a.fta),
              "Games": a.gp,
            } as Record<string, unknown>,
          },
          physical: {
            sessions: ph?.sessions ?? 0,
            totalDistanceKm: null, topSpeed: null,
            playerLoad: ph ? Math.round(ph.load) : null,
            matchMinutes: r ? (mins.get(r.id) ?? null) : null,
          },
          source: "kki", sourceRef: null, syncedAt: null,
        };
      });
      fallbackPlayers.sort((x, y) => (Number((y.football.metrics as { "Points per game"?: number })["Points per game"]) || 0) - (Number((x.football.metrics as { "Points per game"?: number })["Points per game"]) || 0));
      return NextResponse.json({ season: fibaSeason ?? season, start, end, sport, players: fallbackPlayers, unmatched: 0, missing });
    }
  }

  return NextResponse.json({ season, start, end, sport, players, unmatched, missing });
}
