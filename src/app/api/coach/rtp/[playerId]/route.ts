/**
 * /api/coach/rtp/[playerId]
 *
 * GET — computed Return-to-Play assessment for one player (CMJ + change-of-
 * direction asymmetry + injury/RTT context). Rules compute every status; the
 * separate /narrative route only rephrases these figures. Coach/medical only.
 * PHI: player must belong to the coach's team.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildRtpAssessment } from "@/lib/micropulse/rtp/buildRtpAssessment";

export const runtime = "nodejs";
export const maxDuration = 30;

async function getCoachTeam(req: NextRequest) {
  const sb = getSupabase();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
  return { teamId } as const;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  if (!playerId) return NextResponse.json({ error: "Missing player id" }, { status: 400 });

  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sb = getSupabase();
  const { data: playerCheck } = await sb.from("players").select("id, team_id").eq("id", playerId).maybeSingle();
  const pTeam = (playerCheck as { team_id?: string } | null)?.team_id ?? null;
  if (!pTeam) return NextResponse.json({ error: "Player not found" }, { status: 404 });
  if (auth.teamId && pTeam !== auth.teamId) return NextResponse.json({ error: "Player not in your team" }, { status: 403 });

  try {
    const assessment = await buildRtpAssessment(sb, playerId, pTeam);
    return NextResponse.json({ ok: true, assessment });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to build assessment" }, { status: 500 });
  }
}
