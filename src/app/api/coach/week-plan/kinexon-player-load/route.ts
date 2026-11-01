export const runtime = "nodejs";

/**
 * /api/coach/week-plan/kinexon-player-load — per-player recent (28-day) averages of the
 * distinctive Kinexon variables (Changes of Orientation, Exertions, Mechanical Load) plus
 * Player Load / distance / HSR, for the Week Plan PDF's per-player table on a Kinexon team.
 *
 * The Kinexon variables live in raw_payload_json; we read the blob SERVER-side via the
 * Kinexon catalog and return only compact numbers (never ship the blob to the client — see
 * the raw_payload_json select trap). Returns { isKinexon:false, players:[] } for other teams.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { KINEXON_CATALOG, readKinexonMetric, type KinexonMetric } from "@/lib/integrations/kinexon/metricCatalog";

const BY_KEY: Record<string, KinexonMetric> = {};
for (const g of KINEXON_CATALOG) for (const m of g.metrics) BY_KEY[m.key] = m;

async function requireCoach(req: NextRequest) {
  const sb = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Missing auth", status: 401 as const };
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 as const };
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const p = (prof ?? {}) as { team_id?: string | null; role?: string };
  if (!["COACH", "ADMIN", "STAFF"].includes(String(p.role ?? "").toUpperCase())) return { error: "Coach role required", status: 403 as const };
  if (!p.team_id) return { error: "No team", status: 400 as const };
  return { sb, teamId: p.team_id };
}

export async function GET(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { sb, teamId } = ctx;

  const { data: teamRow } = await sb.from("teams").select("gps_provider").eq("id", teamId).maybeSingle();
  const isKinexon = String((teamRow as { gps_provider?: string | null } | null)?.gps_provider ?? "").toLowerCase() === "kinexon";
  if (!isKinexon) return NextResponse.json({ isKinexon: false, players: [] });

  const since = new Date(Date.now() - 28 * 86_400_000).toISOString().slice(0, 10);
  const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const nameById = new Map(((players ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name ?? "—"]));

  // Recent Kinexon rows — raw_payload_json read here (server), only compact means go back.
  const { data: rows } = await sb.from("player_external_load_daily")
    .select("player_id, total_player_load, total_distance, velocity_band5_total_distance, velocity_band6_total_distance, raw_payload_json")
    .eq("team_id", teamId).eq("source", "kinexon").gte("date", since).limit(1000);

  type Agg = { pl: number[]; dist: number[]; hsr: number[]; coo: number[]; ex: number[]; mech: number[] };
  const agg = new Map<string, Agg>();
  for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
    const pid = r.player_id as string | null;
    if (!pid) continue;
    const a = agg.get(pid) ?? { pl: [], dist: [], hsr: [], coo: [], ex: [], mech: [] };
    const pl = r.total_player_load as number | null;
    const dist = r.total_distance as number | null;
    const v5 = r.velocity_band5_total_distance as number | null;
    const v6 = r.velocity_band6_total_distance as number | null;
    if (typeof pl === "number") a.pl.push(pl);
    if (typeof dist === "number") a.dist.push(dist);
    if (v5 != null || v6 != null) a.hsr.push((v5 ?? 0) + (v6 ?? 0));
    const coo = readKinexonMetric(r, BY_KEY["coo"]); if (coo != null) a.coo.push(coo);
    const ex = readKinexonMetric(r, BY_KEY["exertions"]); if (ex != null) a.ex.push(ex);
    const mech = readKinexonMetric(r, BY_KEY["mech_load"]); if (mech != null) a.mech.push(mech);
    agg.set(pid, a);
  }
  const mean = (xs: number[]): number | null => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const out = [...agg.entries()].map(([pid, a]) => ({
    name: nameById.get(pid) ?? "—",
    pl: mean(a.pl), distance: mean(a.dist), hsr: mean(a.hsr),
    coo: mean(a.coo), exertions: mean(a.ex), mechLoad: mean(a.mech),
  }));
  return NextResponse.json({ isKinexon: true, players: out });
}
