export const runtime = "nodejs";

/**
 * /api/coach/pass-network?date=YYYY-MM-DD — the stored passing network for one match.
 *
 * Returns per-player passing (volume + OBV) and passer→receiver combinations for both
 * sides (own = the coach's team). Own-side players are joined to the roster's nominal
 * position so the panel can draw the schematic pitch; opponent players have no position
 * (they aren't in our squad), so the panel shows them as tables/bars only.
 *
 * Descriptive football data — never touches the readiness colour. Coach-scoped read.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

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

type PRow = Record<string, unknown>;
const numOrNull = (v: unknown) => (v == null ? null : Number(v));

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { supabase, teamId } = auth;
  const date = (new URL(req.url).searchParams.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ ok: false, error: "date (YYYY-MM-DD) is required" }, { status: 400 });

  const [{ data: pp }, { data: cc }] = await Promise.all([
    supabase.from("sb_match_player_passing").select("*").eq("team_id", teamId).eq("match_date", date),
    supabase.from("sb_pass_combinations").select("*").eq("team_id", teamId).eq("match_date", date),
  ]);
  const players = (pp ?? []) as PRow[];
  const combos = (cc ?? []) as PRow[];
  if (!players.length && !combos.length) return NextResponse.json({ ok: true, hasData: false, date });

  // Own-side roster positions for the schematic pitch layout.
  const ownIds = [...new Set(players.filter((r) => r.side === "own" && r.player_id).map((r) => String(r.player_id)))];
  const posById = new Map<string, string | null>();
  if (ownIds.length) {
    const { data: pos } = await supabase.from("players").select("id, position").in("id", ownIds);
    for (const p of (pos ?? []) as Array<{ id: string; position: string | null }>) posById.set(p.id, p.position);
  }

  const playerOut = (r: PRow) => ({
    ref: String(r.player_ref), name: String(r.player_name), playerId: (r.player_id as string) ?? null,
    position: r.player_id ? (posById.get(String(r.player_id)) ?? null) : null,
    passes: numOrNull(r.passes), obv: numOrNull(r.obv),
  });
  const comboOut = (r: PRow) => ({
    passerRef: String(r.passer_ref), passerName: String(r.passer_name),
    receiverRef: String(r.receiver_ref), receiverName: String(r.receiver_name),
    passes: numOrNull(r.passes), obv: numOrNull(r.obv),
  });
  const side = (s: "own" | "opp") => ({
    teamName: (players.find((r) => r.side === s)?.team_name as string) ?? (combos.find((r) => r.side === s)?.team_name as string) ?? null,
    players: players.filter((r) => r.side === s).map(playerOut),
    combos: combos.filter((r) => r.side === s).map(comboOut),
  });

  return NextResponse.json({ ok: true, hasData: true, date, own: side("own"), opp: side("opp") });
}
