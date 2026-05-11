/**
 * /api/coach/player/[id]/trend-forecast
 *
 * Returns the 14-day trend forecast for one player — z-score slope,
 * direction, confidence, and projected STEN 3 days out. Used by the
 * Decision Summary modal to surface a forward-looking narrative
 * ("Atli has dropped 1 STEN per session — RECOVERY band by Friday")
 * without burdening the coach with raw history charts.
 *
 * Auth: coach access required, player must belong to coach's team.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadPlayerTrend } from "@/lib/micropulse/playerTrendForecast/loader";
import { formatTrendForecast } from "@/lib/micropulse/playerTrendForecast";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getCoachTeam(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Coach role required", status: 403 } as const;
  }
  const teamId = (prof?.team_id as string | null) ?? null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { userId, teamId } as const;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: playerId } = await params;
  if (!playerId) {
    return NextResponse.json({ error: "Missing player id" }, { status: 400 });
  }

  const auth = await getCoachTeam(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = getSupabase();

  const { data: playerCheck } = await supabase
    .from("players")
    .select("id, team_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!playerCheck || playerCheck.team_id !== auth.teamId) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  const langParam = (req.nextUrl.searchParams.get("lang") ?? "EN").toUpperCase();
  const lang: "IS" | "EN" = langParam === "IS" ? "IS" : "EN";

  const todayIso = new Date().toISOString().slice(0, 10);
  const payload = await loadPlayerTrend(supabase, { playerId, todayIso });
  const text = formatTrendForecast(payload, lang);

  return NextResponse.json({
    ok: true,
    playerId,
    date: todayIso,
    payload,
    text,
  });
}
