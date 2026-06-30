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

  const url = new URL(req.url);
  const categoryParam = url.searchParams.get("category");
  const category =
    categoryParam && (ALLOWED_CATEGORIES as ReadonlyArray<string>).includes(categoryParam)
      ? (categoryParam as RecoveryProtocolCategory)
      : null;

  let query = supabase
    .from("recovery_protocols")
    .select(
      "id, slug, title, category, evidence_tier, duration_min, when_to_use, goal, trigger_hint, sections, citations, active",
    )
    .eq("active", true)
    .order("category", { ascending: true })
    .order("title", { ascending: true });

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
