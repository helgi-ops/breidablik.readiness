/**
 * GET /api/coach/usage-analytics
 *
 * Admin-only. Returns the per-surface usage rollup (page-view counts by route,
 * 7d / 30d / all-time, distinct users, last-used) powering the "what's used /
 * what's dead" view. Reads via get_usage_summary().
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export type UsageRow = {
  path: string;
  total: number;
  last_7d: number;
  last_30d: number;
  distinct_users: number;
  last_used: string | null;
};

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });

  const supabase = getSupabase();
  const { data: userRes } = await supabase.auth.getUser(token);
  const user = userRes?.user;
  if (!user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toLowerCase();
  if (role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("get_usage_summary");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as UsageRow[];
  const totalViews = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
  return NextResponse.json({ rows, totalViews, generatedAt: new Date().toISOString() });
}
