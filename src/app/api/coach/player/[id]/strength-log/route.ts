/**
 * GET /api/coach/player/[id]/strength-log?days=90 — a player's per-set strength log for the coach,
 * plus the derived working-1RM map (canonical lift → { one_rm, source, needs_retest }) so the card
 * can turn %1RM prescriptions into kg. Coach-auth, team-scoped.
 *
 * Descriptive — the e1RM/kg it exposes never set the readiness colour or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { oneRepMaxesFromLogs } from "@/lib/micropulse/strengthProgramming/oneRmFromLogs";
import type { SetLogRow } from "@/lib/client/workingOneRm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const sb = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ ok: false, error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ ok: false, error: "Coach role required" }, { status: 403 });
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  const { data: player } = await sb.from("players").select("id").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return NextResponse.json({ ok: false, error: "Player not on your team" }, { status: 403 });

  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 90));
  const cutoff = new Date(); cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const { data } = await sb.from("player_strength_set_log")
    .select("session_date, exercise_id, exercise_name, canonical_lift, set_index, weight_kg, reps, rpe, rir, is_warmup")
    .eq("player_id", playerId).gte("session_date", cutoff.toISOString().slice(0, 10))
    .order("session_date", { ascending: false }).order("set_index", { ascending: true });

  const rows = (data ?? []) as Array<{ session_date: string; exercise_name: string; weight_kg: number | null; reps: number | null; rpe: number | null; is_warmup: boolean }>;
  const setLogs: SetLogRow[] = rows.filter((r) => !r.is_warmup).map((r) => ({
    session_date: r.session_date, exercise_name: r.exercise_name, weight_kg: r.weight_kg, reps: r.reps, rpe: r.rpe,
  }));
  const working = oneRepMaxesFromLogs(setLogs);

  return NextResponse.json({ ok: true, sets: data ?? [], working });
}
