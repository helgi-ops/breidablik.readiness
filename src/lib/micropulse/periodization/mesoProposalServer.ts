/**
 * Server side of "Build meso": loads the season the hub plans (this season while its competitive phase still
 * runs, else the next one once it is known), with the same inputs the hub's Meso tab builds its blocks from
 * (cadence, saved block maps, team breaks, off-season start), and runs the pure builder. Also the accept writer.
 * Team-scoped by the caller (service-role client).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPeriodization } from "./loader";
import { plansNextSeason } from "./preseasonWindow";
import { buildMesoProposal, mesoAcceptSummary, type MesoEdits, type MesoMaps, type MesoProposal, type MesoProposalInput } from "./mesoProposal";
import { guardSeasonWindow } from "./seasonWindowGuard";

type Ov = Record<string, unknown> & {
  preseasonStart?: string; seasonEnd?: string; nextPreseasonStart?: string; offseasonWeeks?: number; offseasonStart?: string;
  deloadCadence?: number; blockWeeks?: Record<string, number>; blockDeload?: Record<string, string>; blockGoals?: Record<string, string>;
};

export type MesoContext = { proposal: MesoProposal; maps: MesoMaps; seasonYear: number; saved: MesoProposalInput["saved"] };

const today = () => new Date().toISOString().slice(0, 10);

async function rowOf(sb: SupabaseClient, teamId: string, year: number): Promise<Ov> {
  const { data } = await sb.from("season_plans").select("overrides").eq("team_id", teamId).eq("season_year", year).maybeSingle();
  return ((data as { overrides?: Ov } | null)?.overrides ?? {}) as Ov;
}

async function planFor(sb: SupabaseClient, teamId: string, year: number, ov: Ov) {
  return loadPeriodization(sb, {
    teamId, seasonYear: year,
    preseasonStart: ov.preseasonStart ?? null, seasonEnd: ov.seasonEnd ?? null, nextPreseasonStart: ov.nextPreseasonStart ?? null,
    offseasonWeeks: ov.offseasonWeeks ?? null, deloadCadence: ov.deloadCadence ?? null, blockWeeksByStart: ov.blockWeeks ?? null, deloadByStart: ov.blockDeload ?? null,
  });
}

export async function buildMesoContext(sb: SupabaseClient, teamId: string, opts: { fromScratch: boolean; edits: MesoEdits }): Promise<MesoContext | null> {
  const t = today();
  let year = new Date().getUTCFullYear();
  let ov = await rowOf(sb, teamId, year);
  let plan = await planFor(sb, teamId, year, ov);
  // This season's competition is over → plan the next one (the row of the season it opens).
  const comp = plan.phases.find((p) => p.key === "competitive");
  if ((!comp || comp.end <= t) && plansNextSeason(plan)) {
    year = plan.nextSeasonYear!;
    ov = await rowOf(sb, teamId, year);
    plan = await planFor(sb, teamId, year, ov);
  }
  if (!plan.phases.length) return null;
  const { data: brk } = await sb.from("team_breaks").select("start_date, end_date").eq("team_id", teamId);
  const cadence = (ov.deloadCadence === 5 || ov.deloadCadence === 6 ? ov.deloadCadence : 4) as 4 | 5 | 6;
  const saved = { blockWeeks: ov.blockWeeks ?? null, blockGoals: ov.blockGoals ?? null, blockDeload: ov.blockDeload ?? null };
  const { proposal, maps } = buildMesoProposal({
    seasonYear: year, today: t, phases: plan.phases, loadCurve: plan.loadCurve, cadence,
    matchLoad: plan.matchLoadTeam ?? plan.matchLoad, fixtures: plan.fixtures ?? [], fixturesEstimated: !!plan.fixturesEstimated,
    breaks: ((brk ?? []) as Array<{ start_date: string; end_date: string }>).filter((b) => b.start_date && b.end_date),
    offseasonBuildStart: typeof ov.offseasonStart === "string" ? ov.offseasonStart : null,
    saved, edits: opts.edits, fromScratch: opts.fromScratch,
  });
  return { proposal, maps, seasonYear: year, saved };
}

export type MesoAcceptSummary = ReturnType<typeof mesoAcceptSummary>;

export function mesoSummary(ctx: MesoContext): MesoAcceptSummary {
  return mesoAcceptSummary(ctx.saved, ctx.maps);
}

/** Write the coach's block choices to the season row (merge; other keys kept). Returns an error, or null. */
export async function writeMesoAccept(sb: SupabaseClient, teamId: string, userId: string, ctx: MesoContext): Promise<string | null> {
  const prev = await rowOf(sb, teamId, ctx.seasonYear);
  const patch = guardSeasonWindow(ctx.seasonYear, { blockWeeks: ctx.maps.blockWeeks, blockGoals: ctx.maps.blockGoals, blockDeload: ctx.maps.blockDeload }).patch;
  const { error } = await sb.from("season_plans").upsert({ team_id: teamId, season_year: ctx.seasonYear, overrides: { ...prev, ...patch }, created_by: userId, updated_at: new Date().toISOString() }, { onConflict: "team_id,season_year" });
  return error ? error.message : null;
}
