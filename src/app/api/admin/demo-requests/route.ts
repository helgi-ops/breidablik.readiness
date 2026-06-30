export const runtime = "nodejs";

/**
 * /api/admin/demo-requests
 *
 * GET — list inbound leads captured from the public demo form.
 *       Admin-only (profiles.role === 'admin').
 *       Supports ?status=... to filter; default excludes 'spam'.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";


const ALLOWED_STATUSES = [
  "new",
  "contacted",
  "meeting_scheduled",
  "pilot",
  "won",
  "lost",
  "spam",
] as const;

async function requireAdmin(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Vantar auðkenningu", status: 401 };

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Ógilt token", status: 401 };

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .maybeSingle();

  const role = String(prof?.role ?? "").toLowerCase();
  if (role !== "admin") return { error: "Aðeins admin", status: 403 };

  return { userId: userRes.user.id, supabase };
}

export async function GET(req: NextRequest) {
  const ctx = await requireAdmin(req);
  if ("error" in ctx)
    return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

  const statusParam = req.nextUrl.searchParams.get("status");

  let query = ctx.supabase
    .from("demo_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (statusParam && (ALLOWED_STATUSES as readonly string[]).includes(statusParam)) {
    query = query.eq("status", statusParam);
  } else {
    query = query.neq("status", "spam");
  }

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Simple per-status counts (for summary strip in UI)
  const { data: counts } = await ctx.supabase
    .from("demo_requests")
    .select("status")
    .limit(5000);

  const byStatus: Record<string, number> = {};
  for (const row of counts ?? []) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  }

  return NextResponse.json({ ok: true, requests: data ?? [], byStatus });
}
