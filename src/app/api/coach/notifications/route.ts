export const runtime = "nodejs";

/**
 * /api/coach/notifications
 *
 * GET   — list unacknowledged + recent acknowledged notifications for the
 *         coach's team (event-stream view of threshold-crossings).
 * POST  — manually trigger detection (also auto-runs after Catapult sync).
 *         Body: { mode: "detect" } → re-runs detection for the team.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pushNewCoachNotifications } from "@/lib/notifications/push";

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
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 };
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 };
  return { userId, teamId };
}

// ── GET — list notifications ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = getSupabase();
  const includeAcked = req.nextUrl.searchParams.get("include_acknowledged") === "1";

  // Pull with player names joined
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const since = sevenDaysAgo.toISOString();

  let query = supabase
    .from("coach_notifications")
    .select(`
      id, parameter, direction, severity, threshold, value_now, value_prev,
      summary, summary_is, is_post_match, fired_at, acknowledged_at,
      player_id, players(full_name)
    `)
    .eq("team_id", auth.teamId)
    .gte("fired_at", since)
    .order("fired_at", { ascending: false });

  if (!includeAcked) {
    query = query.is("acknowledged_at", null);
  }

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, notifications: data ?? [] });
}

// ── POST — manual detection trigger + push to subscribed coaches ──────────
export async function POST(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = getSupabase();
  const { data: newCount, error } = await supabase.rpc("detect_coach_notifications", {
    p_team_id: auth.teamId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If new notifications fired, push them to subscribed coaches on this team.
  let pushedCount = 0;
  if ((newCount ?? 0) > 0) {
    pushedCount = await pushNewCoachNotifications(supabase, auth.teamId);
  }

  return NextResponse.json({
    ok: true,
    new_notifications: newCount ?? 0,
    push_sent: pushedCount,
  });
}
