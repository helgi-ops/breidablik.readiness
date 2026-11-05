/**
 * /api/coach/session-enough?date=YYYY-MM-DD
 *
 * GET — "Did we do enough?" for ONE session date of the coach's team (the Post-Training PDF reads
 * this; the on-screen page gets the same object inside /api/coach/post-training). Rules decide;
 * descriptive only — never the readiness colour.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadSessionEnough } from "@/lib/micropulse/sessionEnough/loader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = prof?.team_id as string | null;
  if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });

  try {
    const enough = await loadSessionEnough(sb, teamId, date);
    return NextResponse.json({ ok: true, enough });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
