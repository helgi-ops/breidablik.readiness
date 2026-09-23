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
