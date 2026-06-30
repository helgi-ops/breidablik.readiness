/**
 * /api/coach/player/[id]/robustness
 *
 * GET  — the player's individualised robustness plan: his dominant load demands
 *        (z-scored vs the squad) + any L/R change-of-direction asymmetry, each
 *        matched to capacity-building drills, PLUS the drills already assigned
 *        to him. Capacity-building keyed to HIS load — not Unfamiliar Load.
 *
 * POST — assign / unassign a catalog drill for the player.
 *        Body: { drill_id, quality?, reason?, active? }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import {
  buildRobustnessPlan, playerQualityMeans, squadStats, type DayRow,
} from "@/lib/micropulse/robustness/engine";
import { drillById, type LoadQuality } from "@/lib/micropulse/robustness/catalog";

export const runtime = "nodejs";

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
  return { sb, teamId, userId: userRes.user.id } as const;
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

  // Squad rows (team, active players) over the window — for z-scoring + the
  // target player's own rows.
  const { data: teamPlayers } = await sb.from("players").select("id").eq("team_id", teamId).eq("is_active", true);
  const ids = ((teamPlayers ?? []) as Array<{ id: string }>).map((p) => p.id);
  const { data: rows } = await sb
    .from("player_external_load_daily")
    .select(SELECT)
    .in("player_id", ids.length ? ids : [playerId])
    .gte("date", windowStart)
    .lte("date", today);

  const byPlayer = new Map<string, DayRow[]>();
  for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
    const pid = String(r.player_id);
    const arr = byPlayer.get(pid) ?? [];
    arr.push(toDayRow(r));
    byPlayer.set(pid, arr);
  }

  const allMeans = Array.from(byPlayer.values()).map(playerQualityMeans);
  const squad = squadStats(allMeans);
  const playerRows = byPlayer.get(playerId) ?? [];
  const plan = buildRobustnessPlan(playerRows, playerQualityMeans(playerRows), squad);

  const { data: assigned } = await sb
    .from("player_robustness_assignments")
    .select("drill_id, quality, reason, active")
    .eq("player_id", playerId)
    .eq("active", true);
  const assignedIds = new Set(((assigned ?? []) as Array<{ drill_id: string }>).map((x) => x.drill_id));

  return NextResponse.json({
    ok: true,
    player: { id: playerId, name: (player as { full_name?: string }).full_name ?? null },
    plan,
    assignedDrillIds: Array.from(assignedIds),
    note: "Capacity-building keyed to the player's own load demands + asymmetry. Distinct from Unfamiliar Load.",
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const a = await auth(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, teamId, userId } = a;

  const { data: player } = await sb.from("players").select("id").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return NextResponse.json({ error: "Player not on your team" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const drillId = String(body?.drill_id ?? "");
  const drill = drillById(drillId);
  if (!drill) return NextResponse.json({ error: "Unknown drill" }, { status: 400 });
  const active = body?.active === false ? false : true;
  const quality = (body?.quality != null ? String(body.quality) : drill.quality) as LoadQuality | "asymmetry";
  const reason = body?.reason != null ? String(body.reason).slice(0, 500) : null;

  const { error } = await sb
    .from("player_robustness_assignments")
    .upsert({
      team_id: teamId, player_id: playerId, drill_id: drillId,
      quality, reason, assigned_by: userId, active, updated_at: new Date().toISOString(),
    }, { onConflict: "player_id,drill_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, drill_id: drillId, active });
}
