export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/hr-ex-test
 *   GET  ?player=<uuid> → the player's submaximal-HR (HRex) test history, newest first.
 *   POST { playerId, hrexBpm, hrrBpm?, speedKmh?, durationS?, testDate?, notes? }
 *        → record one HRex test (coach-auth, team-scoped).
 *
 * Descriptive conditioning context (Buchheit submaximal-HR fitness trend) — feeds the
 * aerobic profile, never the readiness colour. Backed by `submax_hr_test`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

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
  return { sb, teamId, name: (player as { full_name: string | null }).full_name } as const;
}

const numOrNull = (x: unknown) => { const n = Number(x); return Number.isFinite(n) && n > 0 ? n : null; };

export async function GET(req: NextRequest) {
  const playerId = new URL(req.url).searchParams.get("player") ?? "";
  if (!playerId) return NextResponse.json({ ok: false, error: "Missing player" }, { status: 400 });
  const a = await authTeam(req, playerId);
  if ("error" in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });

  const { data } = await a.sb.from("submax_hr_test")
    .select("id, test_date, speed_kmh, duration_s, hrex_bpm, hrr_bpm, notes")
    .eq("player_id", playerId).order("test_date", { ascending: false });
  const tests = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id), test_date: String(r.test_date),
    speed_kmh: r.speed_kmh != null ? Number(r.speed_kmh) : null,
    duration_s: r.duration_s != null ? Number(r.duration_s) : null,
    hrex_bpm: r.hrex_bpm != null ? Number(r.hrex_bpm) : null,
    hrr_bpm: r.hrr_bpm != null ? Number(r.hrr_bpm) : null,
    notes: (r.notes as string | null) ?? null,
  }));
  return NextResponse.json({ ok: true, player_id: playerId, name: a.name, tests });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const playerId = typeof body?.playerId === "string" ? body.playerId : "";
  if (!playerId) return NextResponse.json({ ok: false, error: "Missing playerId" }, { status: 400 });
  const a = await authTeam(req, playerId);
  if ("error" in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });

  const hrexBpm = Number(body?.hrexBpm);
  if (!Number.isFinite(hrexBpm) || hrexBpm < 60 || hrexBpm > 230) {
    return NextResponse.json({ ok: false, error: "HRex must be a plausible heart rate (60-230 bpm)." }, { status: 400 });
  }
  const testDate = typeof body?.testDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.testDate) ? body.testDate : new Date().toISOString().slice(0, 10);

  const { error } = await a.sb.from("submax_hr_test").upsert({
    player_id: playerId, team_id: a.teamId, test_date: testDate,
    hrex_bpm: hrexBpm, hrr_bpm: numOrNull(body?.hrrBpm),
    speed_kmh: numOrNull(body?.speedKmh), duration_s: numOrNull(body?.durationS),
    source: "manual", notes: typeof body?.notes === "string" ? body.notes.slice(0, 200) : null,
  }, { onConflict: "player_id,test_date,source" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, imported: 1, testDate, hrexBpm });
}
