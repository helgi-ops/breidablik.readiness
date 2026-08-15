export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/load/peak-period?player=<id>  (GET)
 *
 * The player's power curve from `player_load_peak_period` — the latest session's curves +
 * his season-best per metric (peakPeriod.ts), plus the Explosive/Engine/Under-conditioned
 * shape read (curveShape.ts) per metric. Empty (`hasData:false`) until a Catapult peak-period
 * export is ingested via /api/coach/load/peak-period/upload. Descriptive load context — it
 * never touches the readiness colour, the load target, or the daily decision. Coach/team-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { computePeakPeriod, type PeakPeriodRow } from "@/lib/micropulse/load/peakPeriod";
import { classifyCurveShape, type CurveShapeRead } from "@/lib/micropulse/load/curveShape";

type Row = { date: string; window_min: number | string; metric: string; value: number | string | null; unit: string | null };

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

  const playerId = String(new URL(req.url).searchParams.get("player") ?? "").trim();
  if (!playerId) return NextResponse.json({ ok: false, error: "player is required" }, { status: 400 });
  const { data: player } = await sb.from("players").select("id, full_name, position").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return NextResponse.json({ ok: false, error: "Player not on your team" }, { status: 403 });
  const p = player as { id: string; full_name: string | null; position: string | null };

  const raw = await fetchAllPages<Row>((from, to) => sb
    .from("player_load_peak_period")
    .select("date, window_min, metric, value, unit")
    .eq("player_id", playerId)
    .order("date", { ascending: true })
    .range(from, to));

  const rows: PeakPeriodRow[] = (raw ?? []).map((r) => ({
    date: String(r.date),
    windowMin: Number(r.window_min),
    metric: String(r.metric),
    value: r.value == null ? null : Number(r.value),
    unit: r.unit,
  }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, player_id: playerId, name: p.full_name, position: p.position, hasData: false });
  }

  const peakPeriod = computePeakPeriod(rows);
  // Shape read per metric from the season-best curve (retention only; squad benchmark TODO).
  const shapes: Record<string, CurveShapeRead> = {};
  for (const curve of peakPeriod.seasonBest) shapes[curve.metric] = classifyCurveShape(curve);

  return NextResponse.json({
    ok: true,
    player_id: playerId,
    name: p.full_name,
    position: p.position,
    hasData: true,
    peakPeriod,
    shapes,
    note: "Power curve (peak value vs rolling window) from the Catapult peak-period export. Descriptive load context — never touches the readiness verdict or the daily plan.",
  });
}
