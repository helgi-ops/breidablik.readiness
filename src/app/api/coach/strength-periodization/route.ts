export const runtime = "nodejs";

/**
 * GET /api/coach/strength-periodization?playerId=…
 *
 * Per-player PRE-SEASON strength emphasis (Part 2 of the strength-periodization brief), assembled
 * from the player's OWN data: athlete max-strength + power percentiles (athleteProfile), body
 * composition (player_body_metrics), and ledger deficits (unifiedDeficits) + position. Pure logic
 * lives in recommendPreseasonEmphasis; this route only gathers the inputs. Descriptive / advisory —
 * never reads or writes the readiness colour, the load target, or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadRoster, loadAthleteSignals, athleteSquadInput } from "@/lib/micropulse/playerAnalysis/loadAthleteProfilesForTeam";
import { buildAthleteProfile } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import { collectDeficits } from "@/lib/micropulse/unifiedDeficits/collect";
import { recommendPreseasonEmphasis } from "@/lib/micropulse/strengthProgramming/preseasonEmphasis";
import { detectSeasonPhases } from "@/lib/micropulse/periodization";
import { strengthConfigForPhase, type SeasonPhaseKey } from "@/lib/micropulse/strengthProgramming/seasonPhaseStrength";

export async function GET(req: NextRequest) {
  const sb = getSupabase();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing auth" }, { status: 401 });
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  const p = (prof ?? {}) as { role?: string; team_id?: string | null };
  if (!["COACH", "ADMIN", "STAFF"].includes(String(p.role ?? "").toUpperCase())) return NextResponse.json({ ok: false, error: "Coach role required" }, { status: 403 });
  const teamId = p.team_id ?? null;
  if (!teamId) return NextResponse.json({ ok: false, error: "No team context" }, { status: 400 });

  const playerId = (new URL(req.url).searchParams.get("playerId") ?? "").trim();

  // TEAM-LEVEL context (always): season phase + its strength goal (off / pre / in) — the same phase
  // the Periodization Hub detects — and the in-season mode from the team setting (jsonb).
  const [fxRes, tsRes] = await Promise.all([
    sb.from("match_schedule").select("match_date").eq("team_id", teamId).order("match_date", { ascending: true }),
    sb.from("team_settings").select("settings").eq("team_id", teamId).maybeSingle(),
  ]);
  const fixtures = ((fxRes.data ?? []) as Array<{ match_date: string }>).map((r) => ({ date: r.match_date }));
  const phases = detectSeasonPhases(fixtures, null);
  const todayIso = new Date().toISOString().slice(0, 10);
  const curPhase = phases.find((p) => p.start <= todayIso && todayIso < p.end) ?? phases[phases.length - 1] ?? null;
  const phaseKey = (curPhase?.key ?? "competitive") as SeasonPhaseKey;
  const phaseCfg = strengthConfigForPhase(phaseKey);
  const inSeasonMode = ((tsRes.data as { settings?: { in_season_strength_mode?: string } } | null)?.settings?.in_season_strength_mode) === "traditional" ? "traditional" : "microdose";
  const teamContext = { phase: phaseKey, phaseGoal: phaseCfg.verdict, phaseIntensity: phaseCfg.intensity, inSeasonMode };

  // Without a playerId → team-level context only (the Micro-dose page banner uses this).
  if (!playerId) return NextResponse.json({ ok: true, ...teamContext, read: null });

  const roster = await loadRoster(teamId);
  const me = roster.find((r) => r.id === playerId);
  if (!me) return NextResponse.json({ ok: false, error: "Player not on the active roster" }, { status: 404 });

  const [signals, bcRes, deficits] = await Promise.all([
    loadAthleteSignals(teamId),
    sb.from("player_body_metrics").select("mass_kg, body_fat_pct, lean_mass_kg, measured_on").eq("player_id", playerId).order("measured_on", { ascending: false }).limit(1).maybeSingle(),
    collectDeficits(sb, playerId).catch(() => ({ rows: [] as Array<{ quality: string }> })),
  ]);

  const athlete = buildAthleteProfile(athleteSquadInput(roster, signals), playerId);
  const pctl = (id: string): number | null => athlete?.qualities.find((q) => q.id === id)?.positionPercentile ?? null;
  const powerPctl = [pctl("vbt_power"), pctl("reactive_power")].filter((x): x is number => x != null).reduce<number | null>((best, x) => (best == null ? x : Math.max(best, x)), null);

  const bc = (bcRes.data ?? null) as { mass_kg?: number | null; body_fat_pct?: number | null; lean_mass_kg?: number | null } | null;
  const deficitEmphases = ((deficits?.rows ?? []) as Array<{ quality?: string }>).map((r) => String(r.quality ?? "").toLowerCase()).filter(Boolean);

  const read = recommendPreseasonEmphasis({
    maxStrengthPctl: pctl("max_strength"),
    powerPctl,
    bodyFatPct: bc?.body_fat_pct ?? null,
    leanMassKg: bc?.lean_mass_kg ?? null,
    massKg: bc?.mass_kg ?? null,
    deficitEmphases,
    position: me.position,
  });

  return NextResponse.json({ ok: true, ...teamContext, playerId, name: me.full_name, position: me.position, read });
}
