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
import { computeCriticalSpeedFromTests, type CsTestEffort } from "@/lib/micropulse/load/criticalSpeed";

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
    .select("id, test_date, duration_s, distance_m, notes").eq("player_id", playerId)
    .order("test_date", { ascending: false }).order("duration_s", { ascending: true });
  const rows = ((data ?? []) as Array<DbRow & { notes: string | null }>).map((r) => ({
    id: r.id, test_date: r.test_date, duration_min: Number(r.duration_s) / 60, distance_m: Number(r.distance_m), note: r.notes,
  }));
  const efforts: CsTestEffort[] = rows.map((r) => ({ durationMin: r.duration_min, distanceM: r.distance_m }));
  const read = computeCriticalSpeedFromTests(efforts);

  return NextResponse.json({ ok: true, player_id: playerId, name: a.name, efforts: rows, read });
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
  const testDate = typeof body?.testDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.testDate) ? body.testDate : new Date().toISOString().slice(0, 10);
  const durLabel = Number.isInteger(durationMin) ? `${durationMin}` : durationMin.toFixed(1).replace(/\.0$/, "");
  const testName = `${durLabel} min running (max)`;

  const { error } = await a.sb.from("player_running_test").upsert({
    player_id: playerId, team_id: a.teamId, test_date: testDate, test_name: testName,
    duration_s: Math.round(durationMin * 60), distance_m: Math.round(distanceM),
    speed_m_per_min: Math.round((distanceM / durationMin) * 10) / 10,
    source: "manual_run_test", notes: typeof body?.note === "string" ? body.note.slice(0, 200) : null,
  }, { onConflict: "player_id,test_date,test_name,source" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, imported: 1, testDate, durationMin, distanceM: Math.round(distanceM) });
}
