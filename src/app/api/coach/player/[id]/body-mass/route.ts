export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/player/[id]/body-mass
 *   GET  → resolved body mass (coach entry preferred, else VALD CMJ weight) + history
 *   POST { massKg, heightCm?, measuredOn?, note? } → record a coach measurement
 *
 * The anthropometry input for per-kg metrics (#5). Coach-entered mass is the ground truth;
 * the VALD CMJ test weight is the fallback; nothing is ever assumed. Descriptive context —
 * it never touches the readiness colour, the load target, or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { resolveBodyMass, type BodyMassMeasurement } from "@/lib/micropulse/load/bodyMass";

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

/** The player's latest VALD CMJ test weight, resolved via the athlete-id link. Null if none. */
async function valdWeight(sb: ReturnType<typeof getSupabase>, playerId: string): Promise<BodyMassMeasurement | null> {
  const { data: fd } = await sb.from("vald_forcedecks_results")
    .select("vald_athlete_id").eq("microplayer_id", playerId).order("test_timestamp", { ascending: false }).limit(1).maybeSingle();
  const athleteId = (fd as { vald_athlete_id?: string } | null)?.vald_athlete_id;
  if (!athleteId) return null;
  const { data: raw } = await sb.from("vald_raw_tests")
    .select("payload, test_timestamp").eq("test_type", "CMJ").eq("vald_athlete_id", athleteId)
    .order("test_timestamp", { ascending: false }).limit(1).maybeSingle();
  const w = Number((raw as { payload?: { weight?: unknown } } | null)?.payload?.weight);
  if (!Number.isFinite(w) || w <= 0) return null;
  return { massKg: Math.round(w * 10) / 10, measuredOn: String((raw as { test_timestamp?: string }).test_timestamp ?? "").slice(0, 10) || null, source: "vald" };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const a = await authTeam(req, playerId);
  if ("error" in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });

  const { data: manual } = await a.sb.from("player_body_metrics")
    .select("mass_kg, height_cm, measured_on, source, note").eq("player_id", playerId).order("measured_on", { ascending: false });
  const manualMs: BodyMassMeasurement[] = ((manual ?? []) as Array<{ mass_kg: number; measured_on: string; source: string }>)
    .map((m) => ({ massKg: Number(m.mass_kg), measuredOn: String(m.measured_on), source: (m.source as BodyMassMeasurement["source"]) ?? "coach" }));
  const vald = await valdWeight(a.sb, playerId);
  const resolved = resolveBodyMass([...manualMs, ...(vald ? [vald] : [])]);

  return NextResponse.json({ ok: true, player_id: playerId, name: a.name, resolved, history: manual ?? [], valdWeight: vald?.massKg ?? null });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const a = await authTeam(req, playerId);
  if ("error" in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });

  const body = await req.json().catch(() => ({}));
  const massKg = Number(body?.massKg);
  if (!Number.isFinite(massKg) || massKg <= 20 || massKg >= 200) return NextResponse.json({ ok: false, error: "massKg must be a plausible bodyweight (20–200 kg)." }, { status: 400 });
  const heightCm = Number.isFinite(Number(body?.heightCm)) && Number(body.heightCm) > 100 && Number(body.heightCm) < 230 ? Number(body.heightCm) : null;
  const measuredOn = typeof body?.measuredOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.measuredOn) ? body.measuredOn : new Date().toISOString().slice(0, 10);

  const { error } = await a.sb.from("player_body_metrics").insert({
    player_id: playerId, team_id: a.teamId, mass_kg: Math.round(massKg * 10) / 10, height_cm: heightCm,
    measured_on: measuredOn, source: "coach", note: typeof body?.note === "string" ? body.note.slice(0, 200) : null, created_by: a.userId,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, imported: 1, measuredOn, massKg: Math.round(massKg * 10) / 10 });
}
