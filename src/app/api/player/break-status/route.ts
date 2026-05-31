/**
 * /api/player/break-status — is the calling player's team on a declared break,
 * or returning from one? Drives the player-facing break / ease-in banner.
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getTeamReturnPhase } from "@/lib/notifications/teamBreaks";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function admin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = admin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: p } = await sb.from("players").select("id, team_id").eq("user_id", u.user.id).maybeSingle();
  if (!p) return NextResponse.json({ error: "Not a player account" }, { status: 403 });
  const player = p as { id: string; team_id: string | null };
  if (!player.team_id) return NextResponse.json({ ok: true, on_break: false, break: null, returnPhase: null });

  const today = new Date().toISOString().slice(0, 10);
  const { data: cur } = await sb
    .from("team_breaks")
    .select("start_date, end_date, label")
    .eq("team_id", player.team_id)
    .lte("start_date", today)
    .gte("end_date", today)
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const returnPhase = await getTeamReturnPhase(sb, player.team_id, today);

  return NextResponse.json({
    ok: true,
    on_break: !!cur,
    break: cur ?? null,
    returnPhase,
  });
}
