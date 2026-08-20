export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/basketball-lineups
 *   GET ?season= → the Lineup Intelligence read for the coach's basketball team
 *                  (which 5-man units win, from the InStat "Lineups" export). Without a
 *                  season param, the most recent imported season is used.
 *
 * Reads basketball_lineup_stats (source 'instat'), refreshes member names from the
 * current squad, and runs the pure engine. Descriptive context only — it never touches
 * the readiness colour, load, or the daily decision. Coach/team-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { computeLineupIntelligence, type LineupUnit, type LineupMember } from "@/lib/micropulse/basketballLineups";

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { supabase, teamId } as const;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { supabase, teamId } = auth;

  const url = new URL(req.url);
  let season = (url.searchParams.get("season") ?? "").trim();

  // Default to the most-recently imported season for this team.
  if (!season) {
    const { data: seasons } = await supabase
      .from("basketball_lineup_stats").select("season").eq("team_id", teamId).order("season", { ascending: false }).limit(1);
    season = (seasons?.[0] as { season?: string } | undefined)?.season ?? "";
  }

  const { data: rows, error } = await supabase
    .from("basketball_lineup_stats").select("*").eq("team_id", teamId)
    .eq("season", season || "unknown");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, hasData: false, season: season || null, read: null });
  }

  // Refresh member display names from the current squad (imported names may be initials).
  const ids = new Set<string>();
  for (const r of rows as Array<Record<string, unknown>>) for (const m of ((r.members as LineupMember[]) ?? [])) if (m.playerId) ids.add(m.playerId);
  const nameById = new Map<string, string>();
  if (ids.size) {
    const { data: pl } = await supabase.from("players").select("id, full_name").in("id", [...ids]);
    for (const p of (pl ?? []) as Array<{ id: string; full_name: string | null }>) if (p.full_name) nameById.set(p.id, p.full_name);
  }

  const units: LineupUnit[] = (rows as Array<Record<string, unknown>>).map((r) => ({
    lineupHash: String(r.lineup_hash ?? ""),
    members: ((r.members as LineupMember[]) ?? []).map((m) => ({
      jersey: m.jersey ?? null,
      name: (m.playerId && nameById.get(m.playerId)) || m.name,
      playerId: m.playerId ?? null,
    })),
    minutes: num(r.minutes_avg),
    possessions: num(r.possessions),
    points: num(r.points),
    plusMinus: num(r.plus_minus),
  }));

  const read = computeLineupIntelligence({ season: season || null, units });
  return NextResponse.json({ ok: true, hasData: true, season: season || null, read });
}
