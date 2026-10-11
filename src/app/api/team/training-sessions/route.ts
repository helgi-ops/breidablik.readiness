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
      .select("team_id, role, player_id")
      .eq("id", userId)
      .maybeSingle();

    const teamId = prof?.team_id as string | null;
    if (!teamId)
      return NextResponse.json({ ok: false, error: "No team" }, { status: 400 });

    // Who is viewing? Coaches/staff see every published session regardless of
    // targeting; a player sees only sessions aimed at the whole team or at them.
    const role = String(prof?.role ?? "").toUpperCase();
    const isStaff = ["COACH", "ADMIN", "STAFF"].includes(role);
    let viewerPlayerId: string | null = (prof?.player_id as string | null) ?? null;
    if (!isStaff && !viewerPlayerId) {
      const { data: pl } = await supabase
        .from("players")
        .select("id")
        .eq("team_id", teamId)
        .eq("user_id", userId)
        .maybeSingle();
      viewerPlayerId = (pl?.id as string | null) ?? null;
    }

    const range = (req.nextUrl.searchParams.get("range") || "upcoming").toLowerCase();
    const idParam = req.nextUrl.searchParams.get("id");
    const today = todayIso();

    let query = supabase
      .from("saved_sessions")
      .select(
        "id, session_name, md_day, target_pl, items, totals, session_date, focus_points, recipient_player_ids, groups, published_at, created_at, updated_at"
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

    const { data: sessionsRaw, error } = await query;
    if (error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Recipient targeting: a session with a non-empty recipient list is only
    // visible to the players on it (staff see all). Whole-team sessions (null/
    // empty) stay visible to everyone, exactly as before this feature.
    const sessions = (sessionsRaw ?? []).filter((s) => {
      const recip = (s as { recipient_player_ids?: string[] | null }).recipient_player_ids;
      if (!Array.isArray(recip) || recip.length === 0) return true; // whole team
      if (isStaff) return true;
      return viewerPlayerId != null && recip.includes(viewerPlayerId);
    });

    // Collect every drill_id referenced by any session so we can fetch diagram_url + description in one shot.
    const drillIds = new Set<string>();
    for (const s of sessions ?? []) {
      const items = (s.items as SessionItem[] | null) ?? [];
      for (const it of items) if (it?.drill_id) drillIds.add(String(it.drill_id));
    }

    const drillMap: Record<
      string,
      { id: string; drill_name: string; category: string | null; diagram_url: string | null; description: string | null; player_load: number | null }
    > = {};

    if (drillIds.size > 0) {
      const { data: drills } = await supabase
        .from("drill_library")
        .select("id, drill_name, category, diagram_url, description, player_load")
        .in("id", Array.from(drillIds));
      for (const d of drills ?? []) drillMap[d.id] = d as (typeof drillMap)[string];
    }

    // Named-team split: the player sees the WHOLE practice organisation — every team the
    // coach split the squad into, with each team's members. One team per player is flagged
    // `is_you`. (Players still only ever see sessions aimed at them / the whole team — the
    // recipient filter above still applies.)
    type Group = { id?: string; name?: string; player_ids?: string[] };
    const allMemberIds = new Set<string>();
    for (const s of sessions) {
      const groups = (s as { groups?: Group[] | null }).groups;
      if (!Array.isArray(groups)) continue;
      for (const g of groups) for (const id of g.player_ids ?? []) allMemberIds.add(String(id));
    }
    const nameById = new Map<string, string>();
    if (allMemberIds.size > 0) {
      const { data: mates } = await supabase
        .from("players")
        .select("id, full_name")
        .in("id", Array.from(allMemberIds));
      for (const m of mates ?? []) nameById.set(String(m.id), String((m as { full_name?: string }).full_name ?? ""));
    }
    // Per session: the full split (named teams + members) and the viewer's own team (kept for
    // the existing "Your team" summary). A team is only included if it has at least one member.
    type SplitTeam = { name: string; members: { id: string; name: string; is_you: boolean }[] };
    const splitBySession = new Map<string, SplitTeam[]>();
    const yourGroupBySession = new Map<string, { name: string; teammates: string[] }>();
    for (const s of sessions) {
      const groups = (s as { groups?: Group[] | null }).groups;
      if (!Array.isArray(groups) || groups.length === 0) continue;
      const split: SplitTeam[] = [];
      for (const g of groups) {
        const ids = (g.player_ids ?? []).map(String);
        if (ids.length === 0) continue;
        const members = ids.map((id) => ({ id, name: nameById.get(id) ?? "", is_you: viewerPlayerId != null && id === viewerPlayerId }))
          .filter((m) => m.name);
        if (members.length === 0) continue;
        split.push({ name: String(g.name ?? ""), members });
        if (viewerPlayerId != null && ids.includes(viewerPlayerId)) {
          yourGroupBySession.set(String(s.id), {
            name: String(g.name ?? ""),
            teammates: members.filter((m) => !m.is_you).map((m) => m.name),
          });
        }
      }
      if (split.length > 0) splitBySession.set(String(s.id), split);
    }

    // Denormalise items with diagram_url/description so the mobile client can render immediately.
    // Drop recipient_player_ids from the response — it's a coach-side targeting
    // detail, not something a player should receive (don't leak the roster subset).
    const enriched = (sessions ?? []).map((s) => {
      const items = ((s.items as SessionItem[] | null) ?? []).map((it) => {
        const info = it.drill_id ? drillMap[String(it.drill_id)] : undefined;
        const sets = it.sets ?? 1;
        // Planned per-drill Player Load = the drill's planned PL × sets (mirrors the coach
        // builder's totals). null when the drill has no planned PL yet.
        const plannedLoad = info?.player_load != null ? Math.round(info.player_load * sets) : null;
        return {
          drill_id: it.drill_id ?? null,
          drill_name: it.drill_name ?? info?.drill_name ?? "",
          sets,
          category: info?.category ?? null,
          diagram_url: info?.diagram_url ?? null,
          description: info?.description ?? null,
          planned_load: plannedLoad,
        };
      });
      // Strip the coach-side raw targeting (recipient list + raw groups); attach the resolved
      // full team split (names) + the viewer's own team.
      const { recipient_player_ids: _r, groups: _g, ...rest } = s as typeof s & {
        recipient_player_ids?: string[] | null;
        groups?: Group[] | null;
      };
      void _r; void _g;
      const your_group = yourGroupBySession.get(String(s.id)) ?? null;
      const team_split = splitBySession.get(String(s.id)) ?? null;
      return { ...rest, items, your_group, team_split };
    });

    return NextResponse.json({ ok: true, sessions: enriched });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
