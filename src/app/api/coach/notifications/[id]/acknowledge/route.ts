export const runtime = "nodejs";

/**
 * /api/coach/notifications/[id]/acknowledge
 *
 * POST — mark a notification as acknowledged (coach has seen it / acted).
 * Acknowledged notifications stay in the table for the calibration loop
 * but stop appearing in the unacknowledged feed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabase();
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });

  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const userId = userRes.user.id;

  const { data: prof } = await supabase
    .from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  }

  // Verify the notification belongs to coach's team before acknowledging
  const { data: notif } = await supabase
    .from("coach_notifications")
    .select("id, team_id")
    .eq("id", id)
    .maybeSingle();
  if (!notif || notif.team_id !== prof?.team_id) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from("coach_notifications")
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: userId,
    })
    .eq("id", id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
