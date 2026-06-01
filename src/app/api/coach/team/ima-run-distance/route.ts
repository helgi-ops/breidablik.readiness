/**
 * /api/coach/team/ima-run-distance?date=YYYY-MM-DD
 *
 * GET — IMA Free Running distance per player for one day, split by cadence
 * band (5-8) plus the total. Powers the IMA Running Distance card on the
 * /coach/ima-intelligence page. Coach-scoped to the authenticated team.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase
    .from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId, supabase } as const;
}

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date") ?? "";
  const dateIso = /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    ? dateParam
    : new Date().toISOString().slice(0, 10);

  const { data, error } = await ctx.supabase
    .from("player_external_load_daily")
    .select(
      "player_id, ima_fr_band5_total_distance, ima_fr_band6_total_distance, " +
        "ima_fr_band7_total_distance, ima_fr_band8_total_distance, ima_fr_band58_total_distance, " +
        "players!inner(full_name, team_id)",
    )
    .eq("date", dateIso)
    .eq("source", "catapult")
    .eq("players.team_id", ctx.teamId)
    .not("ima_fr_band58_total_distance", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    player_id: string;
    ima_fr_band5_total_distance: number | null;
    ima_fr_band6_total_distance: number | null;
    ima_fr_band7_total_distance: number | null;
    ima_fr_band8_total_distance: number | null;
    ima_fr_band58_total_distance: number | null;
    players: { full_name: string | null } | { full_name: string | null }[] | null;
  };

  const players = ((data ?? []) as unknown as Row[]).map((r) => {
    const p = Array.isArray(r.players) ? r.players[0] : r.players;
    return {
      player_id: r.player_id,
      full_name: (p?.full_name ?? "—").trim(),
      band5: Number(r.ima_fr_band5_total_distance ?? 0),
      band6: Number(r.ima_fr_band6_total_distance ?? 0),
      band7: Number(r.ima_fr_band7_total_distance ?? 0),
      band8: Number(r.ima_fr_band8_total_distance ?? 0),
      total: Number(r.ima_fr_band58_total_distance ?? 0),
    };
  });
  players.sort((a, b) => b.total - a.total);

  return NextResponse.json({ date: dateIso, players });
}
