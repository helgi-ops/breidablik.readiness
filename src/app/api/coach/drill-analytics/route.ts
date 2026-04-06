export const runtime = "nodejs";

/**
 * /api/coach/drill-analytics
 *
 * GET — returns drill usage analytics for a team
 *       ?team_id=...
 *
 * Aggregates drill usage from saved_sessions.items JSONB array.
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

type DrillUsage = {
  drill_id: string;
  drill_name: string;
  times_used: number;
  total_sets: number;
  last_used: string;
  sessions: string[]; // session names
};

export async function GET(req: NextRequest) {
  try {
    const teamId = req.nextUrl.searchParams.get("team_id");
    if (!teamId) {
      return NextResponse.json({ ok: false, error: "team_id is required" }, { status: 400 });
    }

    // Auth check
    const supabase = getSupabase();
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return NextResponse.json({ ok: false, error: "Missing auth" }, { status: 401 });

    const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userRes?.user)
      return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });

    // Fetch all saved sessions for the team
    const { data: sessions, error } = await supabase
      .from("saved_sessions")
      .select("id, session_name, items, created_at")
      .eq("team_id", teamId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Aggregate drill usage
    const usageMap = new Map<string, DrillUsage>();

    for (const session of sessions ?? []) {
      const items = session.items as Array<{ drill_id?: string; drill_name?: string; sets?: number }> | null;
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const drillId = item.drill_id ?? item.drill_name ?? "unknown";
        const drillName = item.drill_name ?? drillId;
        const sets = typeof item.sets === "number" ? item.sets : 1;

        const existing = usageMap.get(drillId);
        if (existing) {
          existing.times_used += 1;
          existing.total_sets += sets;
          if (!existing.sessions.includes(session.session_name ?? ""))
            existing.sessions.push(session.session_name ?? "");
          // Update last_used if this session is newer
          if (session.created_at > existing.last_used) existing.last_used = session.created_at;
        } else {
          usageMap.set(drillId, {
            drill_id: drillId,
            drill_name: drillName,
            times_used: 1,
            total_sets: sets,
            last_used: session.created_at,
            sessions: [session.session_name ?? ""],
          });
        }
      }
    }

    // Sort by times_used descending
    const analytics = Array.from(usageMap.values()).sort((a, b) => b.times_used - a.times_used);

    return NextResponse.json({
      ok: true,
      total_sessions: (sessions ?? []).length,
      total_unique_drills: analytics.length,
      drills: analytics,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
