/**
 * /api/coach/player/[id]/football-drills
 *
 * GET — individualised football drills for a player: drills from drill_library
 * whose MEASURED per-player demand profile fills his gaps (qualities he's light
 * on vs the squad) or rehearses his dominant demands. On-pitch sibling of the
 * robustness recommender; covers sprint / accel / decel (the qualities the drill
 * data measures). Read-only suggestions; the coach plans the session.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildRobustnessPlan, playerQualityMeans, squadStats, type DayRow } from "@/lib/micropulse/robustness/engine";
import { recommendFootballDrills, type DrillRow, type PlayerDemand } from "@/lib/micropulse/footballDrills/recommend";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
function addDaysISO(iso: string, n: number) { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

async function auth(req: NextRequest) {
  const sb = getSupabase();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
  if (!teamId) return { error: "No team", status: 400 } as const;
  return { sb, teamId } as const;
}

const SELECT = "player_id, date, jumps, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, velocity_band5_total_distance, velocity_band6_total_distance, ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low";

function toDayRow(r: Record<string, unknown>): DayRow {
  const codLeft = num(r.ima_cod_left_high) + num(r.ima_cod_left_medium) + num(r.ima_cod_left_low);
  const codRight = num(r.ima_cod_right_high) + num(r.ima_cod_right_medium) + num(r.ima_cod_right_low);
  return {
    date: String(r.date),
    decel: num(r.decel_b2_3_tot_effs_gen2),
    cod: codLeft + codRight,
    sprint: num(r.velocity_band5_total_distance) + num(r.velocity_band6_total_distance),
    jumps: num(r.jumps),
    accel: num(r.accel_b2_3_tot_effs_gen2),
    codLeft, codRight,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const a = await auth(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, teamId } = a;

  const { data: player } = await sb.from("players").select("id, full_name").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return NextResponse.json({ error: "Player not on your team" }, { status: 403 });

  const today = new Date().toISOString().slice(0, 10);
  const windowStart = addDaysISO(today, -34);

  // Squad + player load rows → player demand profile (same engine as robustness).
  const { data: teamPlayers } = await sb.from("players").select("id").eq("team_id", teamId).eq("is_active", true);
  const ids = ((teamPlayers ?? []) as Array<{ id: string }>).map((p) => p.id);
  const { data: rows } = await sb
    .from("player_external_load_daily").select(SELECT)
    .in("player_id", ids.length ? ids : [playerId])
    .gte("date", windowStart).lte("date", today);

  const byPlayer = new Map<string, DayRow[]>();
  for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
    const pid = String(r.player_id);
    const arr = byPlayer.get(pid) ?? []; arr.push(toDayRow(r)); byPlayer.set(pid, arr);
  }
  const squad = squadStats(Array.from(byPlayer.values()).map(playerQualityMeans));
  const playerRows = byPlayer.get(playerId) ?? [];
  const plan = buildRobustnessPlan(playerRows, playerQualityMeans(playerRows), squad);
  const demands: PlayerDemand[] = plan.demands.map((d) => ({ quality: d.quality, value: d.value, z: d.z }));

  // Drill library (team + global), with measured demand columns.
  const { data: drillRows } = await sb
    .from("drill_library")
    .select("id, drill_name, category, drill_format, total_players, duration_min, field_length_m, field_width_m, vel_b5, vel_b6, decel_b23, accel_b23, player_load_per_min, diagram_url, team_id, deleted_at")
    .is("deleted_at", null)
    .or(`team_id.eq.${teamId},team_id.is.null`);

  const drills = (drillRows ?? []) as unknown as DrillRow[];
  const recommendations = recommendFootballDrills(demands, drills);

  return NextResponse.json({
    ok: true,
    player: { id: playerId, name: (player as { full_name?: string }).full_name ?? null },
    demands,
    recommendations,
    confident: plan.confident,
    trainingDays: plan.trainingDays,
    note: "Football drills matched to the player's own measured demand profile (gap + dominant). On-pitch sibling of the robustness recommender.",
  });
}
