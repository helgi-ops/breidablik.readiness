/**
 * /api/trainer/client/[id]/session-reschedule
 *
 * The trainer's parallel to the client move endpoint: relocate a single
 * prescribed session for a client from its natural day to another day. The
 * /api/client/today resolver honours these the same way regardless of who moved
 * it (client or coach). Trainer-for-client auth.
 *
 *   GET                            — list the client's active reschedules.
 *   POST   { from_date, to_date }  — move the session on from_date to to_date.
 *   DELETE ?from_date=YYYY-MM-DD    — undo a move.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function getAdmin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}
const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

async function auth(req: NextRequest, clientId: string) {
  const sb = getAdmin();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const userId = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
  if (role !== "ADMIN") {
    const { data: pl } = await sb.from("players").select("team_id").eq("id", clientId).maybeSingle();
    const ct = (pl as { team_id?: string | null } | null)?.team_id ?? null;
    if (!ct) return { error: "Client not found", status: 404 } as const;
    let ok = teamId != null && ct === teamId;
    if (!ok) {
      const { data: row } = await sb.from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", ct).maybeSingle();
      ok = !!row;
    }
    if (!ok) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb, userId } as const;
}

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const a = await auth(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await a.sb
    .from("pt_session_reschedules")
    .select("from_date, to_date, session_id")
    .eq("player_id", clientId).gte("to_date", today)
    .order("to_date", { ascending: true });
  return NextResponse.json({ ok: true, reschedules: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const a = await auth(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, userId } = a;

  const body = await req.json().catch(() => ({}));
  const fromDate = String(body?.from_date ?? "").slice(0, 10);
  const toDate = String(body?.to_date ?? "").slice(0, 10);
  if (!isIso(fromDate) || !isIso(toDate)) return NextResponse.json({ error: "from_date and to_date (YYYY-MM-DD) required" }, { status: 400 });
  if (fromDate === toDate) return NextResponse.json({ error: "Pick a different day" }, { status: 400 });

  const { plan, session } = await resolveNaturalSession(sb, clientId, fromDate);
  if (!plan) return NextResponse.json({ error: "No active plan on that day" }, { status: 400 });
  if (!session) return NextResponse.json({ error: "No session scheduled on that day to move" }, { status: 400 });
  if (toDate < plan.start_date || toDate > plan.end_date) return NextResponse.json({ error: "New day is outside the plan" }, { status: 400 });

  const { error } = await sb
    .from("pt_session_reschedules")
    .upsert({ player_id: clientId, plan_id: plan.id, session_id: session.id, from_date: fromDate, to_date: toDate, moved_by: userId }, { onConflict: "player_id,from_date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, from_date: fromDate, to_date: toDate, session_name: session.session_name });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const a = await auth(req, clientId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const url = new URL(req.url);
  const fromDate = String(url.searchParams.get("from_date") ?? "").slice(0, 10);
  if (!isIso(fromDate)) return NextResponse.json({ error: "from_date required" }, { status: 400 });
  const { error } = await a.sb.from("pt_session_reschedules").delete().eq("player_id", clientId).eq("from_date", fromDate);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
