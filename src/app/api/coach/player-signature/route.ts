export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * GET /api/coach/player-signature?playerId=
 *
 * The player's fused ARCHETYPE (engine x driver x output) + the most-similar players within his
 * position. Reuses loadAthleteProfilesForTeam (whole-squad percentile vectors), the movement
 * archetype from the profile, and loadPlayerOutput for the output qualifier. Scouting/role read —
 * descriptive/advisory, it never touches the readiness colour or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadAthleteProfilesForTeam } from "@/lib/micropulse/playerAnalysis/loadAthleteProfilesForTeam";
import { driverArchetypeFromProfile } from "@/lib/micropulse/roleDemandFit";
import { loadPlayerOutput } from "@/lib/micropulse/loadPlayerOutput";
import { computePlayerSignature, type SignaturePlayer, type OutputQualifier } from "@/lib/micropulse/playerSignature";
import type { AthleteProfile, QualityId } from "@/lib/micropulse/playerAnalysis/athleteProfile";

async function authTeam(req: NextRequest) {
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
  return { sb, teamId } as const;
}

/** AthleteProfile → the position-percentile vector the signature engine ranks on. */
function vectorOf(profile: AthleteProfile | null): Partial<Record<QualityId, number>> {
  const q: Partial<Record<QualityId, number>> = {};
  for (const r of profile?.qualities ?? []) if (r.positionPercentile != null) q[r.id] = r.positionPercentile;
  return q;
}

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { sb, teamId } = auth;
  const playerId = (new URL(req.url).searchParams.get("playerId") ?? "").trim();
  if (!playerId) return NextResponse.json({ ok: false, error: "playerId is required" }, { status: 400 });

  const { roster, profiles } = await loadAthleteProfilesForTeam(teamId);
  const me = roster.find((r) => r.id === playerId);
  if (!me) return NextResponse.json({ ok: false, error: "Player not on this team" }, { status: 404 });

  const pool: SignaturePlayer[] = roster.map((r) => ({ playerId: r.id, name: r.full_name, position: r.position, qualities: vectorOf(profiles.get(r.id) ?? null) }));

  // Output qualifier from his per-90 output vs season norm (same thresholds as Form-vs-State).
  const output = await loadPlayerOutput(sb, teamId, playerId);
  let outputRead: OutputQualifier | null = null;
  if (output && typeof output.per90 === "number" && typeof output.baselinePer90 === "number" && output.baselinePer90 !== 0) {
    const d = (output.per90 - output.baselinePer90) / Math.abs(output.baselinePer90);
    outputRead = d >= 0.10 ? "productive" : d <= -0.15 ? "under" : "at_norm";
  }

  const read = computePlayerSignature({
    target: { playerId: me.id, name: me.full_name, position: me.position, sport: me.sport, qualities: vectorOf(profiles.get(me.id) ?? null), driverPrimary: driverArchetypeFromProfile(profiles.get(me.id) ?? null)?.primary ?? null, outputRead },
    pool,
  });
  return NextResponse.json({ ok: true, read });
}
