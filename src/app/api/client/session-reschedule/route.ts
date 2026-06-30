/**
 * /api/client/session-reschedule
 *
 * Lets a PT client MOVE a single prescribed session to another day when they
 * can't do it on its assigned date. Relocates just that one session; the rest
 * of the plan is unchanged. The /api/client/today resolver consults the saved
 * reschedules so the session shows on its new day and the original day isn't
 * counted as missed.
 *
 *   GET                         — list this client's active reschedules.
 *   POST   { from_date, to_date } — move the session on from_date to to_date.
 *   DELETE ?from_date=YYYY-MM-DD  — undo a move.
 *
 * Self-scoped (players.user_id). The trainer has a parallel endpoint.
 */

import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

async function requirePlayer(req: Request) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return { error: "Unauthorized", status: 401 } as const;
  const { data: player } = await sb.from("players").select("id").eq("user_id", userId).maybeSingle();
  if (!player) return { error: "Not a player account", status: 403 } as const;
  return { sb, userId, playerId: (player as { id: string }).id } as const;
}

/** The active plan + the natural session falling on a given date (or null). */
async function resolveNaturalSession(sb: SupabaseClient, playerId: string, date: string) {
  const { data: planRow } = await sb
    .from("individual_training_plans")
    .select("id, start_date, end_date")
    .eq("player_id", playerId).eq("status", "active")
    .lte("start_date", date).gte("end_date", date)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!planRow) return { plan: null, session: null } as const;
  const plan = planRow as { id: string; start_date: string; end_date: string };

  const startMs = Date.parse(plan.start_date + "T00:00:00Z");
  const dMs = Date.parse(date + "T00:00:00Z");
  const dayOffset = Math.max(0, Math.floor((dMs - startMs) / 86_400_000));
  const weekNumber = Math.floor(dayOffset / 7) + 1;
  const isoWeekday = ((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;

  const { data: sessionRow } = await sb
    .from("individual_training_sessions")
    .select("id, session_name")
    .eq("plan_id", plan.id).eq("week_number", weekNumber).eq("day_of_week", isoWeekday)
    .order("sort_order", { ascending: true }).limit(1).maybeSingle();
  return { plan, session: (sessionRow as { id: string; session_name: string } | null) ?? null } as const;
}

/** Upcoming natural sessions (next 28 days, within the active plan) with their
 *  calendar dates — so the athlete can pick a real session to move instead of
 *  typing a date. Excludes days already rescheduled. Uses the same forward date
 *  math as resolveNaturalSession so the two stay consistent. */
async function upcomingSessions(sb: SupabaseClient, playerId: string, today: string, alreadyMoved: string[]) {
  const { data: planRow } = await sb
    .from("individual_training_plans")
    .select("id, start_date, end_date")
    .eq("player_id", playerId).eq("status", "active")
    .lte("start_date", today).gte("end_date", today)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!planRow) return [] as Array<{ date: string; session_name: string }>;
  const plan = planRow as { id: string; start_date: string; end_date: string };
  const { data: sess } = await sb
    .from("individual_training_sessions")
    .select("week_number, day_of_week, session_name, sort_order")
    .eq("plan_id", plan.id).order("sort_order", { ascending: true });
  const byKey = new Map<string, string>();
  for (const s of (sess ?? []) as Array<{ week_number: number; day_of_week: number; session_name: string }>) {
    const k = `${s.week_number}|${s.day_of_week}`;
    if (!byKey.has(k)) byKey.set(k, s.session_name); // first session of the day
  }
  const moved = new Set(alreadyMoved);
  const startMs = Date.parse(plan.start_date + "T00:00:00Z");
  const todayMs = Date.parse(today + "T00:00:00Z");
  const out: Array<{ date: string; session_name: string }> = [];
  for (let i = 0; i <= 28; i++) {
    const d = new Date(todayMs + i * 86_400_000).toISOString().slice(0, 10);
    if (d > plan.end_date) break;
    const dayOffset = Math.max(0, Math.floor((Date.parse(d + "T00:00:00Z") - startMs) / 86_400_000));
    const week = Math.floor(dayOffset / 7) + 1;
    const iso = ((new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
    const name = byKey.get(`${week}|${iso}`);
    if (name && !moved.has(d)) out.push({ date: d, session_name: name });
  }
  return out;
}

export async function GET(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await a.sb
    .from("pt_session_reschedules")
    .select("from_date, to_date, session_id")
    .eq("player_id", a.playerId)
    .gte("to_date", today)
    .order("to_date", { ascending: true });
  const reschedules = (data ?? []) as Array<{ from_date: string; to_date: string; session_id: string }>;
  const upcoming = await upcomingSessions(a.sb, a.playerId, today, reschedules.map((r) => r.from_date));
  return NextResponse.json({ ok: true, reschedules, upcoming });
}

export async function POST(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, userId, playerId } = a;

  const body = await req.json().catch(() => ({}));
  // from_date defaults to the SERVER's today (avoids client timezone drift when
  // moving "today's" session); a specific date can be passed to move a future
  // session from the programme overview.
  const fromDate = body?.from_date ? String(body.from_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const toDate = String(body?.to_date ?? "").slice(0, 10);
  if (!isIso(fromDate) || !isIso(toDate)) return NextResponse.json({ error: "from_date and to_date (YYYY-MM-DD) required" }, { status: 400 });
  if (fromDate === toDate) return NextResponse.json({ error: "Pick a different day" }, { status: 400 });

  const { plan, session } = await resolveNaturalSession(sb, playerId, fromDate);
  if (!plan) return NextResponse.json({ error: "No active plan on that day" }, { status: 400 });
  if (!session) return NextResponse.json({ error: "No session scheduled on that day to move" }, { status: 400 });
  if (toDate < plan.start_date || toDate > plan.end_date) return NextResponse.json({ error: "New day is outside your plan" }, { status: 400 });

  const { error } = await sb
    .from("pt_session_reschedules")
    .upsert({ player_id: playerId, plan_id: plan.id, session_id: session.id, from_date: fromDate, to_date: toDate, moved_by: userId }, { onConflict: "player_id,from_date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, from_date: fromDate, to_date: toDate, session_name: session.session_name });
}

export async function DELETE(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const url = new URL(req.url);
  const fromDate = String(url.searchParams.get("from_date") ?? "").slice(0, 10);
  if (!isIso(fromDate)) return NextResponse.json({ error: "from_date required" }, { status: 400 });
  const { error } = await a.sb.from("pt_session_reschedules").delete().eq("player_id", a.playerId).eq("from_date", fromDate);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
