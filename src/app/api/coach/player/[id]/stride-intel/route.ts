/**
 * /api/coach/player/[id]/stride-intel?days=14
 *
 * Returns the player's Stride Intelligence payload for today + a daily trend
 * series (default 14 days) for sparklines. Mode-agnostic — works indoor and
 * outdoor as long as the Catapult vest captures IMA Free Running strides.
 *
 * Response shape:
 *   {
 *     today:   StrideIntelligencePayload | null,
 *     trend:   Array<{ date, totalStrides, cadenceWeighted, strideLengthHsr,
 *                       codLrAsymmetryPct, gpsImaDecoupling }>,
 *     baselines: Record<metricKey, { mean, sd, status }>,
 *   }
 *
 * Open to ELITE and PRO teams (any team that has a Catapult tier; the actual
 * data is silently empty for teams that don't).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadStrideIntelligence } from "@/lib/micropulse/strideIntelligence/loader";
import { STRIDE_BASELINE_METRIC_KEYS } from "@/lib/micropulse/strideIntelligence";

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getCoachTeam(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) {
    return { error: "Coach role required", status: 403 } as const;
  }
  const teamId = (prof?.team_id as string | null) ?? null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { userId, teamId } as const;
}

type TrendRow = {
  date: string;
  totalStrides: number | null;
  hiVelocityStrides: number | null;
  cadenceWeighted: number | null;
  strideLengthHsr: number | null;
  codLrAsymmetryPct: number | null;
  gpsImaDecoupling: number | null;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: playerId } = await params;
  if (!playerId) {
    return NextResponse.json({ error: "Missing player id" }, { status: 400 });
  }

  const auth = await getCoachTeam(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = getSupabase();

  // Verify player belongs to team
  const { data: playerCheck } = await supabase
    .from("players")
    .select("id, team_id")
    .eq("id", playerId)
    .maybeSingle();
  if (!playerCheck || playerCheck.team_id !== auth.teamId) {
    return NextResponse.json({ error: "Player not in your team" }, { status: 403 });
  }

  const url = new URL(req.url);
  const days = Math.max(7, Math.min(28, Number(url.searchParams.get("days") ?? 14)));

  const todayIso = new Date().toISOString().slice(0, 10);
  const startIso = new Date(Date.now() - (days - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);

  // 1. Today's payload
  const today = await loadStrideIntelligence(supabase, { playerId, date: todayIso });

  // 2. Trend over last `days` days from the stride summary view + base table for decoupling
  const { data: trendRows } = await supabase
    .from("player_stride_summary")
    .select("date, total_strides, hi_velocity_strides, cadence_weighted, stride_length_hsr_m, cod_lr_asym_pct")
    .eq("player_id", playerId)
    .eq("source", "catapult")
    .gte("date", startIso)
    .lte("date", todayIso)
    .order("date", { ascending: true });

  // Compute decoupling from the base table since it isn't in the view (we
  // could re-derive or expose it via the view; for now just join client-side).
  const { data: dailyRows } = await supabase
    .from("player_external_load_daily")
    .select(
      "date, total_distance, total_player_load, velocity_band5_total_distance, velocity_band6_total_distance, " +
        "ima_fr_band4_total_player_load, ima_fr_band5_total_player_load, ima_fr_band6_total_player_load, " +
        "ima_fr_band7_total_player_load, ima_fr_band8_total_player_load",
    )
    .eq("player_id", playerId)
    .eq("source", "catapult")
    .gte("date", startIso)
    .lte("date", todayIso);

  type DailyRow = {
    date: string;
    total_distance: number | null;
    total_player_load: number | null;
    velocity_band5_total_distance: number | null;
    velocity_band6_total_distance: number | null;
    ima_fr_band4_total_player_load: number | null;
    ima_fr_band5_total_player_load: number | null;
    ima_fr_band6_total_player_load: number | null;
    ima_fr_band7_total_player_load: number | null;
    ima_fr_band8_total_player_load: number | null;
  };

  const decouplingByDate = new Map<string, number | null>();
  for (const r of (dailyRows as unknown as DailyRow[] | null) ?? []) {
    const td = Number(r.total_distance ?? 0);
    const tpl = Number(r.total_player_load ?? 0);
    if (td <= 0 || tpl <= 0) {
      decouplingByDate.set(r.date, null);
      continue;
    }
    const hsr = (Number(r.velocity_band5_total_distance ?? 0) || 0) +
      (Number(r.velocity_band6_total_distance ?? 0) || 0);
    const hi =
      (Number(r.ima_fr_band4_total_player_load ?? 0) || 0) +
      (Number(r.ima_fr_band5_total_player_load ?? 0) || 0) +
      (Number(r.ima_fr_band6_total_player_load ?? 0) || 0) +
      (Number(r.ima_fr_band7_total_player_load ?? 0) || 0) +
      (Number(r.ima_fr_band8_total_player_load ?? 0) || 0);
    decouplingByDate.set(r.date, hsr / td - hi / tpl);
  }

  const trend: TrendRow[] = ((trendRows ?? []) as Array<{
    date: string;
    total_strides: number | null;
    hi_velocity_strides: number | null;
    cadence_weighted: number | null;
    stride_length_hsr_m: number | null;
    cod_lr_asym_pct: number | null;
  }>).map((r) => ({
    date: r.date,
    totalStrides: r.total_strides,
    hiVelocityStrides: r.hi_velocity_strides,
    cadenceWeighted: r.cadence_weighted,
    strideLengthHsr: r.stride_length_hsr_m,
    codLrAsymmetryPct: r.cod_lr_asym_pct,
    gpsImaDecoupling: decouplingByDate.get(r.date) ?? null,
  }));

  // 3. Baselines for context
  const baselineKeys = [
    STRIDE_BASELINE_METRIC_KEYS.cadence,
    STRIDE_BASELINE_METRIC_KEYS.strideLengthHsr,
    STRIDE_BASELINE_METRIC_KEYS.gpsImaDecoupling,
    STRIDE_BASELINE_METRIC_KEYS.codLrAsymmetry,
  ];
  const { data: bl } = await supabase
    .from("athlete_metric_baselines")
    .select("metric_key, mean, sd, n_observations, status")
    .eq("player_id", playerId)
    .in("metric_key", baselineKeys);

  const baselines: Record<string, {
    mean: number | null;
    sd: number | null;
    n: number | null;
    status: string;
  }> = {};
  for (const b of (bl ?? []) as Array<{
    metric_key: string;
    mean: number | null;
    sd: number | null;
    n_observations: number | null;
    status: string | null;
  }>) {
    baselines[b.metric_key] = {
      mean: b.mean,
      sd: b.sd,
      n: b.n_observations,
      status: b.status ?? "insufficient_data",
    };
  }

  return NextResponse.json({
    ok: true,
    playerId,
    date: todayIso,
    today,
    trend,
    baselines,
  });
}
