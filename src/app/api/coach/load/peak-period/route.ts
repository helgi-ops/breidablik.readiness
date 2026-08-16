/**
 * GET /api/coach/load/peak-period?player=<uuid>
 *
 * The player's power curve: the peak (worst) rolling window at each length (1/3/5 min …)
 * per metric, from `player_load_peak_period` (populated by the peak-period upload). Returns
 * the latest session's curves overlaid on the player's season-best curve, benchmarked vs
 * squad — computed by the pure lib `computePeakPeriod`. Descriptive load context only — it
 * never touches the readiness colour, the load target, or the daily decision.
 *
 * If the peak-period table has no rows yet (the export hasn't been imported), the read is
 * empty and `dataCoverage.sessions === 0` — the caller should fall back to the peak-intensity
 * proxy (`/api/coach/player/[id]/peak-demands`).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { fetchAllPages } from "@/lib/supabasePaginate";
import { computePeakPeriod, type PeakPeriodRow } from "@/lib/micropulse/load/peakPeriod";
import { classifyCurveShape, type CurveShapeRead } from "@/lib/micropulse/load/curveShape";

export const runtime = "nodejs";

type Row = {
  date: string;
  window_min: number | null;
  metric: string | null;
  value: number | null;
  unit: string | null;
};

export async function GET(req: NextRequest) {
  const playerId = new URL(req.url).searchParams.get("player");
  if (!playerId) return NextResponse.json({ error: "Missing player" }, { status: 400 });

  const sb = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return NextResponse.json({ error: "Coach not linked to a team" }, { status: 400 });

  // The player must belong to the coach's team.
  const { data: player } = await sb.from("players").select("id, team_id, full_name").eq("id", playerId).maybeSingle();
  if (!player || (player as { team_id?: string }).team_id !== teamId) {
    return NextResponse.json({ error: "Player not on your team" }, { status: 404 });
  }

  const raw = await fetchAllPages<Row>((from, to) =>
    sb
      .from("player_load_peak_period")
      .select("date, window_min, metric, value, unit")
      .eq("player_id", playerId)
      .order("date", { ascending: true })
      .range(from, to),
  );

  const rows: PeakPeriodRow[] = (raw ?? [])
    .filter((r) => r && typeof r.date === "string" && typeof r.metric === "string" && r.window_min != null)
    .map((r) => ({
      date: r.date,
      windowMin: Number(r.window_min),
      metric: String(r.metric),
      value: typeof r.value === "number" && Number.isFinite(r.value) ? r.value : null,
      unit: r.unit ?? null,
    }));

  const read = computePeakPeriod(rows);
  // Per-metric curve shape (Explosive / Engine / Under-conditioned) off the season-best curve.
  const shapes: Record<string, CurveShapeRead> = {};
  for (const curve of read.seasonBest) shapes[curve.metric] = classifyCurveShape(curve);

  return NextResponse.json({
    ok: true,
    hasData: read.dataCoverage.sessions > 0 && read.seasonBest.length > 0,
    name: (player as { full_name?: string | null }).full_name ?? null,
    peakPeriod: read,
    shapes,
  });
}
