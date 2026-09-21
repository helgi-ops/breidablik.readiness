/**
 * /api/player/strength-log — the AUTHENTICATED player's OWN per-set strength log.
 *   GET  ?days=90 → his recent logged sets (for e1RM / kg targets / autoregulation)
 *   POST { session_date?, exercise_id, exercise_name, set_index, weight_kg?, reps?, rpe?, rir?, is_warmup? }
 *        → upsert one set (player logs his own working set)
 *
 * Self-scoped: playerId resolved from the token (requireAuthedPlayerId); a player only ever reads/
 * writes his own rows. Descriptive — the e1RM/kg it feeds never set the readiness colour or the daily
 * decision (session load stays on session_rpe_entries).
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { requireAuthedPlayerId, getPlayerTeamId } from "@/lib/session-rpe/server";
import { canonicalLift } from "@/lib/client/oneRepMax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

export async function GET(req: Request) {
  const sb = getSupabase();
  let playerId: string;
  try { ({ playerId } = await requireAuthedPlayerId(sb, req)); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 }); }

  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 90));
  const cutoff = new Date(); cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const { data } = await sb.from("player_strength_set_log")
    .select("session_date, exercise_id, exercise_name, canonical_lift, set_index, weight_kg, reps, rpe, rir, is_warmup")
    .eq("player_id", playerId).gte("session_date", cutoff.toISOString().slice(0, 10))
    .order("session_date", { ascending: false }).order("set_index", { ascending: true });

  return NextResponse.json({ ok: true, sets: data ?? [] });
}

export async function POST(req: Request) {
  const sb = getSupabase();
  let playerId: string;
  try { ({ playerId } = await requireAuthedPlayerId(sb, req)); }
  catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const exerciseId = String(body?.exercise_id ?? "").trim();
  const exerciseName = String(body?.exercise_name ?? "").trim();
  const setIndex = Number(body?.set_index);
  if (!exerciseId || !exerciseName || !Number.isInteger(setIndex) || setIndex < 0) {
    return NextResponse.json({ ok: false, error: "exercise_id, exercise_name and a valid set_index are required." }, { status: 400 });
  }
  const sessionDate = ISO.test(String(body?.session_date)) ? String(body.session_date) : new Date().toISOString().slice(0, 10);
  const rpe = numOrNull(body?.rpe);
  if (rpe != null && (rpe < 0 || rpe > 10)) return NextResponse.json({ ok: false, error: "rpe must be 0–10." }, { status: 400 });
  const weight = numOrNull(body?.weight_kg);
  if (weight != null && (weight < 0 || weight > 700)) return NextResponse.json({ ok: false, error: "weight_kg out of range." }, { status: 400 });
  const reps = numOrNull(body?.reps);

  const teamId = await getPlayerTeamId(sb, playerId);
  const { error } = await sb.from("player_strength_set_log").upsert({
    player_id: playerId, team_id: teamId, session_date: sessionDate,
    exercise_id: exerciseId, exercise_name: exerciseName, canonical_lift: canonicalLift(exerciseName),
    set_index: setIndex, weight_kg: weight, reps: reps != null ? Math.round(reps) : null,
    rpe, rir: numOrNull(body?.rir), is_warmup: body?.is_warmup === true, source: "player",
  }, { onConflict: "player_id,session_date,exercise_id,set_index" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
