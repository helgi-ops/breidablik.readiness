/**
 * GET /api/coach/team/checkin-reliability?window=28
 *
 * Per-player check-in-RELIABILITY note for the coach's team: the SD of each active
 * player's wellness total_score over the window (REAL / non-imputed check-ins only),
 * run through the two-tailed checkCheckinVariability. Returns only the ACTIONABLE
 * notes (near-constant OR erratic norm) so the Decision Summary drawer can show a
 * quiet "why this flag might rest on an unreliable norm" line.
 *
 * DESCRIPTIVE data-quality context only — never reads or writes the readiness colour,
 * never a verdict. It explains the reliability of the NORM, never judges the player.
 *
 * Response: { ok, window, byPlayer: { [playerId]: { level, sd, n, reason, reasonIs } } }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { checkCheckinVariability, checkinRepeatRate } from "@/lib/micropulse/dataQuality";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = (prof?.team_id as string | null) ?? null;
  if (!teamId) return NextResponse.json({ ok: true, window: 28, byPlayer: {} });

  const url = new URL(req.url);
  const windowDays = Math.min(90, Math.max(14, Number(url.searchParams.get("window")) || 28));
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);

  // Real check-ins only — imputed rows would flatten the SD and hide the very
  // unreliability we're trying to surface. Ordered so the repeat-rate (auto-fill
  // tell) can compare each entry to the immediately preceding one.
  const { data: rows } = await supabase
    .from("readiness_entries")
    .select("player_id, entry_date, total_score, fatigue_energy, sleep_quality, sleep_duration, stress_mood, muscle_soreness")
    .eq("team_id", teamId)
    .eq("is_imputed", false)
    .gte("entry_date", since)
    .order("player_id", { ascending: true })
    .order("entry_date", { ascending: true });

  type Row = {
    player_id: string; total_score: number | null;
    fatigue_energy: number | null; sleep_quality: number | null; sleep_duration: number | null;
    stress_mood: number | null; muscle_soreness: number | null;
  };
  const byPlayerScores = new Map<string, number[]>();
  const byPlayerVectors = new Map<string, Array<Array<number | null>>>();
  for (const r of (rows ?? []) as Row[]) {
    if (r.total_score == null) continue;
    const s = byPlayerScores.get(r.player_id) ?? [];
    s.push(Number(r.total_score));
    byPlayerScores.set(r.player_id, s);
    const v = byPlayerVectors.get(r.player_id) ?? [];
    v.push([r.fatigue_energy, r.sleep_quality, r.sleep_duration, r.stress_mood, r.muscle_soreness]);
    byPlayerVectors.set(r.player_id, v);
  }

  const byPlayer: Record<string, { level: string; sd: number | null; n: number; repeatRate: number | null; reason: string; reasonIs: string }> = {};
  for (const [playerId, scores] of byPlayerScores) {
    const n = scores.length;
    // Sample SD (n-1); null when < 2 points (nothing to spread).
    let sd: number | null = null;
    if (n >= 2) {
      const mean = scores.reduce((s, x) => s + x, 0) / n;
      const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
      sd = Math.sqrt(variance);
    }
    const repeatRate = checkinRepeatRate(byPlayerVectors.get(playerId) ?? []);
    const note = checkCheckinVariability({ sd, n, repeatRate });
    if (note.actionable) {
      byPlayer[playerId] = { level: note.level, sd: note.sd, n: note.n, repeatRate: note.repeatRate, reason: note.reason, reasonIs: note.reasonIs };
    }
  }

  return NextResponse.json({ ok: true, window: windowDays, byPlayer });
}
