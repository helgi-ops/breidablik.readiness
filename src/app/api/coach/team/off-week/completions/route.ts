export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/coach/team/off-week/completions[?weekStart=YYYY-MM-DD]
 *
 * Adherence view for a sent off-week plan: per player who was sent a plan for the week, how many
 * training days they've marked done. Defaults to the team's most recently sent off-week.
 * Coach-owned, read-only. Descriptive — never the readiness colour.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

type Bi = { en: string; is: string };
type PlanDay = { dayIndex: number; type: string; title?: Bi };
type StoredPlan = { days?: PlanDay[] } | null;

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  const p = (prof ?? {}) as { role?: string; team_id?: string | null };
  if (!["COACH", "ADMIN", "STAFF"].includes(String(p.role ?? "").toUpperCase())) return NextResponse.json({ ok: false, error: "Coach role required" }, { status: 403 });
  const teamId = p.team_id ?? null;
  if (!teamId) return NextResponse.json({ ok: false, error: "No team context" }, { status: 400 });

  const sp = new URL(req.url).searchParams;
  let weekStart = sp.get("weekStart");
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    const { data: latest } = await sb
      .from("player_off_week_plans")
      .select("week_start")
      .eq("team_id", teamId)
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    weekStart = (latest as { week_start?: string } | null)?.week_start ?? null;
  }
  if (!weekStart) return NextResponse.json({ ok: true, weekStart: null, players: [] });

  // Plans sent to this team for the week — each carries its own day list (training days = non-rest).
  const { data: planRows } = await sb
    .from("player_off_week_plans")
    .select("player_id, plan, sent_at")
    .eq("team_id", teamId)
    .eq("week_start", weekStart);
  const plans = (planRows ?? []) as Array<{ player_id: string; plan: StoredPlan; sent_at: string }>;
  if (plans.length === 0) return NextResponse.json({ ok: true, weekStart, players: [] });

  const playerIds = plans.map((r) => r.player_id);

  const [{ data: nameRows }, { data: doneRows }] = await Promise.all([
    sb.from("players").select("id, full_name, position").in("id", playerIds),
    sb.from("player_off_week_completions").select("player_id, day_index").eq("team_id", teamId).eq("week_start", weekStart),
  ]);
  const names = new Map((nameRows ?? []).map((r) => [(r as { id: string }).id, r as { id: string; full_name: string | null; position: string | null }]));
  const doneByPlayer = new Map<string, Set<number>>();
  for (const d of (doneRows ?? []) as Array<{ player_id: string; day_index: number }>) {
    if (!doneByPlayer.has(d.player_id)) doneByPlayer.set(d.player_id, new Set());
    doneByPlayer.get(d.player_id)!.add(d.day_index);
  }

  const players = plans.map((r) => {
    const trainingDays = (r.plan?.days ?? []).filter((d) => d.type !== "rest");
    const trainingIdx = new Set(trainingDays.map((d) => d.dayIndex));
    const doneSet = doneByPlayer.get(r.player_id) ?? new Set<number>();
    // Only count completions that map to a real (non-rest) day in this player's plan.
    const completed = [...doneSet].filter((i) => trainingIdx.has(i));
    const nm = names.get(r.player_id);
    return {
      playerId: r.player_id,
      name: nm?.full_name ?? "—",
      position: nm?.position ?? null,
      total: trainingDays.length,
      completed: completed.length,
      completedIndices: completed.sort((x, y) => x - y),
      sentAt: r.sent_at,
    };
  });
  // Least-done first, so the players who need a nudge surface at the top.
  players.sort((x, y) => (x.completed / Math.max(1, x.total)) - (y.completed / Math.max(1, y.total)) || x.name.localeCompare(y.name));

  const totalDays = players.reduce((s, x) => s + x.total, 0);
  const doneDays = players.reduce((s, x) => s + x.completed, 0);
  return NextResponse.json({ ok: true, weekStart, players, summary: { players: players.length, totalDays, doneDays } });
}
