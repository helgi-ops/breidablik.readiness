/**
 * GET /api/recovery-protocols
 *
 * Returns the active recovery protocol library. Authenticated users only.
 * Optional query: ?category=post_match | md_plus_1 | pre_match | travel | general
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import type { RecoveryProtocol, RecoveryProtocolCategory } from "@/lib/recovery/types";

export const runtime = "nodejs";


const ALLOWED_CATEGORIES: ReadonlyArray<RecoveryProtocolCategory> = [
  "post_match",
  "md_plus_1",
  "pre_match",
  "travel",
  "general",
  "rehab",
];

export async function GET(req: NextRequest) {
  const supabase = getSupabase();

  // Auth required (any authenticated user — players, coaches, admins)
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  }
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // A team-scoped protocol (team_id set) is only offered to that team; global
  // protocols (team_id NULL) are offered to everyone. This mirrors the coach
  // reference page's Breiðablik gate, enforced at the data layer.
  const { data: prof } = await supabase
    .from("profiles").select("team_id").eq("id", userRes.user.id).maybeSingle();
  const viewerTeamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;

  const url = new URL(req.url);
  const categoryParam = url.searchParams.get("category");
  const category =
    categoryParam && (ALLOWED_CATEGORIES as ReadonlyArray<string>).includes(categoryParam)
      ? (categoryParam as RecoveryProtocolCategory)
      : null;

  let query = supabase
    .from("recovery_protocols")
    .select(
      "id, slug, title, category, evidence_tier, duration_min, when_to_use, goal, trigger_hint, sections, citations, active, evidence_note",
    )
    .eq("active", true)
    .order("category", { ascending: true })
    .order("title", { ascending: true });

  // Global protocols, plus this viewer's own team-scoped ones.
  query = viewerTeamId
    ? query.or(`team_id.is.null,team_id.eq.${viewerTeamId}`)
    : query.is("team_id", null);

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    protocols: (data ?? []) as RecoveryProtocol[],
  });
}
