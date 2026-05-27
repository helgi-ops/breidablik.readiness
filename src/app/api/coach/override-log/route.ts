/**
 * /api/coach/override-log
 *
 * GET — returns a summary of the coach's override history for their team,
 * powering the small "your overrides" panel on the coach dashboard.
 *
 * Returns:
 *   - countLast7d / countLast30d: how often the coach has overridden the engine
 *   - byDirection: { tougher, lighter, lateral } — pattern of disagreement
 *   - recent: the 5 most recent override events with player names
 *
 * Aligns with explainability-first principle #6 — overrides become an
 * audited dialogue, not a black hole.
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

async function getCoachTeam(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 };
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 };
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Coach role required", status: 403 };
  }
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 };
  return { userId, teamId };
}

export async function GET(req: NextRequest) {
  const ctx = await getCoachTeam(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const supabase = getSupabase();
  const todayIso = new Date().toISOString().slice(0, 10);
  const sevenAgoIso = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const thirtyAgoIso = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);

  // Pull 30 days of overrides for the team.
  const { data: rows, error } = await supabase
    .from("decision_override_log")
    .select("id, player_id, decision_date, system_decision, coach_decision, override_direction, coach_note, created_at")
    .eq("team_id", ctx.teamId)
    .gte("decision_date", thirtyAgoIso)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const overrides = (rows ?? []) as Array<{
    id: string;
    player_id: string;
    decision_date: string;
    system_decision: string;
    coach_decision: string;
    override_direction: "tougher" | "lighter" | "lateral";
    coach_note: string | null;
    created_at: string;
  }>;

  // Direction counts (last 30d)
  const byDirection = { tougher: 0, lighter: 0, lateral: 0 };
  let countLast7d = 0;
  for (const o of overrides) {
    byDirection[o.override_direction] = (byDirection[o.override_direction] ?? 0) + 1;
    if (o.decision_date >= sevenAgoIso) countLast7d += 1;
  }

  // Resolve player names for the 5 most recent overrides only (keeps the
  // payload small).
  const recentOverrides = overrides.slice(0, 5);
  const recentPlayerIds = Array.from(new Set(recentOverrides.map((o) => o.player_id)));
  const nameById = new Map<string, string>();
  if (recentPlayerIds.length > 0) {
    const { data: players } = await supabase
      .from("players")
      .select("id, full_name")
      .in("id", recentPlayerIds);
    for (const p of (players ?? []) as Array<{ id: string; full_name: string | null }>) {
      nameById.set(p.id, p.full_name ?? "Player");
    }
  }

  const recent = recentOverrides.map((o) => ({
    id: o.id,
    playerName: nameById.get(o.player_id) ?? "Player",
    decisionDate: o.decision_date,
    systemDecision: o.system_decision,
    coachDecision: o.coach_decision,
    overrideDirection: o.override_direction,
    coachNote: o.coach_note,
    createdAt: o.created_at,
  }));

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    today: todayIso,
    teamId: ctx.teamId,
    countLast7d,
    countLast30d: overrides.length,
    byDirection,
    recent,
  });
}
