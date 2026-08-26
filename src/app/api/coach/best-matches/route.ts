export const runtime = "nodejs";

/**
 * GET /api/coach/best-matches?top=10
 *
 * Ranks the team's own matches (sb_team_match_stats) best-first and, for the top N, returns what we
 * did well (from the team numbers vs our season norm) and who was in the team (the matchday lineup
 * from player_match_stats). Descriptive football data — never touches the readiness colour. Coach-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { rankMatches, type TeamMatch, type Lens } from "@/lib/micropulse/bestMatches";
import { positionLine } from "@/lib/micropulse/statExplorer";

async function authenticate(req: NextRequest) {
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
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId, supabase } as const;
}

const n = (v: unknown): number | null => { if (v == null || v === "") return null; const x = Number(v); return Number.isFinite(x) ? x : null; };

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const { teamId, supabase } = ctx;

  const sp = new URL(req.url).searchParams;
  const top = Math.max(1, Math.min(30, Number(sp.get("top")) || 10));
  const lRaw = (sp.get("lens") ?? "overall").toLowerCase();
  const lens: Lens = lRaw === "attack" || lRaw === "defense" ? lRaw : "overall";

  const { data: tm } = await supabase
    .from("sb_team_match_stats")
    .select("match_date, opponent, is_home, goals, goals_against, xg, xg_against, obv, pressures, open_play_xg, set_piece_xg, deep_progressions")
    .eq("team_id", teamId).eq("source", "statsbomb");
  const rows: TeamMatch[] = (tm ?? []).map((r: Record<string, unknown>) => ({
    matchDate: String(r.match_date), opponent: (r.opponent as string | null) ?? null, isHome: (r.is_home as boolean | null) ?? null,
    goals: n(r.goals), goalsAgainst: n(r.goals_against), xg: n(r.xg), xgAgainst: n(r.xg_against),
    obv: n(r.obv), pressures: n(r.pressures), openPlayXg: n(r.open_play_xg), setPieceXg: n(r.set_piece_xg), deepProgressions: n(r.deep_progressions),
  }));

  if (rows.length === 0) return NextResponse.json({ ok: true, hasData: false, matches: [] });

  const ranked = rankMatches(rows, { topN: top, lens });

  // Lineups for the ranked dates only. Prefer the coach-entered Match minutes
  // (match_player_minutes: minutes_played + DNP → the real starting XI and subs); fall back to the
  // per-player stat rows only for a match the coach hasn't entered there.
  const dates = new Set(ranked.map((m) => m.matchDate));
  const STARTER_MIN = 55; // the coach's rule: 55+ minutes = a starter
  const { data: playerRows } = await supabase.from("players").select("id, full_name, position").eq("team_id", teamId);
  const pInfo = new Map((playerRows ?? []).map((p) => [(p as { id: string }).id, { name: (p as { full_name: string | null }).full_name ?? "—", position: (p as { position: string | null }).position ?? null }]));

  type LineupRow = { name: string; position: string | null; line: string | null; minutes: number | null; starter: boolean | null };
  const push = (map: Map<string, LineupRow[]>, date: string, playerId: string, minutes: number | null) => {
    const info = pInfo.get(playerId); if (!info) return;
    const arr = map.get(date) ?? map.set(date, []).get(date)!;
    arr.push({ name: info.name, position: info.position, line: positionLine(info.position), minutes, starter: minutes == null ? null : minutes >= STARTER_MIN });
  };

  // Source 1: coach-entered Match minutes (excludes DNP — they weren't in the team).
  const mpm = await fetchAllPages<{ player_id: string | null; match_date: string; minutes_played: number | null; is_dnp: boolean | null }>(
    (from, to) => supabase.from("match_player_minutes").select("player_id, match_date, minutes_played, is_dnp").eq("team_id", teamId).range(from, to),
  );
  const fromMinutes = new Map<string, LineupRow[]>();
  for (const r of mpm) { if (!r.player_id || !dates.has(r.match_date) || r.is_dnp) continue; push(fromMinutes, r.match_date, r.player_id, r.minutes_played); }

  // Source 2 (fallback): per-player stat rows, for dates Match minutes doesn't cover.
  const pms = await fetchAllPages<{ player_id: string | null; match_date: string; minutes: number | null }>(
    (from, to) => supabase.from("player_match_stats").select("player_id, match_date, minutes").eq("team_id", teamId).not("player_id", "is", null).range(from, to),
  );
  const fromStats = new Map<string, LineupRow[]>();
  for (const r of pms) { if (!r.player_id || !dates.has(r.match_date)) continue; push(fromStats, r.match_date, r.player_id, r.minutes); }

  const LINE_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
  const matches = ranked.map((m) => {
    const usedMinutes = (fromMinutes.get(m.matchDate)?.length ?? 0) > 0;
    const lineup = (fromMinutes.get(m.matchDate) ?? fromStats.get(m.matchDate) ?? []).slice().sort((a, b) => {
      if (a.minutes != null && b.minutes != null && a.minutes !== b.minutes) return b.minutes - a.minutes;
      return (LINE_ORDER[a.line ?? ""] ?? 9) - (LINE_ORDER[b.line ?? ""] ?? 9) || a.name.localeCompare(b.name);
    });
    // The starting XI is trustworthy when it came from Match minutes with a real XI's worth entered.
    const starterCount = lineup.filter((p) => p.starter === true).length;
    const startersKnown = usedMinutes && lineup.length >= 10 && starterCount >= 8;
    return { ...m, lineup, lineupCount: lineup.length, startersKnown, lineupSource: usedMinutes ? "minutes" : "stats" };
  });

  return NextResponse.json({ ok: true, hasData: true, count: matches.length, totalMatches: rows.length, matches });
}
