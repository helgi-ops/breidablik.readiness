export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/coach/team/off-week?days=7&gym=gym|bodyweight[&playerIds=a,b,c]
 *
 * Per-player OFF-WEEK maintenance plans (strength + running), individualised by each player's needs
 * profile. Preview for the coach — nothing is sent/stored here; the coach reviews in Week setup and
 * downloads the PDF / sends. Descriptive; never the readiness colour.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadOffWeekPlans } from "@/lib/micropulse/offWeek/loader";

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
  const days = Math.max(1, Math.min(10, Number(sp.get("days")) || 7));
  const gymAccess = sp.get("gym") === "bodyweight" ? "bodyweight" : "gym";
  const playerIds = (sp.get("playerIds") ?? "").split(",").map((x) => x.trim()).filter(Boolean);

  const { players } = await loadOffWeekPlans(sb, { teamId, playerIds: playerIds.length ? playerIds : undefined, days, gymAccess });
  return NextResponse.json({ ok: true, days, gymAccess, players });
}

/**
 * POST — generate + SEND the off-week plans to the players' app (upsert player_off_week_plans).
 * Body: { days, gym, weekStart?, playerIds? }. The player reads it via GET /api/player/off-week.
 */
export async function POST(req: NextRequest) {
  const sb = getSupabase();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  const uid = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", uid).maybeSingle();
  const p = (prof ?? {}) as { role?: string; team_id?: string | null };
  if (!["COACH", "ADMIN", "STAFF"].includes(String(p.role ?? "").toUpperCase())) return NextResponse.json({ ok: false, error: "Coach role required" }, { status: 403 });
  const teamId = p.team_id ?? null;
  if (!teamId) return NextResponse.json({ ok: false, error: "No team context" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { days?: unknown; gym?: unknown; weekStart?: unknown; playerIds?: unknown };
  const days = Math.max(1, Math.min(10, Number(body.days) || 7));
  const gymAccess = body.gym === "bodyweight" ? "bodyweight" : "gym";
  const playerIds = Array.isArray(body.playerIds) ? body.playerIds.filter((x): x is string => typeof x === "string") : [];
  // week_start = the Monday of the given/next week (keeps one row per player per off-week).
  const ws = typeof body.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart) ? body.weekStart : (() => {
    const d = new Date(); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10);
  })();

  const { players } = await loadOffWeekPlans(sb, { teamId, playerIds: playerIds.length ? playerIds : undefined, days, gymAccess });
  if (players.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const rows = players.map((pl) => ({
    player_id: pl.playerId, team_id: teamId, week_start: ws, days, gym_access: gymAccess,
    plan: pl.plan, needs: pl.needs, sent_by: uid, sent_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }));
  const { error } = await sb.from("player_off_week_plans").upsert(rows, { onConflict: "player_id,week_start" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sent: rows.length, weekStart: ws });
}
