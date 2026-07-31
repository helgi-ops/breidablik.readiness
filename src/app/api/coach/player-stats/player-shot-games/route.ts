export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/player-stats/player-shot-games?playerId=<uuid>
 *
 * The games one player has basketball box-score rows for, with the KKÍ game id +
 * his KKÍ player ref — so the player modal can request a per-player shot chart.
 * Coach-scoped; the player must be on the coach's team. Descriptive only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = prof?.team_id as string | null;
  if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const url = new URL(req.url);
  const playerId = (url.searchParams.get("playerId") || "").trim();
  if (!playerId) return NextResponse.json({ error: "Bad playerId" }, { status: 400 });

  const { data, error } = await supabase
    .from("player_basketball_match_stats")
    .select("game_id, game_date, opponent, source_player_ref")
    .eq("team_id", teamId).eq("player_id", playerId)
    .order("game_date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Only games where the KKÍ player ref is numeric (a real KKÍ id → filterable).
  const games = (data ?? [])
    .map((r) => r as { game_id: string; game_date: string | null; opponent: string | null; source_player_ref: string })
    .filter((r) => /^\d+$/.test(r.source_player_ref))
    .map((r) => ({ gameId: r.game_id, date: r.game_date, opponent: r.opponent, kkiRef: r.source_player_ref }));

  return NextResponse.json({ games });
}
