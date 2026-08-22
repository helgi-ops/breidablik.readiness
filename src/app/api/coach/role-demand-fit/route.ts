export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * GET /api/coach/role-demand-fit
 *   ?list=1              → active players (picker)
 *   ?roster=1            → every player's engine-fit for his role, ranked (scouting/selection)
 *   ?playerId=&lang=     → the full fused Role-Demand Fit read for one player
 *
 * Fuses the physical ENGINE (athlete-profile position percentiles, reused from Game-Plan Fit's
 * loader) x ROLE DEMAND (roleModel) x DRIVER (movement archetype from the profile) x OUTPUT
 * (per-90 tactical production vs season norm, reused from Form-vs-State). Development / scouting
 * read — layered beside readiness, it NEVER reads-as or writes the readiness colour, the load
 * target, or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadAthleteProfilesForTeam } from "@/lib/micropulse/playerAnalysis/loadAthleteProfilesForTeam";
import { computeRoleDemandFit, driverArchetypeFromProfile, type OutputInput } from "@/lib/micropulse/roleDemandFit";
import { juPositionGroup } from "@/lib/micropulse/positionStyle";

const OBV_KEY = "OBV";
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const obvOf = (metrics: unknown): number | null => (metrics && typeof metrics === "object" ? num((metrics as Record<string, unknown>)[OBV_KEY]) : null);

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

/** Per-90 output vs his season OBV norm (mirrors Form-vs-State: match OBV total ~= a starter's per-90 rate). */
async function loadOutput(sb: ReturnType<typeof getSupabase>, teamId: string, playerId: string): Promise<OutputInput> {
  const { data: pmData } = await sb.from("player_match_stats")
    .select("match_date, metrics").eq("team_id", teamId).eq("player_id", playerId);
  const byDate = new Map<string, number>();
  for (const r of (pmData ?? []) as Array<Record<string, unknown>>) {
    const d = String(r.match_date ?? ""); const v = obvOf(r.metrics);
    if (!d || v == null) continue;
    if (!byDate.has(d)) byDate.set(d, v); // one per date
  }
  const vals = [...byDate.values()];
  const per90 = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  const { data: seasonRows } = await sb.from("player_season_stats").select("metrics").eq("team_id", teamId).eq("player_id", playerId);
  let baselinePer90: number | null = null;
  for (const s of (seasonRows ?? []) as Array<Record<string, unknown>>) { const v = obvOf(s.metrics); if (v != null) { baselinePer90 = v; break; } }
  if (per90 == null && baselinePer90 == null) return null;
  return { per90, baselinePer90, matches: vals.length };
}

export async function GET(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const { sb, teamId } = auth;
  const p = new URL(req.url).searchParams;

  const { roster, profiles } = await loadAthleteProfilesForTeam(teamId);
  const active = roster.filter((r) => juPositionGroup(r.position, r.sport) != null);

  // Picker.
  if (p.get("list")) {
    const players = active
      .map((r) => ({ playerId: r.id, name: r.full_name, position: r.position }))
      .sort((a, b) => a.name.localeCompare(b.name, "is"));
    return NextResponse.json({ ok: true, players });
  }

  // Roster ranking — engine-fit only (no output/driver), cheap: one loader call, no per-player queries.
  if (p.get("roster")) {
    const rows = active.map((r) => {
      const read = computeRoleDemandFit({
        playerId: r.id, name: r.full_name, position: r.position, sport: r.sport,
        profile: profiles.get(r.id) ?? null, driver: null, output: null,
      });
      return { playerId: r.id, name: r.full_name, position: r.position, role: read.roleLabel, band: read.engine.band, score: read.engine.score, confidence: read.confidence };
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name, "is"));
    return NextResponse.json({ ok: true, roster: rows });
  }

  const playerId = (p.get("playerId") ?? "").trim();
  if (!playerId) return NextResponse.json({ ok: false, error: "playerId is required" }, { status: 400 });
  const r = roster.find((x) => x.id === playerId);
  if (!r) return NextResponse.json({ ok: false, error: "Player not on this team" }, { status: 404 });

  const profile = profiles.get(playerId) ?? null;
  const output = await loadOutput(sb, teamId, playerId);
  const read = computeRoleDemandFit({
    playerId, name: r.full_name, position: r.position, sport: r.sport,
    subRole: (p.get("subRole") ?? "").trim() || null,
    profile, driver: driverArchetypeFromProfile(profile), output,
  });
  return NextResponse.json({ ok: true, asOf: new Date().toISOString().slice(0, 10), read });
}
