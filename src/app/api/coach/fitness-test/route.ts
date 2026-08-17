export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/fitness-test
 *   GET  ?player=<uuid> → the player's standardized fitness-test history (all types), newest first,
 *        with derived MAS/VO₂max where the test supports it.
 *   POST { playerId, testType, resultValue, testDate?, stage?, timeS?, distanceM?, notes? }
 *        → record/upsert one result (coach-auth, team-scoped, test_type validated).
 *
 * Descriptive conditioning context — it feeds MAS/VIFT prescription and the CS/D′ + ASR reads,
 * but never the readiness colour or the daily decision. Backed by `player_fitness_test`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { isFitnessTestType, deriveFitnessTest, FITNESS_TESTS } from "@/lib/micropulse/load/fitnessTests";

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

type Row = {
  id: string; test_date: string; test_type: string; result_value: number | string | null; result_unit: string | null;
  stage: number | string | null; time_s: number | string | null; distance_m: number | string | null;
  mas_kmh: number | string | null; vo2max_est: number | string | null; source: string | null; notes: string | null;
};

export async function GET(req: NextRequest) {
  const playerId = new URL(req.url).searchParams.get("player") ?? "";
  if (!playerId) return NextResponse.json({ ok: false, error: "Missing player" }, { status: 400 });
  const a = await authTeam(req, playerId);
  if ("error" in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });

  const { data } = await a.sb.from("player_fitness_test")
    .select("id, test_date, test_type, result_value, result_unit, stage, time_s, distance_m, mas_kmh, vo2max_est, source, notes")
    .eq("player_id", playerId).order("test_date", { ascending: false });
  const rows = ((data ?? []) as Row[]).map((r) => ({
    id: r.id, test_date: r.test_date, test_type: r.test_type,
    result_value: r.result_value != null ? Number(r.result_value) : null, result_unit: r.result_unit,
    stage: r.stage != null ? Number(r.stage) : null, time_s: r.time_s != null ? Number(r.time_s) : null,
    distance_m: r.distance_m != null ? Number(r.distance_m) : null,
    mas_kmh: r.mas_kmh != null ? Number(r.mas_kmh) : null, vo2max_est: r.vo2max_est != null ? Number(r.vo2max_est) : null,
    source: r.source, notes: r.notes,
    label: isFitnessTestType(r.test_type) ? FITNESS_TESTS[r.test_type].label : { en: r.test_type, is: r.test_type },
  }));
  return NextResponse.json({ ok: true, player_id: playerId, name: a.name, tests: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const playerId = typeof body?.playerId === "string" ? body.playerId : "";
  if (!playerId) return NextResponse.json({ ok: false, error: "Missing playerId" }, { status: 400 });
  const a = await authTeam(req, playerId);
  if ("error" in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });

  const testType = body?.testType;
  if (!isFitnessTestType(testType)) return NextResponse.json({ ok: false, error: "Unknown test_type" }, { status: 400 });
  const resultValue = Number(body?.resultValue);
  if (!Number.isFinite(resultValue) || resultValue <= 0 || resultValue >= 100000) return NextResponse.json({ ok: false, error: "resultValue must be a plausible positive number." }, { status: 400 });
  const testDate = typeof body?.testDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.testDate) ? body.testDate : new Date().toISOString().slice(0, 10);

  const def = FITNESS_TESTS[testType];
  const { masKmh, vo2maxEst } = deriveFitnessTest(testType, resultValue);
  const numOrNull = (x: unknown) => { const n = Number(x); return Number.isFinite(n) && n > 0 ? n : null; };

  const { error } = await a.sb.from("player_fitness_test").upsert({
    player_id: playerId, team_id: a.teamId, test_date: testDate, test_type: testType,
    result_value: resultValue, result_unit: def.unit,
    stage: numOrNull(body?.stage), time_s: numOrNull(body?.timeS),
    distance_m: def.unit === "m" ? resultValue : numOrNull(body?.distanceM),
    mas_kmh: masKmh, vo2max_est: vo2maxEst,
    source: "manual", notes: typeof body?.notes === "string" ? body.notes.slice(0, 200) : null,
  }, { onConflict: "player_id,test_date,test_type,source" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, imported: 1, testType, testDate, resultValue, masKmh, vo2maxEst });
}
