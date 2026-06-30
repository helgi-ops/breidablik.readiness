export const runtime = "nodejs";

/**
 * POST /api/coach/drill-library/[id]/claim
 *
 * Copies a team-owned or public drill into the caller's personal
 * coach library (owner_type='coach', owner_coach_id=caller).
 * The caller must be able to SEE the source drill — either they're
 * on the team that owns it, or it's a public template.
 *
 * Use case: coach finds a drill shared at the team level and wants
 * a personal copy they can take to the next club.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token)
    return NextResponse.json(
      { ok: false, error: "Vantar auðkenningu" },
      { status: 401 },
    );

  const supabase = getSupabase();
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user)
    return NextResponse.json({ ok: false, error: "Ógilt token" }, { status: 401 });

  const userId = userRes.user.id;

  // Fetch source drill (service role so we can read even if RLS would block —
  // we do the access check ourselves below).
  const { data: src, error: srcErr } = await supabase
    .from("drill_library")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (srcErr)
    return NextResponse.json({ ok: false, error: srcErr.message }, { status: 500 });
  if (!src)
    return NextResponse.json({ ok: false, error: "Drilla fannst ekki" }, { status: 404 });

  // Access check:
  //  - public → ok
  //  - team   → caller must be on that team (coach_teams)
  //  - coach  → already owned by caller? refuse no-op; otherwise refuse
  if (src.owner_type === "coach") {
    if (src.owner_coach_id === userId) {
      return NextResponse.json(
        { ok: false, error: "Drillan er þegar í þínu safni" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Þessi drilla er í persónulegu safni annars þjálfara" },
      { status: 403 },
    );
  }

  if (src.owner_type === "team") {
    const { data: coachRow } = await supabase
      .from("coach_teams")
      .select("team_id")
      .eq("coach_id", userId)
      .eq("team_id", src.team_id)
      .maybeSingle();
    if (!coachRow)
      return NextResponse.json(
        { ok: false, error: "Þú hefur ekki aðgang að þessu liði" },
        { status: 403 },
      );
  }
  // owner_type === 'public' → no check needed

  // Build the insert. Copy all content fields but force coach-ownership.
  // Exclude system columns AND generated columns (field_area_m2, area_per_player_m2).
  const {
    id: _oldId,
    team_id: _oldTeam,
    owner_type: _oldOwner,
    owner_coach_id: _oldCoach,
    created_at: _ca,
    updated_at: _ua,
    deleted_at: _da,
    created_by: _cb,
    field_area_m2: _genArea,
    area_per_player_m2: _genAreaPP,
    ...copyable
  } = src as Record<string, unknown>;

  // parent_template_id has a FK to drill_library_public, so only keep it
  // when the source drill itself came from a public template. For team or
  // coach drills the original parent_template_id (if any) is already in
  // copyable; for drills that never came from a public template it's null.
  // We must NOT set it to src.id (which lives in drill_library, not
  // drill_library_public).
  const payload = {
    ...copyable,
    team_id: null,
    owner_type: "coach" as const,
    owner_coach_id: userId,
    // Keep original parent_template_id if it was already set (from a public
    // template copy chain), otherwise null. Never point at drill_library rows.
    parent_template_id: (copyable as Record<string, unknown>).parent_template_id ?? null,
    source: "coach",
    created_by: userId,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("drill_library")
    .insert(payload)
    .select()
    .single();

  if (insErr)
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, drill: inserted });
}
