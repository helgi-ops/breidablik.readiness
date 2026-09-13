/**
 * GET /api/coach/team/gap-drills
 *
 * Train-like-you-play gap-drill recommendations for the team session (Move 2,
 * Slice 4a). Per rostered, NON-injured player it compares training exposure vs
 * that player's own MATCH demand for the three drill qualities (sprint / decel /
 * accel), turns each under-exposure into a `PlayerDemand`, and runs the existing
 * `recommendFootballDrills` engine to surface the drills that close the gap.
 *
 * Descriptive/advisory — the coach adds drills manually; never the readiness
 * colour; injured players excluded. Screening-grade: exposure is a match/training
 * MEAN of the quality (not a per-90 physiology model).
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { recommendFootballDrills, type PlayerDemand, type DrillRow, type DrillRec, type DrillQuality } from "@/lib/micropulse/footballDrills/recommend";
import { exposureToDemand } from "@/lib/micropulse/pitchSession/gapDrills";

export const runtime = "nodejs";

const INJURED = new Set(["injured", "rehabilitation", "rtp_training"]);
const WINDOW_DAYS = 90;      // enough to catch a few matches + recent training
const MATCH_MIN_MINUTES = 45; // a real match exposure

const LOAD_SELECT =
  "player_id, date, accel_b2_3_tot_effs_gen2, decel_b2_3_tot_effs_gen2, velocity_band5_total_distance, velocity_band6_total_distance";

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
const qualityOf = (r: Record<string, unknown>, q: DrillQuality): number =>
  q === "sprint" ? num(r.velocity_band5_total_distance) + num(r.velocity_band6_total_distance)
  : q === "decel" ? num(r.decel_b2_3_tot_effs_gen2)
  : num(r.accel_b2_3_tot_effs_gen2);

const QUALITIES: DrillQuality[] = ["sprint", "decel", "accel"];

export async function GET(req: NextRequest) {
  const sb = getSupabaseServer();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Coach role required" }, { status: 403 });
  const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
  if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - WINDOW_DAYS);
  const windowStart = start.toISOString().slice(0, 10);

  const [{ data: roster }, { data: injRows }, { data: loadRows }, { data: matchRows }, { data: drillRows }] = await Promise.all([
    sb.from("players").select("id, full_name").eq("team_id", teamId).or("is_active.is.null,is_active.eq.true"),
    sb.from("player_injuries").select("player_id, status, updated_at").eq("team_id", teamId).order("updated_at", { ascending: false }),
    sb.from("player_external_load_daily").select(LOAD_SELECT).gte("date", windowStart).lte("date", today),
    sb.from("match_player_minutes").select("player_id, match_date, minutes_played").gte("match_date", windowStart).lte("match_date", today).gte("minutes_played", MATCH_MIN_MINUTES),
    sb.from("drill_library")
      .select("id, drill_name, category, drill_format, total_players, duration_min, field_length_m, field_width_m, vel_b5, vel_b6, decel_b23, accel_b23, player_load_per_min, diagram_url")
      .is("deleted_at", null)
      .or(`team_id.eq.${teamId},team_id.is.null`),
  ]);

  // Injured exclusion (latest status per player), reused from Slice 2.
  const injured = new Set<string>();
  const seenInj = new Set<string>();
  for (const r of (injRows ?? []) as Array<{ player_id: string; status: string }>) {
    const pid = String(r.player_id ?? "");
    if (!pid || seenInj.has(pid)) continue;
    seenInj.add(pid);
    if (INJURED.has(String(r.status ?? "").toLowerCase())) injured.add(pid);
  }

  // Match-day set per player.
  const matchDates = new Map<string, Set<string>>();
  for (const r of (matchRows ?? []) as Array<{ player_id: string; match_date: string }>) {
    const pid = String(r.player_id ?? "");
    if (!pid) continue;
    (matchDates.get(pid) ?? matchDates.set(pid, new Set()).get(pid)!).add(String(r.match_date));
  }

  // Load rows grouped per player.
  const loadByPlayer = new Map<string, Array<Record<string, unknown>>>();
  for (const r of (loadRows ?? []) as Array<Record<string, unknown>>) {
    const pid = String(r.player_id ?? "");
    if (!pid) continue;
    (loadByPlayer.get(pid) ?? loadByPlayer.set(pid, []).get(pid)!).push(r);
  }

  const drills = (drillRows ?? []) as DrillRow[];
  const players = ((roster ?? []) as Array<{ id: string; full_name: string | null }>).filter((p) => !injured.has(String(p.id)));

  const out: Array<{ playerId: string; name: string; demands: PlayerDemand[]; recs: DrillRec[] }> = [];
  for (const p of players) {
    const pid = String(p.id);
    const rows = loadByPlayer.get(pid) ?? [];
    const mDates = matchDates.get(pid) ?? new Set<string>();
    const matchLoad = rows.filter((r) => mDates.has(String(r.date)));
    const trainLoad = rows.filter((r) => !mDates.has(String(r.date)));
    if (matchLoad.length === 0 || trainLoad.length === 0) continue; // no reference / no training

    const demands: PlayerDemand[] = [];
    for (const q of QUALITIES) {
      const d = exposureToDemand(q, mean(matchLoad.map((r) => qualityOf(r, q))), mean(trainLoad.map((r) => qualityOf(r, q))));
      if (d) demands.push(d);
    }
    if (demands.length === 0) continue;

    const recs = recommendFootballDrills(demands, drills).filter((r) => r.kind === "gap");
    if (recs.length > 0) out.push({ playerId: pid, name: (p.full_name ?? "").trim() || "?", demands, recs });
  }

  return NextResponse.json({ ok: true, players: out, coverage: { withGaps: out.length, roster: players.length } });
}
