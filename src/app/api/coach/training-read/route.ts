/**
 * /api/coach/training-read?player_id=…   (spec: docs/train-like-you-play-individual.md)
 *
 * GET — "How to train this player": per-player ranked development emphases from the
 * team game model × how the player actually moves. Coach/staff only.
 *
 * The endpoint does the DATA work (fetch the window, build each quality's own
 * baseline, z via flagAgainstBaseline, detect IMA-presence for rich/proxy); the
 * deterministic trainingRead engine + fixed cited catalogue decide WHICH qualities.
 * Capability-driven: IMA-only qualities (change-of-direction, L/R asymmetry) are
 * simply absent on GPS-only clubs → the engine lists them under notAssessable.
 * A distinct labelled development signal — never the canonical readiness colour.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { flagAgainstBaseline, type AthleteMetricBaseline, type BaselineStatus } from "@/lib/micropulse/baselines";
import { computeTrainingRead, MIN_DAYS, type QualitySignal, type PlayerTrainingRead } from "@/lib/micropulse/trainingRead";
import { GAME_MODELS, QUALITY_KEYS, type GameModel, type Quality } from "@/lib/micropulse/trainingRead/catalogue";

export const runtime = "nodejs";


async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId, supabase } as const;
}

const num = (v: unknown): number | null => (Number.isFinite(Number(v)) ? Number(v) : null);
function addDays(iso: string, n: number) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function mean(xs: number[]) { return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0; }
function sd(xs: number[], m: number) { return xs.length < 2 ? 0 : Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)); }

function buildBaseline(metricKey: string, values: number[]): AthleteMetricBaseline {
  const n = values.length, m = mean(values);
  const status: BaselineStatus = n < MIN_DAYS ? "insufficient_data" : n < 14 ? "calibrating" : "active";
  return { player_id: "", metric_key: metricKey, n_observations: n, mean: m, sd: sd(values, m), cv: m ? sd(values, m) / m : null, median: null, window_days: 35, status, computed_at: "" };
}

type LRow = Record<string, number | null> & { date: string };

const MIN_PEERS = 4; // squad-norm needs enough teammates to z-score against

// Metric accessors (his typical exposure in each quality). codSum/lrAsym are
// IMA-only; accel/decel pick IMA counts on Pro, max_accel/decel on Lite.
const codSum = (r: LRow) => (num(r.ima_cod_left_high) ?? 0) + (num(r.ima_cod_left_medium) ?? 0) + (num(r.ima_cod_left_low) ?? 0)
  + (num(r.ima_cod_right_high) ?? 0) + (num(r.ima_cod_right_medium) ?? 0) + (num(r.ima_cod_right_low) ?? 0);
const hsrShare = (r: LRow) => { const t = num(r.total_distance); const h = num(r.high_speed_distance); return t != null && t > 0 && h != null ? (h / t) * 100 : null; };
const lrAsym = (r: LRow) => {
  const l = (num(r.ima_cod_left_high) ?? 0) + (num(r.ima_cod_left_medium) ?? 0) + (num(r.ima_cod_left_low) ?? 0);
  const rg = (num(r.ima_cod_right_high) ?? 0) + (num(r.ima_cod_right_medium) ?? 0) + (num(r.ima_cod_right_low) ?? 0);
  return l + rg > 0 ? (Math.abs(l - rg) / (l + rg)) * 100 : null;
};

// Sum IMA band columns; null only when ALL are missing (a real 0 — e.g. a centre-
// back with no top-speed strides that session — is kept, it's the whole point).
function bandSum(r: LRow, cols: string[]): number | null {
  if (!cols.some((c) => r[c] != null)) return null;
  return cols.reduce((s, c) => s + (num(r[c]) ?? 0), 0);
}

function accessorsFor(hasIMA: boolean): Array<[Quality, (r: LRow) => number | null, boolean]> {
  // [quality, accessor, isIMA]. IMA is the primary signal where it genuinely reads
  // movement better AND is well-populated: hard accel/decel (band2/3) — plus CoD +
  // L/R asymmetry, added separately. Sprint/top-speed/hamstring stay on GPS high-
  // speed-running: the IMA stride bands are too sparse here to norm as a profile,
  // and HSR-share tracks the sprint DISTANCE a coach actually reasons about.
  if (hasIMA) {
    return [
      ["max_velocity", hsrShare, false],
      ["repeated_sprint", (r) => num(r.velocity_band6_total_efforts_gen2), false],
      ["acceleration", (r) => bandSum(r, ["ima_band2_accel_count", "ima_band3_accel_count"]), true],
      ["deceleration", (r) => bandSum(r, ["ima_band2_decel_count", "ima_band3_decel_count"]), true],
      ["hamstring_resilience", (r) => num(r.high_speed_distance), false],
      ["aerobic_density", (r) => num(r.player_load_per_minute), false],
    ];
  }
  return [
    ["max_velocity", hsrShare, false],
    ["repeated_sprint", (r) => num(r.velocity_band6_total_efforts_gen2), false],
    ["acceleration", (r) => num(r.max_acceleration), false],
    ["deceleration", (r) => num(r.max_deceleration), false],
    ["hamstring_resilience", (r) => num(r.high_speed_distance), false],
    ["aerobic_density", (r) => num(r.player_load_per_minute), false],
  ];
}

/** His typical value for a metric over the window (mean of populated sessions). */
function typicalValue(rows: LRow[], pick: (r: LRow) => number | null): { mean: number; days: number } | null {
  const vals = rows.map(pick).filter((x): x is number => x != null && Number.isFinite(x));
  return vals.length ? { mean: mean(vals), days: vals.length } : null;
}

const SELECT = [
  "player_id, date, total_distance, high_speed_distance, sprint_distance, velocity_band6_total_efforts_gen2",
  "max_acceleration, max_deceleration, max_velocity, player_load_per_minute, high_metabolic_load_distance_m",
  "ima_accel, ima_decel, ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low",
  // High-intensity IMA accel/decel bands (band2/3 = hard efforts) — the primary
  // signal on Pro for HOW he accelerates and brakes, which GPS distance can't see.
  // (The IMA force-running stride bands are too sparse here to norm reliably, so
  // sprint/top-speed stays on GPS high-speed-running — see accessorsFor.)
  "ima_band2_accel_count, ima_band3_accel_count, ima_band2_decel_count, ima_band3_decel_count",
].join(", ");

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { supabase, teamId } = ctx;

  const today = new Date().toISOString().slice(0, 10);
  const from = addDays(today, -35);
  const onlyPlayer = req.nextUrl.searchParams.get("player_id");

  const [settingsRes, playersRes, loadRes] = await Promise.all([
    supabase.from("team_settings").select("game_model, game_model_by_position").eq("team_id", teamId).maybeSingle(),
    supabase.from("players").select("id, full_name, position").eq("team_id", teamId).eq("is_active", true),
    supabase.from("player_external_load_daily").select(SELECT).eq("team_id", teamId).gte("date", from).lte("date", today).limit(8000),
  ]);

  const teamModel: GameModel = GAME_MODELS.includes(settingsRes.data?.game_model as GameModel) ? (settingsRes.data!.game_model as GameModel) : "balanced";
  const byPosModel = (settingsRes.data?.game_model_by_position ?? null) as Record<string, string> | null;

  let players = (playersRes.data ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>;
  if (onlyPlayer) players = players.filter((p) => p.id === onlyPlayer);

  const byPlayer = new Map<string, LRow[]>();
  for (const r of (loadRes.data ?? []) as unknown as Array<Record<string, unknown>>) {
    const id = String(r.player_id);
    if (!byPlayer.has(id)) byPlayer.set(id, []);
    byPlayer.get(id)!.push({ ...(r as Record<string, number | null>), date: String(r.date) } as LRow);
  }

  // Pass 1 — each player's TYPICAL value per quality + capability (IMA?). We read
  // his profile vs the SQUAD, not vs his own recent trend: a centre-back who runs
  // the least sprint metres on the team should read LOW in sprint, not "elevated"
  // just because today edged his own low average.
  type Agg = {
    p: { id: string; full_name: string | null; position: string | null };
    q: Map<Quality, { mean: number; days: number; rich: boolean }>;
  };
  const aggs: Agg[] = [];
  for (const p of players) {
    const rows = (byPlayer.get(p.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    if (!rows.length) continue;
    const hasIMA = rows.some((r) => (num(r.ima_accel) ?? 0) > 0 || (num(r.ima_decel) ?? 0) > 0 || codSum(r) > 0);
    const hasCod = rows.some((r) => codSum(r) > 0);
    const q = new Map<Quality, { mean: number; days: number; rich: boolean }>();
    for (const [quality, pick, rich] of accessorsFor(hasIMA)) {
      const t = typicalValue(rows, pick);
      if (t) q.set(quality, { ...t, rich });
    }
    if (hasCod) {
      const c = typicalValue(rows, codSum); if (c) q.set("change_of_direction", { ...c, rich: true });
      const as = typicalValue(rows, lrAsym); if (as) q.set("lr_asymmetry", { ...as, rich: true });
    }
    aggs.push({ p, q });
  }

  // Pass 2 — squad-norm baseline per quality. We z-score each player against the
  // whole squad (not his position peers) ON PURPOSE: that surfaces his movement
  // SIGNATURE — a centre-back reads high-decel / low-sprint, a winger high-sprint —
  // which is the role context a coach develops against ("train like you play").
  // Normalising against same-position peers instead would strip that signature and
  // leave most players blank.
  const squad = new Map<Quality, AthleteMetricBaseline>();
  for (const quality of QUALITY_KEYS) {
    const means = aggs.map((a) => a.q.get(quality)?.mean).filter((x): x is number => x != null && Number.isFinite(x));
    if (means.length >= MIN_PEERS) squad.set(quality, buildBaseline("external.training_read", means));
  }

  // Pass 3 — z each player's typical vs the squad, then the deterministic read.
  const reads: Array<PlayerTrainingRead & { name: string }> = [];
  for (const { p, q } of aggs) {
    const signals: Partial<Record<Quality, QualitySignal>> = {};
    for (const [quality, v] of q) {
      const base = squad.get(quality);
      if (!base || v.days < MIN_DAYS) continue; // need a squad norm + his own mature window
      const { z } = flagAgainstBaseline(v.mean, base, "external.training_read");
      signals[quality] = { z, baselineDays: v.days, rich: v.rich };
    }
    const gameModel: GameModel = (p.position && byPosModel && GAME_MODELS.includes(byPosModel[p.position] as GameModel))
      ? (byPosModel[p.position] as GameModel) : teamModel;
    reads.push({ name: (p.full_name ?? "—").trim(), ...computeTrainingRead({ playerId: p.id, position: p.position, firstName: (p.full_name ?? "—").trim().split(" ")[0], gameModel, signals }) });
  }

  return NextResponse.json({
    gameModel: teamModel,
    reads,
    note: "Development-emphasis read (rules decide qualities; phrasing is fixed cited templates). A distinct labelled signal, not the readiness colour.",
  });
}

/** POST — coach sets the team game model. Body: { game_model }. */
export async function POST(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { supabase, teamId } = ctx;
  const body = await req.json().catch(() => ({}));
  const model = String(body?.game_model ?? "");
  if (!GAME_MODELS.includes(model as GameModel)) {
    return NextResponse.json({ error: "Invalid game_model" }, { status: 400 });
  }
  const { error } = await supabase
    .from("team_settings")
    .upsert({ team_id: teamId, game_model: model }, { onConflict: "team_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, gameModel: model });
}
