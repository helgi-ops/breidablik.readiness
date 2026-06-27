/**
 * /api/player/movement?date=YYYY-MM-DD
 *
 * GET — a PLAYER-facing, motivating view of their own movement for a day, each
 * compared to the player's OWN recent normal (28-day mean of training days).
 * Capability-driven, branching on the signals his data actually carries:
 *   - IMA clubs (Pro S7): jumps, high-intensity actions, direction changes, IMA run.
 *   - GPS-only clubs (Lite): high-speed running, sprint distance, high-intensity
 *     efforts, top speed — the data he genuinely gets, instead of an empty card.
 * Plain language, personal-norm framing; deliberately NOT the coach/S&C signals
 * (no L/R asymmetry, no movement-drift / unfamiliar-load, no clock fingerprint).
 *
 * Self-scoped: a player only ever sees their own row.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

type Row = Record<string, unknown> & { date: string };

type MetricDef = { key: string; unit: string; value: (r: Row) => number };

const codSum = (r: Row) => num(r.ima_cod_left_high) + num(r.ima_cod_left_medium) + num(r.ima_cod_left_low)
  + num(r.ima_cod_right_high) + num(r.ima_cod_right_medium) + num(r.ima_cod_right_low);

// IMA signals (Pro S7) — the richest movement read.
const IMA_METRICS: MetricDef[] = [
  { key: "jumps", unit: "", value: (r) => num(r.jumps) },
  { key: "high_intensity", unit: "", value: (r) => num(r.accel_b2_3_tot_effs_gen2) + num(r.decel_b2_3_tot_effs_gen2) },
  { key: "cuts", unit: "", value: (r) => codSum(r) },
  { key: "ima_run", unit: "m", value: (r) => num(r.ima_fr_band58_total_distance) },
];

// GPS signals (Lite / GPS-only) — the data the player genuinely receives.
const GPS_METRICS: MetricDef[] = [
  { key: "hsr", unit: "m", value: (r) => num(r.high_speed_distance) },
  { key: "sprint", unit: "m", value: (r) => num(r.sprint_distance) },
  { key: "efforts", unit: "", value: (r) => num(r.accel_decel_efforts) },
  { key: "top_speed", unit: "km/h", value: (r) => num(r.max_velocity) },
];

const SELECT = "date, jumps, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, "
  + "ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low, "
  + "ima_fr_band58_total_distance, high_speed_distance, sprint_distance, accel_decel_efforts, max_velocity";

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try { ({ playerId } = await requireAuthedPlayerId(sb, req)); }
  catch (e) { const m = e instanceof Error ? e.message : "Unauthorized"; return NextResponse.json({ error: m }, { status: 401 }); }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const today = new Date().toISOString().slice(0, 10);
  const refDate = dateParam && isIso(dateParam) ? dateParam : today;
  const windowStart = addDaysISO(refDate, -34); // 28-day norm + slack

  const { data, error } = await sb
    .from("player_external_load_daily")
    .select(SELECT)
    .eq("player_id", playerId)
    .gte("date", windowStart)
    .lte("date", refDate)
    .order("date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as Row[];
  const todayRow = rows.find((r) => String(r.date) === refDate) ?? null;
  // Baseline rows = everything strictly before the ref date.
  const priorRows = rows.filter((r) => String(r.date) < refDate);

  // Capability detection (per player, NOT tier name): does his data carry GENUINE
  // IMA? Only jumps + change-of-direction count — NOT accel/decel B2-3 efforts,
  // which Core/Lite clubs also have (they fooled the tier heuristic). If no real
  // IMA, show the GPS signals he genuinely receives.
  const hasIMA = rows.some((r) => num(r.jumps) > 0 || codSum(r) > 0);
  const source = hasIMA ? "ima" : "gps";
  const METRICS = hasIMA ? IMA_METRICS : GPS_METRICS;

  const metrics = METRICS.map((m) => {
    const todayVal = todayRow ? Math.round(m.value(todayRow)) : null;
    // Personal norm = mean over prior TRAINING days (value > 0) only.
    const priorVals = priorRows.map((r) => m.value(r)).filter((v) => v > 0);
    const usual = priorVals.length >= 3
      ? Math.round(priorVals.reduce((a, b) => a + b, 0) / priorVals.length)
      : null;
    const pct = (todayVal != null && usual != null && usual > 0)
      ? Math.round(((todayVal / usual) - 1) * 100)
      : null;
    const tone = pct == null ? "na" : pct >= 15 ? "up" : pct <= -15 ? "down" : "steady";
    return { key: m.key, unit: m.unit, today: todayVal, usual, pct, tone, baselineDays: priorVals.length };
  });

  const hasData = todayRow != null && metrics.some((m) => (m.today ?? 0) > 0);

  return NextResponse.json({
    ok: true,
    date: refDate,
    hasData,
    source,
    metrics,
    note: `Player's own ${source.toUpperCase()} movement vs their recent normal. Descriptive and motivating, not an injury or risk signal.`,
  });
}
