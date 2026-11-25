/**
 * Server side of "Build macro": picks the season the hub plans (this season while its competition still runs,
 * else the next one once it is known), builds its phases with the saved ∪ draft dates, and runs the pure
 * builder. Also the accept writer. Team-scoped by the caller (service-role client).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPeriodization } from "./loader";
import { plansNextSeason } from "./preseasonWindow";
import { buildMacroProposal, macroAcceptSummary, mergeMacroDates, type MacroEdits, type MacroProposal, type MacroSaved } from "./macroProposal";
import { guardSeasonWindow } from "./seasonWindowGuard";

type Ov = Record<string, unknown> & MacroSaved & { offseasonWeeks?: number | null; deloadCadence?: number; blockWeeks?: Record<string, number>; blockDeload?: Record<string, string> };

export type MacroContext = { proposal: MacroProposal; seasonYear: number; saved: MacroSaved };

const today = () => new Date().toISOString().slice(0, 10);

async function rowOf(sb: SupabaseClient, teamId: string, year: number): Promise<Ov> {
  const { data } = await sb.from("season_plans").select("overrides").eq("team_id", teamId).eq("season_year", year).maybeSingle();
  return ((data as { overrides?: Ov } | null)?.overrides ?? {}) as Ov;
}

const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function buildMacroContext(sb: SupabaseClient, teamId: string, opts: { fromScratch: boolean; edits: MacroEdits }): Promise<MacroContext | null> {
  const plan0Year = new Date().getUTCFullYear();
  const load = async (year: number, ov: Ov) => {
    const d = mergeMacroDates(savedOf(ov), opts.edits, opts.fromScratch);
    return loadPeriodization(sb, {
      teamId, seasonYear: year, preseasonStart: d.preseasonStart ?? null, seasonEnd: d.seasonEnd ?? null, nextPreseasonStart: d.nextPreseasonStart ?? null,
      offseasonWeeks: ov.offseasonWeeks ?? null, deloadCadence: ov.deloadCadence ?? null, blockWeeksByStart: ov.blockWeeks ?? null, deloadByStart: ov.blockDeload ?? null,
    });
  };
  let year = plan0Year;
  let ov = await rowOf(sb, teamId, year);
  let plan = await load(year, ov);
  const comp = plan.phases.find((p) => p.key === "competitive");
  if ((!comp || comp.end <= today()) && plansNextSeason(plan)) {
    year = plan.nextSeasonYear!;
    ov = await rowOf(sb, teamId, year);
    plan = await load(year, ov);
  }
  const saved = savedOf(ov);
  const proposal = buildMacroProposal({
    seasonYear: year, today: today(), phases: plan.phases, fixturesEstimated: !!plan.fixturesEstimated, fixtureCount: (plan.fixtures ?? []).length,
    saved, edits: opts.edits, fromScratch: opts.fromScratch,
  });
  return { proposal, seasonYear: year, saved };
}

function savedOf(ov: Ov): MacroSaved {
  return {
    preseasonStart: iso(ov.preseasonStart), seasonEnd: iso(ov.seasonEnd), offseasonStart: iso(ov.offseasonStart), nextPreseasonStart: iso(ov.nextPreseasonStart),
    offseasonWeeks: typeof ov.offseasonWeeks === "number" ? ov.offseasonWeeks : null,
  };
}

export function macroSummary(ctx: MacroContext) {
  return macroAcceptSummary(ctx.saved, ctx.proposal.write);
}

/** Write the season dates to the season row (merge; other keys kept; another season's dates dropped). */
export async function writeMacroAccept(sb: SupabaseClient, teamId: string, userId: string, ctx: MacroContext): Promise<string | null> {
  const prev = await rowOf(sb, teamId, ctx.seasonYear);
  const { patch, dropped } = guardSeasonWindow(ctx.seasonYear, { ...ctx.proposal.write });
  if (dropped.length) return `Dates outside season ${ctx.seasonYear}: ${dropped.join(", ")}`;
  const { error } = await sb.from("season_plans").upsert({ team_id: teamId, season_year: ctx.seasonYear, overrides: { ...prev, ...patch }, created_by: userId, updated_at: new Date().toISOString() }, { onConflict: "team_id,season_year" });
  return error ? error.message : null;
}
