export const runtime = "nodejs";

/**
 * /api/public/drill-library
 *
 * GET — list research-backed drill templates (read-only for any authenticated user)
 *       Supports ?category=... & ?q=... & ?tag=...
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

const CATEGORIES = [
  // Football
  "possession",
  "ssg",
  "transition",
  "running",
  "finishing",
  // Basketball
  "shooting",
  "fast_break",
  "half_court_offense",
  "defense",
  "conditioning",
  // Shared
  "warmup",
  "other",
] as const;

async function authUser(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Vantar auðkenningu", status: 401 };
  const { data: userRes, error } = await supabase.auth.getUser(token);
  if (error || !userRes?.user) return { error: "Ógilt token", status: 401 };
  return { userId: userRes.user.id };
}

export async function GET(req: NextRequest) {
  const authRes = await authUser(req);
  if ("error" in authRes)
    return NextResponse.json({ ok: false, error: authRes.error }, { status: authRes.status });

  const supabase = getSupabase();
  const category = req.nextUrl.searchParams.get("category");
  const q = req.nextUrl.searchParams.get("q");
  const tag = req.nextUrl.searchParams.get("tag");
  const sport = req.nextUrl.searchParams.get("sport"); // 'football' | 'basketball'

  let query = supabase
    .from("drill_library_public")
    .select("*")
    .order("category", { ascending: true })
    .order("drill_name", { ascending: true });

  if (sport && ["football", "basketball"].includes(sport)) {
    query = query.eq("sport", sport);
  }
  if (category && (CATEGORIES as readonly string[]).includes(category)) {
    query = query.eq("category", category);
  }
  if (q) {
    const like = `%${q}%`;
    query = query.or(`drill_name.ilike.${like},description.ilike.${like}`);
  }
  if (tag) {
    query = query.contains("tags", [tag]);
  }

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, templates: data ?? [] });
}
