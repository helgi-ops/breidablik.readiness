/**
 * /api/coach/week-enough?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * GET — the done side of "Did we do enough?" for a week or block of the coach's team: the squad's medians per day
 * (full sessions), for the Periodization Hub to sum against its own plan (sessionEnough/weekEnough). Days after
 * today are not read. Rules decide; descriptive only — never the readiness colour.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadWeekEnoughActuals, MAX_RANGE_DAYS } from "@/lib/micropulse/sessionEnough/rangeLoader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

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

  const sp = new URL(req.url).searchParams;
  const from = sp.get("from") ?? "", toRaw = sp.get("to") ?? "";
  if (!ISO.test(from) || !ISO.test(toRaw) || toRaw < from) return NextResponse.json({ error: "from, to = YYYY-MM-DD required (from ≤ to)" }, { status: 400 });
  const today = new Date().toISOString().slice(0, 10);
  const to = toRaw > today ? today : toRaw;
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 >= MAX_RANGE_DAYS) return NextResponse.json({ error: `At most ${MAX_RANGE_DAYS} days` }, { status: 400 });
  if (to < from) return NextResponse.json({ ok: true, state: "ok", days: [] });

  try {
    const r = await loadWeekEnoughActuals(sb, teamId, from, to);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
