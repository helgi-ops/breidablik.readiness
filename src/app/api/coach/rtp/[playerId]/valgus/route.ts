/**
 * /api/coach/rtp/[playerId]/valgus
 *
 * POST — record a coach-assessed dynamic-valgus observation for the RTP report.
 * Video valgus is NOT auto-analysed; this is a manual clinical input, stored per
 * player + assessment date and clearly labelled as coach-assessed in the report.
 * Coach/medical only; player must belong to the coach's team.
 *
 * Body: { severity: "none"|"mild"|"moderate"|"severe", note?: string, date?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const SEVERITIES = new Set(["none", "mild", "moderate", "severe"]);

async function getCoach(req: NextRequest) {
  const sb = getSupabase();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error } = await sb.auth.getUser(token);
  if (error || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  return { userId: userRes.user.id, teamId: (prof as { team_id?: string | null } | null)?.team_id ?? null } as const;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  if (!playerId) return NextResponse.json({ error: "Missing player id" }, { status: 400 });

  const auth = await getCoach(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sb = getSupabase();
  const { data: playerCheck } = await sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
  const pTeam = (playerCheck as { team_id?: string } | null)?.team_id ?? null;
  if (!pTeam) return NextResponse.json({ error: "Player not found" }, { status: 404 });
  if (auth.teamId && pTeam !== auth.teamId) return NextResponse.json({ error: "Player not in your team" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const severity = String(body?.severity ?? "").toLowerCase();
  if (!SEVERITIES.has(severity)) return NextResponse.json({ error: "Invalid severity" }, { status: 400 });
  const note = typeof body?.note === "string" ? body.note.slice(0, 500) : null;
  const date = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : new Date().toISOString().slice(0, 10);

  const { error } = await sb.from("rtp_valgus_assessments").upsert(
    { player_id: playerId, team_id: pTeam, assessment_date: date, severity, note, coach_id: auth.userId, updated_at: new Date().toISOString() },
    { onConflict: "player_id,assessment_date" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
