/**
 * /api/trainer/client/[id]/games
 *
 * Trainer-managed competition/game dates for a PT client. The athlete sends the
 * trainer their schedule; the trainer enters it here. Drives pre-game tapering.
 *
 *   GET                         → upcoming games (today onward), soonest first
 *   POST   { gameDate, label? } → add a game date
 *   DELETE ?gameId=…            → remove a game date
 *
 * Auth: caller must be coach/admin/staff with access to the client's team
 * (ADMIN can manage any client).
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function getAdmin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

async function requireTrainerForClient(req: Request, clientId: string) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 } as const;

  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Forbidden", status: 403 } as const;
  }

  // Resolve the client's team (also used to stamp team_id on inserts).
  const { data: clientRow } = await sb.from("players").select("team_id").eq("id", clientId).maybeSingle();
  if (!clientRow) return { error: "Client not found", status: 404 } as const;
  const clientTeamId = (clientRow as { team_id?: string | null }).team_id ?? null;

  if (role !== "ADMIN") {
    const trainerTeamId = (prof as { team_id?: string | null } | null)?.team_id;
    if (!clientTeamId) return { error: "Forbidden", status: 403 } as const;
    let ok = trainerTeamId === clientTeamId;
    if (!ok) {
      const { data: ct } = await sb
        .from("coach_teams").select("team_id")
        .eq("coach_id", userId).eq("team_id", clientTeamId).maybeSingle();
      ok = !!ct;
    }
    if (!ok) return { error: "Forbidden", status: 403 } as const;
  }

  return { sb, userId, clientTeamId } as const;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await a.sb
    .from("pt_client_games")
    .select("id, game_date, label")
    .eq("player_id", clientId)
    .gte("game_date", today)
    .order("game_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, games: data ?? [] });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: { gameDate?: string; label?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const gameDate = (body.gameDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) {
    return NextResponse.json({ error: "gameDate YYYY-MM-DD required" }, { status: 400 });
  }

  const { data, error } = await a.sb
    .from("pt_client_games")
    .insert({
      player_id: clientId,
      trainer_id: a.userId,
      team_id: a.clientTeamId,
      game_date: gameDate,
      label: (body.label ?? "").trim() || null,
    })
    .select("id, game_date, label")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, game: data });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await ctx.params;
  const a = await requireTrainerForClient(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const gameId = new URL(req.url).searchParams.get("gameId");
  if (!gameId) return NextResponse.json({ error: "Missing gameId" }, { status: 400 });
  const { error } = await a.sb
    .from("pt_client_games")
    .delete()
    .eq("id", gameId)
    .eq("player_id", clientId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
