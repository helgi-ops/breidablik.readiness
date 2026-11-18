/**
 * GET /api/week-phase?week=YYYY-MM-DD (2026-11-18)
 *
 * The season phase of the week holding `week` (default: today) for the caller's OWN team (profiles.team_id —
 * never a param): the coach's saved phase, else the season plan's (rule: weekSetup/weekPhase.ts). Used by the
 * player's Today (which programme rows to read) and Week setup (the Season pill when the coach saved none), so
 * both agree with the strength engine. `phases` = the season-plan phases it used (Week setup only).
 * Any signed-in player or coach; read-only.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { verifiedUserIdFromToken } from "@/lib/auth/verifyAccessToken";
import { resolveWeekPhase } from "@/lib/micropulse/weekSetup/weekPhaseServer";

export const runtime = "nodejs";

const isIso = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const uid = await verifiedUserIdFromToken(sb, token);
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: prof } = await sb.from("profiles").select("team_id").eq("id", uid).maybeSingle();
    const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

    const url = new URL(req.url);
    const week = url.searchParams.get("week");
    const date = isIso(week) ? week : new Date().toISOString().slice(0, 10);
    const withPlan = url.searchParams.get("plan") === "1";
    const r = await resolveWeekPhase(sb, teamId, date, { withPlan });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
