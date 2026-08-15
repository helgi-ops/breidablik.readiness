export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/load/peak-capacity?player=<id>[&date=YYYY-MM-DD]  (GET)
 *
 * "% of peak capacity" for each drill/period of a session, vs the player's own duration-
 * matched peak (peakCapacity.ts). The ceiling is the PROXY reference built from his drill
 * history (player_drill_load) — live on data we hold — and upgrades to the true power curve
 * when a Catapult peak-period export is ingested. Defaults to his latest session.
 * Descriptive load context — never touches readiness. Coach/team-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { buildCapacityReference, scoreSessionDrills, type DrillLoad } from "@/lib/micropulse/load/peakCapacity";
import { isSessionTotalName } from "@/lib/micropulse/drillActuals";

type DrillRow = { session_date: string; period_name: string | null; period_order: number | null; player_load_per_min: number | string | null; duration_min: number | string | null };

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ ok: false, error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ ok: false, error: "Coach role required" }, { status: 403 });
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return NextResponse.json({ ok: false, error: "No team" }, { status: 400 });

  const url = new URL(req.url);
  const playerId = String(url.searchParams.get("player") ?? "").trim();
  const wantDate = String(url.searchParams.get("date") ?? "").trim() || null;
  if (!playerId) return NextResponse.json({ ok: false, error: "player is required" }, { status: 400 });
  const { data: player } = await sb.from("players").select("id, full_name, position").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return NextResponse.json({ ok: false, error: "Player not on your team" }, { status: 403 });
  const p = player as { id: string; full_name: string | null; position: string | null };

  const raw = await fetchAllPages<DrillRow>((from, to) => sb
    .from("player_drill_load")
    .select("session_date, period_name, period_order, player_load_per_min, duration_min")
    .eq("player_id", playerId)
    .order("session_date", { ascending: false })
    .range(from, to));

  // Exclude the whole-session total rows — they aren't a "drill".
  const drills = (raw ?? []).filter((r) => !isSessionTotalName(r.period_name));
  if (drills.length === 0) {
    return NextResponse.json({ ok: true, player_id: playerId, name: p.full_name, position: p.position, hasData: false });
  }

  // The player's whole-history reference (duration-matched peak per minute).
  const history: DrillLoad[] = drills.map((r) => ({
    durationMin: r.duration_min == null ? null : Number(r.duration_min),
    valuePerMin: r.player_load_per_min == null ? null : Number(r.player_load_per_min),
  }));
  const reference = buildCapacityReference(history);

  const sessionDate = wantDate ?? String(drills[0].session_date);
  const sessionRows = drills
    .filter((r) => String(r.session_date) === sessionDate)
    .sort((a, b) => (a.period_order ?? 0) - (b.period_order ?? 0));
  const sessionDrills: DrillLoad[] = sessionRows.map((r) => ({
    durationMin: r.duration_min == null ? null : Number(r.duration_min),
    valuePerMin: r.player_load_per_min == null ? null : Number(r.player_load_per_min),
    label: r.period_name,
    date: String(r.session_date),
  }));
  const scored = scoreSessionDrills(sessionDrills, reference);

  const sessionDates = [...new Set(drills.map((r) => String(r.session_date)))].slice(0, 30);

  return NextResponse.json({
    ok: true,
    player_id: playerId,
    name: p.full_name,
    position: p.position,
    hasData: true,
    sessionDate,
    sessionDates,
    referenceDrills: reference.drills,
    proxy: true, // ceiling is the drill-history proxy until a peak-period export lands
    drills: scored,
    note: "% of peak capacity per drill vs his own duration-matched peak (proxy from drill history). Descriptive — never touches the readiness verdict or the daily plan.",
  });
}
