/**
 * /api/coach/player/[id]/movement-narrative
 *
 * GET — a per-player "movement narrative" (Unfamiliar Load, Phase 4). Tells the
 * story of how the player has been moving over the last ~4 weeks, in Niklas
 * Virtanen's Engine / Driver framing:
 *   - Engine (GPS):   total distance, HSR, sprint — physical capacity / volume
 *   - Driver (IMA):   multidirectional, explosive, multidirectional share,
 *                     braking share — movement quality / role behaviour
 * Each metric is compared to the player's OWN prior norm (recent vs prior z),
 * with a short trend for a sparkline and a plain-language narrative. Rules
 * decide; this packages the deterministic result. "Building a narrative for the
 * player and highlighting changes in it" (Virtanen / Catapult 2026).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  computeMovementSignature, recentVsBaseline, componentValue,
  COMPONENT_LABEL, MOVEMENT_COMPONENTS,
  type MovementDayRow, type ComponentKey,
} from "@/lib/micropulse/movementSignature";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient(url, key, { auth: { persistSession: false } });
}
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
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

  const { data: player } = await sb.from("players").select("id, full_name, position").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return NextResponse.json({ error: "Player not on your team" }, { status: 403 });
  const p = player as { id: string; full_name: string | null; position: string | null };

  const today = new Date().toISOString().slice(0, 10);
  const windowStart = new Date(Date.parse(today + "T00:00:00Z") - 40 * 86_400_000).toISOString().slice(0, 10);

  const { data: rows } = await sb
    .from("player_external_load_daily")
    .select("date, total_distance, velocity_band5_total_distance, velocity_band6_total_distance, ima_fr_band58_total_distance, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, jumps")
    .eq("player_id", playerId)
    .gte("date", windowStart)
    .lte("date", today)
    .order("date", { ascending: true });

  const all = (rows ?? []) as Array<Record<string, unknown>>;
  if (all.length === 0) return NextResponse.json({ ok: true, player_id: playerId, name: p.full_name, position: p.position, sessions: 0, engine: null, driver: null, narrative: null });

  const refDate = String(all[all.length - 1].date);
  // Most-recent-first MovementDayRow[] for the signature engine.
  const mdRows: MovementDayRow[] = all.map((r) => ({
    date: String(r.date),
    totalDistance: num(r.total_distance),
    imaDistance: num(r.ima_fr_band58_total_distance),
    accelEfforts: num(r.accel_b2_3_tot_effs_gen2),
    decelEfforts: num(r.decel_b2_3_tot_effs_gen2),
  }));
  const sig = computeMovementSignature(mdRows, refDate);

  // Helper: build {recent vs own norm} + a trend (oldest→newest, for a sparkline)
  // for an arbitrary daily metric (training days only, i.e. value > 0).
  type MetricOut = { recent: number | null; mean: number | null; sd: number | null; z: number | null; n: number; trend: number[] };
  const buildMetric = (valueOf: (r: Record<string, unknown>) => number): MetricOut => {
    const asc = all.map(valueOf).map((v) => Number(v) || 0);
    const trainAsc = all.map(valueOf).map((v) => Number(v) || 0).filter((v) => v > 0);
    const mostRecentFirst = [...trainAsc].reverse();
    const rb = recentVsBaseline(mostRecentFirst);
    return {
      recent: rb ? Math.round(rb.recent) : null,
      mean: rb ? Math.round(rb.mean) : null,
      sd: rb ? Math.round(rb.sd) : null,
      z: rb ? rb.z : null,
      n: rb ? rb.n : trainAsc.length,
      trend: asc.slice(-12).map((v) => Math.round(v)),
    };
  };

  const engine = {
    totalDistance: { label: "Total distance (m)", ...buildMetric((r) => num(r.total_distance)) },
    hsr: { label: "High-speed running (m)", ...buildMetric((r) => num(r.velocity_band5_total_distance)) },
    sprint: { label: "Sprint distance (m)", ...buildMetric((r) => num(r.velocity_band6_total_distance)) },
  };

  // Jumps — a Driver-layer explosive signal (Catapult IMA jump count per day),
  // compared to the player's own jumping norm. Only surfaced when he actually
  // has jump history (n > 0), so it degrades cleanly when the data isn't there.
  const jm = buildMetric((r) => num(r.jumps));
  const jumps = jm.n > 0 ? { label: "Jumps (count)", ...jm } : null;
  const jumpsLine = jumps == null || jumps.z == null
    ? null
    : jumps.z >= 1 ? `He's jumping more than his usual (jumps ${jumps.z > 0 ? "+" : ""}${jumps.z} SD) — more explosive/aerial work than normal.`
    : jumps.z <= -1 ? `He's jumping less than his usual (jumps ${jumps.z} SD) — fewer explosive/aerial actions than normal.`
    : "His jump count is steady — in line with his usual explosive output.";

  // Driver components: reuse componentValue per row; share components keep decimals.
  const driverComponents = MOVEMENT_COMPONENTS.map((key: ComponentKey) => {
    const c = sig.components.find((x) => x.key === key) ?? null;
    const isShare = key.endsWith("share");
    const trainAsc: number[] = [];
    for (const r of mdRows) { const v = componentValue(key, r); if (v != null && Number.isFinite(v)) trainAsc.push(v); }
    const trend = trainAsc.slice(-12).map((v) => isShare ? Math.round(v * 1000) / 1000 : Math.round(v));
    return {
      key, label: COMPONENT_LABEL[key], isShare,
      recent: c?.today ?? null, mean: c?.mean ?? null, sd: c?.sd ?? null, z: c?.z ?? null, n: c?.n ?? 0,
      flagged: c?.flagged ?? false, trend,
    };
  });

  // Deterministic narrative (plain language; rules, not AI).
  const tdZ = engine.totalDistance.z;
  const engineLine = tdZ == null
    ? "Not enough running history yet to read his physical base."
    : tdZ >= 1 ? `His running volume is up vs his recent base (total distance ${tdZ > 0 ? "+" : ""}${tdZ} SD) — building.`
    : tdZ <= -1 ? `His running volume is below his recent base (total distance ${tdZ} SD) — easing or under-exposed.`
    : "His running volume is steady — sitting within his usual base.";
  const driverLine = sig.headline
    ? sig.headline
    : (sig.baselineDays >= 8 ? "He is moving like himself — his movement signature is within his usual envelope." : "Still building his movement baseline (not enough sessions yet).");
  const summary = `${p.full_name ?? "This player"}: ${tdZ == null ? "engine still building" : tdZ >= 1 ? "engine building" : tdZ <= -1 ? "engine easing" : "engine steady"}, ${sig.driftType === "none" ? "driver normal" : `driver ${sig.driftType} drift`}.`;

  return NextResponse.json({
    ok: true,
    player_id: playerId,
    name: p.full_name,
    position: p.position,
    refDate,
    sessions: mdRows.length,
    baselineDays: sig.baselineDays,
    confident: sig.confident,
    calibrating: sig.calibrating,
    driftType: sig.driftType,
    engine,
    jumps,
    driver: { components: driverComponents, totalDistanceZ: sig.totalDistanceZ },
    narrative: { engineLine, driverLine, jumpsLine, summary, suggestedAction: sig.suggestedAction, counterfactual: sig.counterfactual },
    note: "Engine = GPS capacity/volume; Driver = IMA movement quality. Each metric vs the player's own prior norm. Descriptive, not injury-predictive.",
  });
}
