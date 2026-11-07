/**
 * /api/coach/team/long-runs?date=YYYY-MM-DD
 *
 * GET — long continuous runs (IMA Free Running bands 5–8 = runs of 18 s or more) per player for one day:
 * number of runs, time in them, longest band, stride length, against each player's own near-full matches.
 * Runs and time come from the inertial sensor and exist indoors; distance and stride length need GPS.
 * Powers the "Long runs" card on /coach/ima-intelligence. Coach-scoped to the authenticated team.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadTeamLongRuns } from "@/lib/micropulse/longRuns/loader";

export const runtime = "nodejs";

async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId, supabase } as const;
}

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const dateParam = new URL(req.url).searchParams.get("date") ?? "";
  const dateIso = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);
  try {
    return NextResponse.json(await loadTeamLongRuns(ctx.supabase, ctx.teamId, dateIso));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
