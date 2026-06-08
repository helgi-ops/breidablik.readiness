/**
 * /api/client/progression-summary
 *
 * The motivating snapshot for the athlete's "Your progression" overview:
 *   - streak:    sessions logged THIS week vs planned ("3/3 this week")
 *   - last_set:  the heaviest set of the most recent logged session (+ RPE)
 *   - recent_pr: the newest personal best within the last 14 days (if any)
 *   - volume:    this-week tonnage + week-over-week delta
 *
 * Aggregates existing engines (computeVolumeLoad, computePersonalRecords) plus a
 * small weekly-streak count, so the client gets one round trip. Deterministic,
 * no AI — people keep going when they can see the progress.
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { computeVolumeLoad } from "@/lib/client/volumeLoad";
import { computePersonalRecords } from "@/lib/client/personalRecords";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function admin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}

/** Monday (UTC) of the current week, as YYYY-MM-DD. */
function thisMonday(): string {
  const d = new Date();
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = admin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: p } = await sb.from("players").select("id").eq("user_id", u.user.id).maybeSingle();
  if (!p) return NextResponse.json({ error: "Not a player account" }, { status: 403 });
  const playerId = (p as { id: string }).id;

  const today = new Date().toISOString().slice(0, 10);
  const monday = thisMonday();

  // ── Volume + PRs from the shared engines ─────────────────────────────
  const [volume, prs] = await Promise.all([
    computeVolumeLoad(sb, playerId),
    computePersonalRecords(sb, playerId, 365),
  ]);

  // ── This week's logged sessions + the most recent set ────────────────
  const { data: weekRows } = await sb
    .from("pt_exercise_set_logs")
    .select("session_date, exercise_name, weight_kg, reps, rpe")
    .eq("player_id", playerId)
    .gte("session_date", monday)
    .order("session_date", { ascending: false });
  const week = (weekRows ?? []) as Array<{ session_date: string; exercise_name: string; weight_kg: number | null; reps: number | null; rpe: number | null }>;
  const loggedThisWeek = new Set(week.map((r) => r.session_date)).size;

  // Most recent logged set overall (heaviest set of the latest session day).
  let lastSet: { exercise: string; weight_kg: number; reps: number; rpe: number | null; session_date: string } | null = null;
  const { data: latestRows } = await sb
    .from("pt_exercise_set_logs")
    .select("session_date, exercise_name, weight_kg, reps, rpe")
    .eq("player_id", playerId)
    .order("session_date", { ascending: false })
    .limit(40);
  const latest = (latestRows ?? []) as Array<{ session_date: string; exercise_name: string; weight_kg: number | null; reps: number | null; rpe: number | null }>;
  if (latest.length > 0) {
    const day = latest[0].session_date;
    const sameDay = latest.filter((r) => r.session_date === day && r.weight_kg != null && r.reps != null);
    const top = sameDay.sort((x, y) => (y.weight_kg ?? 0) - (x.weight_kg ?? 0) || (y.reps ?? 0) - (x.reps ?? 0))[0];
    if (top) lastSet = { exercise: top.exercise_name, weight_kg: top.weight_kg as number, reps: top.reps as number, rpe: top.rpe, session_date: top.session_date };
  }

  // ── Planned sessions this week (the streak denominator) ──────────────
  // Explosive assignment: sessions_per_week (capped 6). Individual plan:
  // distinct day_of_week rows for the plan's current week. Null if neither.
  let planned: number | null = null;
  const { data: epAssign } = await sb
    .from("pt_explosive_programme_assignments")
    .select("sessions_per_week, status")
    .eq("client_id", playerId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (epAssign && (epAssign as { sessions_per_week: number | null }).sessions_per_week != null) {
    planned = Math.min(6, (epAssign as { sessions_per_week: number }).sessions_per_week);
  } else {
    const { data: planRow } = await sb
      .from("individual_training_plans")
      .select("id, start_date, end_date")
      .eq("player_id", playerId)
      .eq("status", "active")
      .lte("start_date", today)
      .gte("end_date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (planRow) {
      const plan = planRow as { id: string; start_date: string };
      const startMs = new Date(plan.start_date + "T00:00:00Z").getTime();
      const todayMs = new Date(today + "T00:00:00Z").getTime();
      const weekNumber = Math.floor(Math.max(0, Math.floor((todayMs - startMs) / 86_400_000)) / 7) + 1;
      const { data: sessRows } = await sb
        .from("individual_training_sessions")
        .select("day_of_week")
        .eq("plan_id", plan.id)
        .eq("week_number", weekNumber);
      const days = new Set(((sessRows ?? []) as Array<{ day_of_week: number }>).map((s) => s.day_of_week));
      if (days.size > 0) planned = days.size;
    }
  }

  return NextResponse.json({
    ok: true,
    streak: { logged: loggedThisWeek, planned, week_start: monday },
    last_set: lastSet,
    recent_pr: prs.recent_prs[0] ?? null,
    volume: { this_week: volume.this_week, last_week: volume.last_week, delta_pct: volume.delta_pct },
  });
}
