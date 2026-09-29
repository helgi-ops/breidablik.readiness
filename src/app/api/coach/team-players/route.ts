/**
 * GET /api/coach/team-players?team_id=…
 *   → active players of a team, for a coach/admin who has access to it.
 *
 * Authorised via requireCoachAccessForTeam: a normal coach only for their own team; an ADMIN for any
 * team (the same cross-team bypass the per-player training-programme route relies on). Used by the
 * cross-team send picker so an admin can send a programme to another club's players without switching
 * their active team. Read-only.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  const teamId = new URL(req.url).searchParams.get("team_id");
  if (!teamId) return NextResponse.json({ error: "team_id required" }, { status: 400 });

  try {
    const { teamId: allowed } = await requireCoachAccessForTeam(sb, req, teamId);
    if (allowed !== teamId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const st = /forbidden/i.test(msg) ? 403 : /unauth|token|auth/i.test(msg) ? 401 : 400;
    return NextResponse.json({ error: msg }, { status: st });
  }

  const { data } = await sb
    .from("players")
    .select("id, full_name")
    .eq("team_id", teamId)
    .eq("is_active", true)
    .order("full_name");
  const players = ((data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => ({ id: String(p.id), name: String(p.full_name ?? "") }));
  return NextResponse.json({ ok: true, players });
}
