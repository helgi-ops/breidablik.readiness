export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/player/[id]/cs-test
 *   GET  → the player's maximal running-test efforts + the fitted read (computeCriticalSpeedFromTests):
 *          one effort = a max-speed benchmark; two+ different durations = a true CS/D′ fit.
 *   POST { durationMin, distanceM, testDate?, note? } → record one maximal effort.
 *
 * Backed by `player_running_test` — the same table that holds the Catapult-seeded 4-min maximal
 * runs — so the seeded anchors show here and any coach-added second effort lands alongside them.
 * A genuine maximal test (e.g. a 4-min "go as far as you can" run) is far better for CS/D′ than
 * the estimate from match/training peak windows. Descriptive conditioning context — it never
 * touches the readiness colour, the load target, or the daily decision. Team-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { computeCriticalSpeedFromTests, computeCriticalSpeedFrom3MT, type CsTestEffort } from "@/lib/micropulse/load/criticalSpeed";

async function authTeam(req: NextRequest, playerId: string) {
  const sb = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return { error: "No team", status: 400 } as const;
  const { data: player } = await sb.from("players").select("id, full_name").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return { error: "Player not on your team", status: 403 } as const;
  return { sb, teamId, userId: userRes.user.id, name: (player as { full_name: string | null }).full_name } as const;
}

type DbRow = { id: string; test_date: string; duration_s: number | string; distance_m: number | string; note: string | null };

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const a = await authTeam(req, playerId);
  if ("error" in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });

  const { data } = await a.sb.from("player_running_test")
    .select("id, test_date, duration_s, distance_m, notes, end_speed_kmh, protocol").eq("player_id", playerId)
    .order("test_date", { ascending: false }).order("duration_s", { ascending: true });
  const raw = (data ?? []) as Array<DbRow & { notes: string | null; end_speed_kmh: number | string | null; protocol: string | null }>;
  const rows = raw.map((r) => ({
    id: r.id, test_date: r.test_date, duration_min: Number(r.duration_s) / 60, distance_m: Number(r.distance_m), note: r.notes,
    end_speed_kmh: r.end_speed_kmh != null ? Number(r.end_speed_kmh) : null, protocol: r.protocol,
  }));
  const efforts: CsTestEffort[] = rows.map((r) => ({ durationMin: r.duration_min, distanceM: r.distance_m }));
  const read = computeCriticalSpeedFromTests(efforts);

  // 3-min all-out test (3MT): the most recent effort with a finishing speed yields CS + D′ alone.
  const mt = raw.find((r) => r.end_speed_kmh != null);
  const threeMt = mt
    ? computeCriticalSpeedFrom3MT({ endSpeedKmh: Number(mt.end_speed_kmh), totalDistanceM: Number(mt.distance_m), durationS: Number(mt.duration_s) })
    : null;

  // Squad rank of this player's best test speed (higher = faster = better) — for context.
  const { data: teamRows } = await a.sb.from("player_running_test")
    .select("player_id, duration_s, distance_m").eq("team_id", a.teamId);
  const bestSpeed = new Map<string, number>();
  for (const r of (teamRows ?? []) as Array<{ player_id: string; duration_s: number | string; distance_m: number | string }>) {
    const sp = Number(r.distance_m) / (Number(r.duration_s) / 60);
    if (!Number.isFinite(sp) || sp <= 0) continue;
    const prev = bestSpeed.get(r.player_id);
    if (prev == null || sp > prev) bestSpeed.set(r.player_id, sp);
  }
  let squadRank: { rank: number; n: number; percentile: number } | null = null;
  const mine = bestSpeed.get(playerId);
  if (mine != null && bestSpeed.size >= 2) {
    const vals = [...bestSpeed.values()];
    const below = vals.filter((v) => v < mine).length;
    const equal = vals.filter((v) => v === mine).length;
    const rank = vals.filter((v) => v > mine).length + 1; // 1 = fastest
    const percentile = Math.round(((below + 0.5 * Math.max(0, equal - 1)) / (vals.length - 1)) * 100);
    squadRank = { rank, n: vals.length, percentile };
  }

  return NextResponse.json({ ok: true, player_id: playerId, name: a.name, efforts: rows, read, squadRank, threeMt });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const a = await authTeam(req, playerId);
  if ("error" in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });

  const body = await req.json().catch(() => ({}));
  const durationMin = Number(body?.durationMin);
  const distanceM = Number(body?.distanceM);
  if (!Number.isFinite(durationMin) || durationMin <= 0 || durationMin > 60) return NextResponse.json({ ok: false, error: "durationMin must be 0–60 minutes." }, { status: 400 });
  if (!Number.isFinite(distanceM) || distanceM <= 0 || distanceM >= 20000) return NextResponse.json({ ok: false, error: "distanceM must be a plausible distance (0–20000 m)." }, { status: 400 });
  // Optional 3-min all-out finishing speed (mean of the last 30 s) → unlocks CS + D′ from one test.
  const rawEnd = body?.endSpeedKmh;
  let endSpeedKmh: number | null = null;
  if (rawEnd != null && rawEnd !== "") {
    endSpeedKmh = Number(rawEnd);
    if (!Number.isFinite(endSpeedKmh) || endSpeedKmh <= 0 || endSpeedKmh >= 40) return NextResponse.json({ ok: false, error: "endSpeedKmh must be a plausible speed (0–40 km/h)." }, { status: 400 });
  }
  const testDate = typeof body?.testDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.testDate) ? body.testDate : new Date().toISOString().slice(0, 10);
  const durLabel = Number.isInteger(durationMin) ? `${durationMin}` : durationMin.toFixed(1).replace(/\.0$/, "");
  const testName = `${durLabel} min running (max)`;

  const { error } = await a.sb.from("player_running_test").upsert({
    player_id: playerId, team_id: a.teamId, test_date: testDate, test_name: testName,
    duration_s: Math.round(durationMin * 60), distance_m: Math.round(distanceM),
    speed_m_per_min: Math.round((distanceM / durationMin) * 10) / 10,
    end_speed_kmh: endSpeedKmh, protocol: endSpeedKmh != null ? "3min_all_out" : "max_run",
    source: "manual_run_test", notes: typeof body?.note === "string" ? body.note.slice(0, 200) : null,
  }, { onConflict: "player_id,test_date,test_name,source" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, imported: 1, testDate, durationMin, distanceM: Math.round(distanceM), endSpeedKmh });
}
