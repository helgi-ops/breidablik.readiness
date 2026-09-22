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
import { buildMesoBlocks } from "@/lib/micropulse/periodization";
import { loadPeriodization } from "@/lib/micropulse/periodization/loader";
import { strengthConfigForPhase, strengthForBlockGoal, type SeasonPhaseKey } from "@/lib/micropulse/strengthProgramming/seasonPhaseStrength";

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
  // AND the same meso blocks the Periodization Hub builds (one spine) — plus the in-season mode.
  const todayIso = new Date().toISOString().slice(0, 10);
  const [spRes, tsRes] = await Promise.all([
    sb.from("season_plans").select("overrides").eq("team_id", teamId).eq("season_year", new Date().getUTCFullYear()).maybeSingle(),
    sb.from("team_settings").select("settings").eq("team_id", teamId).maybeSingle(),
  ]);
  const ov = (spRes.data as { overrides?: { preseasonStart?: string; seasonEnd?: string; deloadCadence?: number } } | null)?.overrides ?? {};
  const cadence = ([4, 5, 6].includes(Number(ov.deloadCadence)) ? Number(ov.deloadCadence) : 4) as 4 | 5 | 6;

  const plan = await loadPeriodization(sb, { teamId, preseasonStart: ov.preseasonStart ?? null, seasonEnd: ov.seasonEnd ?? null });
  const phases = plan.phases;
  const curPhase = phases.find((p) => p.start <= todayIso && todayIso < p.end) ?? phases[phases.length - 1] ?? null;
  const phaseKey = (curPhase?.key ?? "competitive") as SeasonPhaseKey;
  const phaseCfg = strengthConfigForPhase(phaseKey);
  const inSeasonMode = ((tsRes.data as { settings?: { in_season_strength_mode?: string } } | null)?.settings?.in_season_strength_mode) === "traditional" ? "traditional" : "microdose";

  // Current meso block (same segmentation as the Hub) → its strength scheme (the meso lane).
  let currentBlock: null | { goalKey: string; phaseLabel: { en: string; is: string }; quality: { en: string; is: string }; pct1rm: { en: string; is: string }; scheme: { en: string; is: string }; cite: string } = null;
  if (phases.length) {
    const blocks = buildMesoBlocks(phases[0].start, phases[phases.length - 1].end, plan.loadCurve, cadence, plan.matchLoadTeam ?? plan.matchLoad, plan.fixtures);
    const compStart = phases.find((p) => p.key === "competitive")?.start ?? null;
    const cur = blocks.find((b) => b.start <= todayIso && todayIso <= b.end) ?? null;
    if (cur) {
      const blockPhase: SeasonPhaseKey = compStart && cur.start < compStart ? "preseason" : "competitive";
      const s = strengthForBlockGoal(cur.goalKey, blockPhase);
      currentBlock = { goalKey: cur.goalKey, phaseLabel: cur.phase, quality: s.quality, pct1rm: s.pct1rm, scheme: s.scheme, cite: s.cite };
    }
  }
  const teamContext = { phase: phaseKey, phaseGoal: phaseCfg.verdict, phaseIntensity: phaseCfg.intensity, inSeasonMode, currentBlock };

  // Batch (?all=1) → the whole roster's pre-season emphasis in one call (for the Micro-dose cards).
  // Percentiles + body comp only (no per-player deficit round-trips); the injury overlay + full read
  // stay on the Periodization Hub's per-player card.
  if (new URL(req.url).searchParams.get("all")) {
    const roster = await loadRoster(teamId);
    const signals = await loadAthleteSignals(teamId);
    const ids = roster.map((r) => r.id);
    const { data: bcRows } = ids.length
      ? await sb.from("player_body_metrics").select("player_id, mass_kg, body_fat_pct, lean_mass_kg, measured_on").in("player_id", ids).order("measured_on", { ascending: false })
      : { data: [] };
    const bcByPlayer = new Map<string, { mass_kg?: number | null; body_fat_pct?: number | null; lean_mass_kg?: number | null }>();
    for (const r of (bcRows ?? []) as Array<{ player_id: string; mass_kg?: number | null; body_fat_pct?: number | null; lean_mass_kg?: number | null }>) {
      if (!bcByPlayer.has(r.player_id)) bcByPlayer.set(r.player_id, r); // first row = latest (ordered desc)
    }
    const input = athleteSquadInput(roster, signals);
    const players = roster.map((r) => {
      const athlete = buildAthleteProfile(input, r.id);
      const q = (id: string): number | null => athlete?.qualities.find((x) => x.id === id)?.positionPercentile ?? null;
      const powerPctl = [q("vbt_power"), q("reactive_power")].filter((x): x is number => x != null).reduce<number | null>((best, x) => (best == null ? x : Math.max(best, x)), null);
      const bc = bcByPlayer.get(r.id);
      const rd = recommendPreseasonEmphasis({ maxStrengthPctl: q("max_strength"), powerPctl, bodyFatPct: bc?.body_fat_pct ?? null, leanMassKg: bc?.lean_mass_kg ?? null, massKg: bc?.mass_kg ?? null, deficitEmphases: [], position: r.position });
      return { playerId: r.id, emphasis: rd.emphasis, secondary: rd.secondary, confidence: rd.confidence, needsBodyComp: rd.needsBodyComp };
    });
    return NextResponse.json({ ok: true, ...teamContext, players });
  }

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
