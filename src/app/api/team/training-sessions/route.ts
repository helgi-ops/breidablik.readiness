export const runtime = "nodejs";

/**
 * /api/team/training-sessions
 *
 * GET — list PUBLISHED training sessions for the authenticated user's team.
 *       Returns drill names + focus points + target player-load + a denormalised
 *       drill list that includes diagram_url pulled from drill_library so the
 *       mobile UI can render the diagrams without a second round-trip.
 *
 *       Query params:
 *         ?range=upcoming (default) — sessions with session_date >= today, plus null-date
 *         ?range=today              — only session_date = today
 *         ?range=all                — every published session (recent first)
 *         ?id=<uuid>                — a single published session by id (team-scoped);
 *                                     overrides range. Returns it in `sessions[0]`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";


function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type SessionItem = { drill_id?: string; drill_name?: string; sets?: number };

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();

    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token)
      return NextResponse.json({ ok: false, error: "Missing authentication" }, { status: 401 });

    const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
    if (uErr || !userRes?.user)
      return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });

    const userId = userRes.user.id;
    const { data: prof } = await supabase
      .from("profiles")
      .select("team_id")
      .eq("id", userId)
      .maybeSingle();

    const teamId = prof?.team_id as string | null;
    if (!teamId)
      return NextResponse.json({ ok: false, error: "No team" }, { status: 400 });

    const range = (req.nextUrl.searchParams.get("range") || "upcoming").toLowerCase();
    const idParam = req.nextUrl.searchParams.get("id");
    const today = todayIso();

    let query = supabase
      .from("saved_sessions")
      .select(
        "id, session_name, md_day, target_pl, items, totals, session_date, focus_points, published_at, created_at, updated_at"
      )
      .eq("team_id", teamId)
      .is("deleted_at", null)
      .not("published_at", "is", null);

    if (idParam) {
      // Single session by id — still team-scoped + published, so a player can
      // only ever open a session belonging to their own team.
      query = query.eq("id", idParam);
    } else if (range === "today") {
      query = query.eq("session_date", today).order("updated_at", { ascending: false });
    } else if (range === "upcoming") {
      // published sessions dated today or later, plus undated ones (treated as always-available)
      query = query
        .or(`session_date.gte.${today},session_date.is.null`)
        .order("session_date", { ascending: true, nullsFirst: false })
        .order("updated_at", { ascending: false });
    } else {
      query = query
        .order("session_date", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false });
    }

    const { data: sessions, error } = await query;
    if (error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Collect every drill_id referenced by any session so we can fetch diagram_url + description in one shot.
    const drillIds = new Set<string>();
    for (const s of sessions ?? []) {
      const items = (s.items as SessionItem[] | null) ?? [];
      for (const it of items) if (it?.drill_id) drillIds.add(String(it.drill_id));
    }

    const drillMap: Record<
      string,
      { id: string; drill_name: string; category: string | null; diagram_url: string | null; description: string | null }
    > = {};

    if (drillIds.size > 0) {
      const { data: drills } = await supabase
        .from("drill_library")
        .select("id, drill_name, category, diagram_url, description")
        .in("id", Array.from(drillIds));
      for (const d of drills ?? []) drillMap[d.id] = d;
    }

    // Denormalise items with diagram_url/description so the mobile client can render immediately.
    const enriched = (sessions ?? []).map((s) => {
      const items = ((s.items as SessionItem[] | null) ?? []).map((it) => {
        const info = it.drill_id ? drillMap[String(it.drill_id)] : undefined;
        return {
          drill_id: it.drill_id ?? null,
          drill_name: it.drill_name ?? info?.drill_name ?? "",
          sets: it.sets ?? 1,
          category: info?.category ?? null,
          diagram_url: info?.diagram_url ?? null,
          description: info?.description ?? null,
        };
      });
      return { ...s, items };
    });

    return NextResponse.json({ ok: true, sessions: enriched });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
