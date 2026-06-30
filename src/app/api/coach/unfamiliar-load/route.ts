/**
 * /api/coach/unfamiliar-load?date=YYYY-MM-DD
 *
 * GET — the "is he still moving like himself?" surface (Unfamiliar Load,
 * docs/unfamiliar-load.md, Phase 1). For each player on the coach's team we
 * compute their Movement Signature drift vs their OWN recent norm and return
 * only the EXCEPTIONS — players drifting outside their usual movement envelope
 * — ranked by magnitude, each with a plain-language headline, a counterfactual
 * and a suggested action. Players moving like themselves never appear.
 *
 * Driver-layer (IMA) complement to the Engine-layer (GPS/ACWR) load plan.
 * Deterministic: the rules (computeMovementSignature) decide; this endpoint
 * only fetches, scopes to the team, and packages the result.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { computeMovementSignature, componentValue, MOVEMENT_COMPONENTS, type MovementDayRow, type GroupBaseline, type ComponentKey, type Bi } from "@/lib/micropulse/movementSignature";

export const runtime = "nodejs";

const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = prof?.team_id as string | null;
  if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const dateParam = url.searchParams.get("date");
  const refDate = dateParam && isIso(dateParam) ? dateParam : today;
  const windowStart = addDaysISO(refDate, -34); // 28-day norm + a little slack

  const { data: players } = await sb.from("players").select("id, full_name, position").eq("team_id", teamId).eq("is_active", true);
  const nameById = new Map<string, string>();
  const posById = new Map<string, string | null>();
  for (const p of (players ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>) {
    nameById.set(String(p.id), p.full_name ?? "Player");
    posById.set(String(p.id), (p.position ?? "").trim() || null);
  }
  const playerIds = Array.from(nameById.keys());
  if (playerIds.length === 0) return NextResponse.json({ ok: true, refDate, items: [], summary: { totalPlayers: 0, drifting: 0, building: 0 } });

  // Daily inertial rows in the window for the squad.
  const { data: rows } = await sb
    .from("player_external_load_daily")
    .select("player_id, date, total_distance, ima_fr_band58_total_distance, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, accel_decel_efforts, high_speed_distance, high_metabolic_load_distance_m")
    .in("player_id", playerIds)
    .gte("date", windowStart)
    .lte("date", refDate);

  // Group rows per player.
  const byPlayer = new Map<string, MovementDayRow[]>();
  for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
    const pid = String(r.player_id);
    const arr = byPlayer.get(pid) ?? [];
    arr.push({
      date: String(r.date),
      totalDistance: num(r.total_distance),
      imaDistance: num(r.ima_fr_band58_total_distance),
      accelEfforts: num(r.accel_b2_3_tot_effs_gen2),
      decelEfforts: num(r.decel_b2_3_tot_effs_gen2),
      accelDecelEfforts: num(r.accel_decel_efforts),
      highSpeedDistance: r.high_speed_distance == null ? null : num(r.high_speed_distance),
      highMetabolicLoadDistance: r.high_metabolic_load_distance_m == null ? null : num(r.high_metabolic_load_distance_m),
    });
    byPlayer.set(pid, arr);
  }

  // Group baselines (Phase 3): bucket granular positions into movement
  // FAMILIES so role norms have enough samples (8 granular roles × ~3 players
  // is too thin; ~5-6 families give a workable distribution). Players with no
  // position fall back to the whole squad ("_squad"). Used as interpretation
  // context, not to flag.
  const FAMILY: Record<string, string> = {
    GK: "GK",
    CB: "DEF_CENTRAL",
    LB: "FULLBACK", RB: "FULLBACK",
    CM: "MID_CENTRAL",
    AM: "ATT_WIDE", LAM: "ATT_WIDE", RAM: "ATT_WIDE",
    CF: "FORWARD",
  };
  const groupKeyOf = (pid: string) => { const p = posById.get(pid); return (p && FAMILY[p]) || "_squad"; };
  const groupAcc = new Map<string, Record<ComponentKey, number[]>>();
  for (const pid of playerIds) {
    const pRows = byPlayer.get(pid);
    if (!pRows) continue;
    const gk = groupKeyOf(pid);
    let acc = groupAcc.get(gk);
    if (!acc) { acc = { multidirectional: [], explosive: [], multidirectional_share: [], decel_share: [], high_speed_share: [], metabolic_share: [] }; groupAcc.set(gk, acc); }
    for (const r of pRows) for (const k of MOVEMENT_COMPONENTS) { const v = componentValue(k, r); if (v != null && Number.isFinite(v)) acc[k].push(v); }
  }
  const meanOf = (xs: number[]) => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
  const sdOf = (xs: number[], m: number) => xs.length < 2 ? 0 : Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
  const groupBaselineCache = new Map<string, GroupBaseline>();
  const groupBaselineOf = (gk: string): GroupBaseline => {
    const cached = groupBaselineCache.get(gk);
    if (cached) return cached;
    const acc = groupAcc.get(gk);
    const gb: GroupBaseline = {};
    if (acc) for (const k of MOVEMENT_COMPONENTS) { const xs = acc[k]; const m = meanOf(xs); gb[k] = { mean: m, sd: sdOf(xs, m), n: xs.length }; }
    groupBaselineCache.set(gk, gb);
    return gb;
  };

  type Item = {
    player_id: string; name: string;
    refDate: string; driftType: string; score: number;
    spike: boolean; peakZ: number;
    headline: Bi | null; why: Bi | null; counterfactual: Bi | null; suggestedAction: Bi | null;
    confident: boolean; calibrating: boolean; baselineDays: number; componentsPresent: number;
    totalDistanceZ: number | null;
    groupLabel: "role" | "squad"; // is the group norm role-specific or squad-wide?
    drivers: Array<{ key: string; label: string; z: number | null; today: number; mean: number; sd: number; n: number; groupZ: number | null; groupMean: number | null; groupSd: number | null }>;
  };

  const items: Item[] = [];
  let building = 0;
  for (const pid of playerIds) {
    const pRows = byPlayer.get(pid);
    if (!pRows || pRows.length === 0) continue;
    const refForPlayer = pRows.reduce((mx, r) => (r.date > mx ? r.date : mx), pRows[0].date);
    const gk = groupKeyOf(pid);
    const sig = computeMovementSignature(pRows, refForPlayer, { groupBaseline: groupBaselineOf(gk) });
    if (sig.baselineDays < 8) { building += 1; continue; }   // not enough norm yet → don't flag
    if (sig.driftType === "none" || sig.drifting.length === 0) continue; // moving like himself
    items.push({
      player_id: pid, name: nameById.get(pid) ?? "Player",
      refDate: sig.date, driftType: sig.driftType, score: sig.score,
      spike: sig.spike, peakZ: sig.peakZ,
      headline: sig.headline, why: sig.why, counterfactual: sig.counterfactual, suggestedAction: sig.suggestedAction,
      confident: sig.confident, calibrating: sig.calibrating, baselineDays: sig.baselineDays, componentsPresent: sig.componentsPresent,
      totalDistanceZ: sig.totalDistanceZ,
      groupLabel: gk === "_squad" ? "squad" : "role",
      drivers: sig.drifting.map((c) => ({ key: c.key, label: c.label, z: c.z, today: c.today, mean: c.mean, sd: c.sd, n: c.n, groupZ: c.groupZ, groupMean: c.groupMean, groupSd: c.groupSd })),
    });
  }
  items.sort((a, b) => b.score - a.score);

  // Suppress flags the coach has already dismissed for this player + ref_date.
  let visible = items;
  let dismissed = 0;
  if (items.length) {
    const { data: dis } = await sb
      .from("unfamiliar_load_dismissals")
      .select("player_id, ref_date")
      .eq("team_id", teamId)
      .in("player_id", items.map((i) => i.player_id));
    const set = new Set(((dis ?? []) as Array<{ player_id: string; ref_date: string }>).map((d) => `${d.player_id}|${d.ref_date}`));
    visible = items.filter((i) => !set.has(`${i.player_id}|${i.refDate}`));
    dismissed = items.length - visible.length;
  }

  return NextResponse.json({
    ok: true,
    refDate,
    items: visible,
    summary: { totalPlayers: playerIds.length, drifting: visible.length, spikes: visible.filter((i) => i.spike).length, building, dismissed },
    note: "Driver-layer movement-drift vs each player's own norm (Unfamiliar Load). Descriptive behaviour signal, not an injury prediction.",
  });
}

/**
 * POST — dismiss a movement-drift flag for a player on a given reference date,
 * with a reason (audit). Body: { player_id, refDate, reason }.
 */
export async function POST(req: NextRequest) {
  const sb = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const userId = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = prof?.team_id as string | null;
  if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const playerId = String(body?.player_id ?? "");
  const refDate = String(body?.refDate ?? "");
  const reason = body?.reason != null ? String(body.reason).slice(0, 500) : null;
  if (!playerId || !isIso(refDate)) return NextResponse.json({ error: "player_id and refDate required" }, { status: 400 });

  // The player must belong to the coach's team.
  const { data: pl } = await sb.from("players").select("id").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!pl) return NextResponse.json({ error: "Player not on your team" }, { status: 403 });

  const { error } = await sb
    .from("unfamiliar_load_dismissals")
    .upsert({ team_id: teamId, player_id: playerId, ref_date: refDate, reason, dismissed_by: userId }, { onConflict: "player_id,ref_date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
