export const runtime = "nodejs";

/**
 * /api/coach/load-factors
 *
 * The team's Mohr multiplying-factor overrides for the four-category drill/session load
 * profile (drillLoadProfile.ts). One row per team; absent → the defaults.
 *
 *   GET  ?team_id=...  → { ok, factors, custom }  (factors always fully populated via merge)
 *   PUT  { team_id?, factors } → saves the merged factors (coach/admin/staff of the team)
 *
 * Descriptive coaching config — the factors never touch the readiness colour, the load
 * target, or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { mergeLoadFactors, DEFAULT_LOAD_FACTORS } from "@/lib/micropulse/load/drillLoadProfile";

async function getCoachTeam(req: NextRequest, targetTeamId?: string | null) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing authentication", status: 401 } as const;

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;

  const userId = userRes.user.id;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Insufficient permissions", status: 403 } as const;

  const primaryTeamId = prof?.team_id as string | null;
  if (!primaryTeamId) return { error: "Coach not linked to a team", status: 400 } as const;

  if (!targetTeamId || targetTeamId === primaryTeamId) return { userId, teamId: targetTeamId ?? primaryTeamId, role } as const;

  const { data: coachRow } = await supabase.from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", targetTeamId).maybeSingle();
  if (!coachRow) return { error: "No access to this team", status: 403 } as const;
  return { userId, teamId: targetTeamId, role } as const;
}

export async function GET(req: NextRequest) {
  try {
    const teamId = req.nextUrl.searchParams.get("team_id");
    const auth = await getCoachTeam(req, teamId);
    if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const supabase = getSupabase();
    const { data } = await supabase.from("team_load_factors").select("factors, updated_at").eq("team_id", auth.teamId).maybeSingle();
    const stored = (data as { factors?: unknown } | null)?.factors ?? null;
    return NextResponse.json({
      ok: true,
      factors: mergeLoadFactors(stored),
      defaults: DEFAULT_LOAD_FACTORS,
      custom: stored != null,
      updatedAt: (data as { updated_at?: string } | null)?.updated_at ?? null,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = await getCoachTeam(req, body?.team_id ?? null);
    if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    // Merge over defaults BEFORE persisting → the stored blob is always complete + valid.
    const factors = mergeLoadFactors(body?.factors);
    const supabase = getSupabase();
    const { error } = await supabase
      .from("team_load_factors")
      .upsert({ team_id: auth.teamId, factors, updated_by: auth.userId }, { onConflict: "team_id" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, factors, custom: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
