export const runtime = "nodejs";

/**
 * GET /api/coach/team/drill-recommendations?scope=position|team[&juGroup=WOP][&md=MD-3]
 *
 * The worst-case drill recommender at GROUP scope — a position group or the whole squad. Each player's
 * own worst-case (from player_peak_window) is aggregated (mean per axis) into ONE group target, then
 * drills are scored against it (reach / levers), with the group's dominant tactical situation from the
 * saved peak_context_reads fusion. Injured players excluded. Descriptive — never the readiness colour.
 *
 * Group STYLE (which drills close a squad's under-exposure) is the existing Train-like-you-play
 * gap-drills panel; this endpoint owns the group WORST-CASE, which had no group view before.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { loadRoster } from "@/lib/micropulse/playerAnalysis/loadAthleteProfilesForTeam";
import { juPositionGroup, JU_GROUP_LABEL, type JuGroup } from "@/lib/micropulse/positionStyle";
import { wcsTargetFromWindows, aggregateWcsTargets, matchDrillsToWcs, type PeakWindowRow, type WcsDrillRow } from "@/lib/micropulse/footballDrills/wcsDrillMatch";
import { wcsTacticalDrillCategories } from "@/lib/micropulse/footballDrills/wcsTactical";
import { composeWcsBrief } from "@/lib/micropulse/footballDrills/wcsBrief";
import type { ActionShare, TacticalAction } from "@/lib/micropulse/peakPeriodContext";
import { ACTION_LABEL } from "@/lib/micropulse/peakPeriodContext";
import { classifyDrillLoadType, drillFitForMdDay, type DrillLoadSignal } from "@/lib/micropulse/load/drillMdFit";
import type { SessionLoadType } from "@/lib/micropulse/plannedSessionLoad";

const DRILL_SELECT =
  "id, drill_name, category, drill_format, total_players, duration_min, field_length_m, field_width_m, distance_m, vel_b5, vel_b6, accel_b23, decel_b23, player_load, player_load_per_min, hir_total, max_velocity, ima_cod_total, area_per_player_m2, diagram_url, sport";
const INJURED = new Set(["injured", "rehabilitation", "rtp_training"]);
const PW_SELECT = "player_id, window_min, hsr_m, vb5_m, vb6_m, player_load, ima_accel, ima_decel, ima_cod";

type DrillFull = {
  id: string; drill_name: string | null; category: string | null; duration_min: number | null;
  distance_m: number | null; vel_b5: number | null; vel_b6: number | null; accel_b23: number | null;
  decel_b23: number | null; player_load: number | null; player_load_per_min: number | null;
  hir_total: number | null; max_velocity: number | null; ima_cod_total: number | null;
  area_per_player_m2: number | null; diagram_url: string | null;
};

function mdTargetType(md: string | null): SessionLoadType | null {
  if (!md) return null;
  const u = md.toUpperCase();
  if (u === "MD-3") return "locomotive";
  if (u === "MD-4") return "mechanical";
  return "mixed";
}

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

  const sp = new URL(req.url).searchParams;
  const scope = (sp.get("scope") ?? "team").toLowerCase() === "position" ? "position" : "team";
  const juGroup = (sp.get("juGroup") ?? "").toUpperCase() as JuGroup | "";
  const md = sp.get("md");

  const roster = await loadRoster(teamId);

  // Position groups present in the roster (for the picker).
  const groupsPresent = new Map<JuGroup, number>();
  for (const r of roster) {
    const g = juPositionGroup(r.position, r.sport);
    if (g) groupsPresent.set(g, (groupsPresent.get(g) ?? 0) + 1);
  }
  const availableGroups = [...groupsPresent.entries()].map(([g, n]) => ({ juGroup: g, label: JU_GROUP_LABEL[g], count: n }));

  // Injured exclusion (group runs).
  const { data: injRows } = await sb.from("player_injuries").select("player_id, status, updated_at").eq("team_id", teamId).order("updated_at", { ascending: false });
  const injured = new Set<string>();
  const seen = new Set<string>();
  for (const r of (injRows ?? []) as Array<{ player_id: string; status: string | null }>) {
    if (seen.has(r.player_id)) continue; seen.add(r.player_id);
    if (INJURED.has(String(r.status ?? "").toLowerCase())) injured.add(r.player_id);
  }

  // The group = a position (juGroup) or the whole squad, minus injured.
  const group = roster.filter((r) => !injured.has(r.id) && (scope === "team" || (juGroup && juPositionGroup(r.position, r.sport) === juGroup)));
  const groupIds = group.map((r) => r.id);
  const groupLabel = scope === "position" && juGroup ? JU_GROUP_LABEL[juGroup] : { en: "Whole squad", is: "Allt liðið" };

  if (groupIds.length === 0) {
    return NextResponse.json({ ok: true, scope, juGroup: juGroup || null, groupLabel, availableGroups, players: 0, wcs: { target: null, fits: [] }, tactical: null, mdFitByDrill: {}, diagramById: {} });
  }

  const [drillRes, pwRes, pcrRes] = await Promise.all([
    sb.from("drill_library").select(DRILL_SELECT).is("deleted_at", null).or(`team_id.eq.${teamId},team_id.is.null`),
    sb.from("player_peak_window").select(PW_SELECT).in("player_id", groupIds),
    sb.from("peak_context_reads").select("payload").eq("team_id", teamId).order("match_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const drills = (drillRes.data ?? []) as DrillFull[];

  // Per-player worst-case → aggregate to the group target.
  const winsByPlayer = new Map<string, PeakWindowRow[]>();
  for (const r of (pwRes.data ?? []) as Array<PeakWindowRow & { player_id: string }>) {
    const arr = winsByPlayer.get(r.player_id) ?? []; arr.push(r); winsByPlayer.set(r.player_id, arr);
  }
  const perPlayerTargets = groupIds.map((id) => wcsTargetFromWindows(winsByPlayer.get(id) ?? [], "player")).filter((t): t is NonNullable<typeof t> => t != null);
  const groupTarget = aggregateWcsTargets(perPlayerTargets, "position");
  const contributing = perPlayerTargets.length;

  const wcsDrills: WcsDrillRow[] = drills.map((d) => ({
    id: d.id, label: d.drill_name ?? "Drill", player_load_per_min: d.player_load_per_min,
    vel_b5: d.vel_b5, vel_b6: d.vel_b6, accel_b23: d.accel_b23, decel_b23: d.decel_b23,
    ima_cod_total: d.ima_cod_total, duration_min: d.duration_min, area_per_player_m2: d.area_per_player_m2,
  }));
  const fits = groupTarget ? matchDrillsToWcs(groupTarget, wcsDrills) : [];

  // Tactical — sum each group player's shortest-window action counts → the group's dominant situation.
  let tactical: ReturnType<typeof wcsTacticalDrillCategories> | null = null;
  const payload = (pcrRes.data as { payload?: { players?: Array<{ playerId: string; windows?: Array<{ windowMin?: number; actions?: ActionShare[] }> }> } } | null)?.payload;
  if (payload?.players?.length) {
    const groupSet = new Set(groupIds);
    const counts = new Map<TacticalAction, number>();
    for (const entry of payload.players) {
      if (!groupSet.has(entry.playerId)) continue;
      const w = (entry.windows ?? []).filter((x) => Array.isArray(x.actions) && x.actions.length).sort((x, y) => (x.windowMin ?? 99) - (y.windowMin ?? 99))[0];
      for (const act of w?.actions ?? []) counts.set(act.action, (counts.get(act.action) ?? 0) + act.count);
    }
    if (counts.size) {
      const shares: ActionShare[] = [...counts.entries()].map(([action, count]) => ({ action, label: ACTION_LABEL[action], count, share: count, obv: null, offBall: false }));
      tactical = wcsTacticalDrillCategories(shares);
    }
  }

  // MD-day fit per drill.
  const dayTarget = mdTargetType(md);
  const mdFitByDrill: Record<string, { drillType: string; fit: string; reason: { en: string; is: string } }> = {};
  for (const d of drills) {
    const sig: DrillLoadSignal = {
      category: d.category ?? "", player_load_per_min: d.player_load_per_min, distance_m: d.distance_m,
      duration_min: d.duration_min, vel_b5: d.vel_b5, vel_b6: d.vel_b6, hir_total: d.hir_total,
      max_velocity: d.max_velocity, accel_b23: d.accel_b23, decel_b23: d.decel_b23, area_per_player_m2: d.area_per_player_m2,
    };
    const loadType = classifyDrillLoadType(sig).type;
    mdFitByDrill[d.id] = dayTarget
      ? { drillType: loadType, ...(() => { const f = drillFitForMdDay(loadType, dayTarget, md); return { fit: f.fit, reason: f.reason }; })() }
      : { drillType: loadType, fit: "ok", reason: { en: "No MD day selected.", is: "Enginn MD dagur valinn." } };
  }

  const brief = composeWcsBrief({ scopeLabel: groupLabel, target: groupTarget, tactical, coverage: { contributing, total: groupIds.length } });

  return NextResponse.json({
    ok: true, scope, juGroup: juGroup || null, groupLabel, availableGroups,
    players: groupIds.length, contributing,
    wcs: { target: groupTarget, fits }, tactical, brief, mdFitByDrill,
    diagramById: Object.fromEntries(drills.map((d) => [d.id, d.diagram_url ?? null])),
  });
}
