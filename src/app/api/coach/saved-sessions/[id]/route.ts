export const runtime = "nodejs";

/**
 * /api/coach/saved-sessions/[id]
 *
 * DELETE — soft-delete a saved session (creator only)
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

async function getAuthUser(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing authentication", status: 401 };

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 };

  return { userId: userRes.user.id };
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
