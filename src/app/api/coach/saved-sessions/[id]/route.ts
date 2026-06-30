export const runtime = "nodejs";

/**
 * /api/coach/saved-sessions/[id]
 *
 * PATCH  — update fields on a saved session (creator only).
 *          Supports: { publish: true|false, session_date, focus_points, session_name, md_day }
 *          When `publish` is provided, sets published_at / published_by accordingly.
 * DELETE — soft-delete a saved session (creator only)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";


async function getAuthUser(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing authentication", status: 401 };

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 };

  return { userId: userRes.user.id };
}

/* ── PATCH: update a saved session (publish / metadata) ─────────────── */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthUser(req);
    if ("error" in auth)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => ({}));
    const supabase = getSupabase();

    const { data: existing } = await supabase
      .from("saved_sessions")
      .select("id, created_by, team_id")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing)
      return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });

    if (existing.created_by !== auth.userId) {
      // Allow any coach/admin/staff on the team to publish even if they weren't the creator.
      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id, role")
        .eq("id", auth.userId)
        .maybeSingle();
      const role = String(prof?.role ?? "").toUpperCase();
      if (prof?.team_id !== existing.team_id || !["COACH", "ADMIN", "STAFF"].includes(role))
        return NextResponse.json({ ok: false, error: "No permission to edit this session" }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};

    if (typeof body.session_name === "string") updates.session_name = body.session_name.trim();
    if (typeof body.md_day === "string") updates.md_day = body.md_day.trim();

    if (typeof body.session_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.session_date))
      updates.session_date = body.session_date;
    else if (body.session_date === null) updates.session_date = null;

    if (Array.isArray(body.focus_points))
      updates.focus_points = body.focus_points
        .map((f: unknown) => String(f ?? "").trim())
        .filter(Boolean)
        .slice(0, 8);

    if (body.publish === true) {
      updates.published_at = new Date().toISOString();
      updates.published_by = auth.userId;
    } else if (body.publish === false) {
      updates.published_at = null;
      updates.published_by = null;
    }

    if (Object.keys(updates).length === 0)
      return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });

    const { data, error } = await supabase
      .from("saved_sessions")
      .update(updates)
      .eq("id", id)
      .select(
        "id, session_name, md_day, target_pl, items, totals, created_by, created_at, updated_at, published_at, published_by, session_date, focus_points"
      )
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, session: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

/* ── DELETE: soft-delete a saved session ──────────────────────────────── */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthUser(req);
    if ("error" in auth)
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const supabase = getSupabase();

    // Verify ownership
    const { data: existing } = await supabase
      .from("saved_sessions")
      .select("id, created_by")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!existing)
      return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });

    if (existing.created_by !== auth.userId)
      return NextResponse.json({ ok: false, error: "Only the creator can delete this session" }, { status: 403 });

    const { error } = await supabase
      .from("saved_sessions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
