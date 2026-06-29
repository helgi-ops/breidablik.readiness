/**
 * /api/coach/player-game-report?player_id=…&season=2026   (coach/staff only)
 *
 * GET — per-match physical performance report for one player. The computation
 * lives in @/lib/micropulse/playerGameReport (shared with the player's own
 * self-scoped report at /api/player/game-report). This route adds coach auth, the
 * roster_only player-picker branch, and the squad roster.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computePlayerGameReport, rosterForTeam } from "@/lib/micropulse/playerGameReport";

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
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
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
  const { supabase, teamId } = ctx;

  const url = new URL(req.url);
  const season = Number(url.searchParams.get("season")) || new Date().getUTCFullYear();

  // Lightweight roster-only call so the page can populate its player picker.
  if (url.searchParams.get("roster_only")) {
    try {
      return NextResponse.json({ roster: await rosterForTeam(supabase, teamId) });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
  }

  const playerId = url.searchParams.get("player_id");
  if (!playerId) return NextResponse.json({ error: "player_id required" }, { status: 400 });

  const res = await computePlayerGameReport(supabase, teamId, playerId, season);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  const roster = res.players
    .filter((p) => p.is_active !== false || p.id === playerId)
    .map((p) => ({ id: p.id, full_name: (p.full_name ?? "—").trim(), position: p.position }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "is"));

  return NextResponse.json({ ...res.report, roster });
}
