export const runtime = "nodejs";

/**
 * GET /api/coach/player/[id]/drill-recommendations?target=style|wcs|both[&md=MD-3]
 *
 * On-pitch drill ideas for ONE player, two complementary ways:
 *   • STYLE  — his movement archetype (athleteProfile percentiles) → recommendFootballDrills:
 *              rehearse (his strengths) + develop (his under-exposed axes vs position).
 *   • WCS    — his worst-case (hardest-minutes) intensity from player_peak_window → matchDrillsToWcs:
 *              drills that reach/exceed it, with intensity levers when below.
 *   • TACTICAL (both paths) — the game situation of his peak window (Ju 2022) from the saved
 *              peak_context_reads fusion → drill-category preference. Off-ball = "needs tracking".
 *   • BOTH   — the intersection: fits his style AND reaches his WCS.
 * Plus each WCS drill's load type + MD-day fit flag (WCS/high-intensity drills belong on MD-3).
 *
 * Descriptive / advisory — the coach picks; never reads or writes the readiness colour or the daily
 * decision. Pure scoring lives in the libs; this route only gathers inputs and composes.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadRoster, loadAthleteSignals, athleteSquadInput } from "@/lib/micropulse/playerAnalysis/loadAthleteProfilesForTeam";
import { buildAthleteProfile } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import { recommendFootballDrills, type PlayerDemand, type DrillRow, type DrillRec } from "@/lib/micropulse/footballDrills/recommend";
import { wcsTargetFromWindows, matchDrillsToWcs, type PeakWindowRow, type WcsDrillRow } from "@/lib/micropulse/footballDrills/wcsDrillMatch";
import { wcsTacticalDrillCategories, drillMatchesTactical } from "@/lib/micropulse/footballDrills/wcsTactical";
import type { ActionShare } from "@/lib/micropulse/peakPeriodContext";
import { classifyDrillLoadType, drillFitForMdDay, type DrillLoadSignal } from "@/lib/micropulse/load/drillMdFit";
import type { SessionLoadType } from "@/lib/micropulse/plannedSessionLoad";

const DRILL_SELECT =
  "id, drill_name, category, drill_format, total_players, duration_min, field_length_m, field_width_m, distance_m, vel_b5, vel_b6, accel_b23, decel_b23, player_load, player_load_per_min, hir_total, max_velocity, ima_cod_total, area_per_player_m2, diagram_url, sport";

type DrillFull = DrillRow & {
  distance_m: number | null; player_load: number | null; hir_total: number | null; max_velocity: number | null;
  ima_cod_total: number | null; area_per_player_m2: number | null; sport: string | null;
};

/** athleteProfile percentile → recommender z (pctl 40 → −0.5 GAP, 60 → +0.5 STRENGTH). */
const pctlToZ = (pctl: number | null): number | null => (pctl == null ? null : (pctl - 50) / 20);

/** MD context → the day's target load type (MD-3 = the locomotive/high-intensity peak day). */
function mdTargetType(md: string | null): SessionLoadType | null {
  if (!md) return null;
  const u = md.toUpperCase();
  if (u === "MD-3") return "locomotive";
  if (u === "MD-4") return "mechanical";
  if (u === "MD-2" || u === "MD-1") return "mixed";
  return "mixed";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  if (!playerId) return NextResponse.json({ ok: false, error: "Missing player id" }, { status: 400 });

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

  const sp = new URL(req.url).searchParams;
  const target = (sp.get("target") ?? "both").toLowerCase() as "style" | "wcs" | "both";
  const md = sp.get("md");

  const roster = await loadRoster(teamId);
  const me = roster.find((r) => r.id === playerId);
  if (!me) return NextResponse.json({ ok: false, error: "Player not on the active roster" }, { status: 404 });

  // Drills (team + public, football/current sport), and the player's peak windows, in parallel.
  const [drillRes, pwRes, signals] = await Promise.all([
    sb.from("drill_library").select(DRILL_SELECT).is("deleted_at", null).or(`team_id.eq.${teamId},team_id.is.null`),
    sb.from("player_peak_window").select("window_min, hsr_m, vb5_m, vb6_m, player_load, ima_accel, ima_decel, ima_cod").eq("player_id", playerId),
    loadAthleteSignals(teamId),
  ]);
  const drills = (drillRes.data ?? []) as DrillFull[];

  // ── STYLE (Part 1) — archetype percentiles → recommender (rehearse=strength, develop=gap) ──
  let style: null | { archetype: { axis: string; label: { en: string; is: string } } | null; rehearse: DrillRec[]; develop: DrillRec[] } = null;
  if (target === "style" || target === "both") {
    const athlete = buildAthleteProfile(athleteSquadInput(roster, signals), playerId);
    const pctl = (id: string): number | null => athlete?.qualities.find((q) => q.id === id)?.positionPercentile ?? null;
    const demands: PlayerDemand[] = [
      { quality: "sprint", value: pctl("speed") ?? 0, z: pctlToZ(pctl("speed")) },
      { quality: "accel", value: pctl("acceleration") ?? 0, z: pctlToZ(pctl("acceleration")) },
      { quality: "decel", value: pctl("deceleration") ?? 0, z: pctlToZ(pctl("deceleration")) },
    ];
    const recs = recommendFootballDrills(demands, drills as DrillRow[]);
    // Lightweight archetype: strongest of speed vs agility (accel/decel/cod), for the label only.
    const speedP = pctl("speed"); const agilP = Math.max(pctl("acceleration") ?? -1, pctl("deceleration") ?? -1, pctl("change_of_direction") ?? -1);
    const archetype = speedP == null && agilP < 0 ? null
      : (speedP ?? -1) >= agilP
        ? { axis: "speed", label: { en: "Speed profile", is: "Hraða-prófíll" } }
        : { axis: "agility", label: { en: "Agility profile (accel/decel/CoD)", is: "Snerpu-prófíll (hröðun/hemlun/stefnubr.)" } };
    style = { archetype, rehearse: recs.filter((r) => r.kind === "strength"), develop: recs.filter((r) => r.kind === "gap") };
  }

  // ── WCS (Part 2) — worst-case target (player, position fallback) → drill reach ──
  let wcs: null | { target: ReturnType<typeof wcsTargetFromWindows>; fits: ReturnType<typeof matchDrillsToWcs> } = null;
  if (target === "wcs" || target === "both") {
    let windows = (pwRes.data ?? []) as PeakWindowRow[];
    let tgt = wcsTargetFromWindows(windows, "player");
    if (!tgt && me.position) {
      // Position fallback — teammates on the same position (labelled "position").
      const samePos = roster.filter((r) => r.position === me.position).map((r) => r.id);
      if (samePos.length) {
        const { data: posRows } = await sb.from("player_peak_window").select("window_min, hsr_m, vb5_m, vb6_m, player_load, ima_accel, ima_decel, ima_cod").in("player_id", samePos);
        windows = (posRows ?? []) as PeakWindowRow[];
        tgt = wcsTargetFromWindows(windows, "position");
      }
    }
    const wcsDrills: WcsDrillRow[] = drills.map((d) => ({
      id: d.id, label: d.drill_name ?? "Drill", player_load_per_min: d.player_load_per_min,
      vel_b5: d.vel_b5, vel_b6: d.vel_b6, accel_b23: d.accel_b23, decel_b23: d.decel_b23,
      ima_cod_total: d.ima_cod_total, duration_min: d.duration_min, area_per_player_m2: d.area_per_player_m2,
    }));
    wcs = { target: tgt, fits: tgt ? matchDrillsToWcs(tgt, wcsDrills) : [] };
  }

  // ── TACTICAL (Part 3) — reuse the saved fusion (peak_context_reads); off-ball = needs tracking ──
  let tactical: ReturnType<typeof wcsTacticalDrillCategories> | null = null;
  {
    const { data: pcr } = await sb.from("peak_context_reads").select("payload").eq("team_id", teamId).order("match_date", { ascending: false }).limit(1).maybeSingle();
    const payload = (pcr as { payload?: { players?: Array<{ playerId: string; windows?: Array<{ windowMin?: number; actions?: ActionShare[] }> }> } } | null)?.payload;
    const meEntry = payload?.players?.find((x) => x.playerId === playerId);
    const wins = meEntry?.windows ?? [];
    // Shortest window with actions = his most intense minutes.
    const w = wins.filter((x) => Array.isArray(x.actions) && x.actions.length).sort((x, y) => (x.windowMin ?? 99) - (y.windowMin ?? 99))[0];
    if (w?.actions) tactical = wcsTacticalDrillCategories(w.actions);
  }

  // ── MD-day fit per drill (reuse drillMdFit) — flags a WCS/high-intensity drill on the wrong day ──
  const dayTarget = mdTargetType(md);
  const mdFitByDrill: Record<string, { drillType: string; fit: string; reason: { en: string; is: string } }> = {};
  for (const d of drills) {
    const sig: DrillLoadSignal = {
      category: d.category ?? "", player_load_per_min: d.player_load_per_min, distance_m: d.distance_m,
      duration_min: d.duration_min, vel_b5: d.vel_b5, vel_b6: d.vel_b6, hir_total: d.hir_total,
      max_velocity: d.max_velocity, accel_b23: d.accel_b23, decel_b23: d.decel_b23, area_per_player_m2: d.area_per_player_m2,
    };
    const loadType = classifyDrillLoadType(sig).type;
    if (dayTarget) {
      const fit = drillFitForMdDay(loadType, dayTarget, md);
      mdFitByDrill[d.id] = { drillType: loadType, fit: fit.fit, reason: fit.reason };
    } else {
      mdFitByDrill[d.id] = { drillType: loadType, fit: "ok", reason: { en: "No MD day selected.", is: "Enginn MD dagur valinn." } };
    }
  }

  // ── BOTH — intersect: fits his style (rehearse) AND reaches his WCS (meets/exceeds) AND tactical-fit ──
  let both: null | Array<{ drillId: string; label: string; verdict: string; overallPct: number | null; category: string | null; diagram_url: string | null }> = null;
  if (target === "both" && wcs?.fits.length) {
    const rehearseIds = new Set((style?.rehearse ?? []).flatMap((r) => r.drills.map((x) => x.id)));
    const catById = new Map(drills.map((d) => [d.id, d.category ?? null]));
    const pref = tactical?.categories ?? [];
    both = wcs.fits
      .filter((f) => (f.verdict === "meets" || f.verdict === "exceeds"))
      .filter((f) => rehearseIds.size === 0 || rehearseIds.has(f.drillId))
      .filter((f) => drillMatchesTactical(catById.get(f.drillId) ?? null, pref))
      .map((f) => ({ drillId: f.drillId, label: f.label, verdict: f.verdict, overallPct: f.overallPct, category: catById.get(f.drillId) ?? null, diagram_url: drills.find((d) => d.id === f.drillId)?.diagram_url ?? null }));
  }

  return NextResponse.json({
    ok: true, playerId, name: me.full_name, position: me.position, target,
    style, wcs, tactical, both, mdFitByDrill,
    diagramById: Object.fromEntries(drills.map((d) => [d.id, d.diagram_url ?? null])),
  });
}
