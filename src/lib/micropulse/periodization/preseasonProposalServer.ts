/**
 * Server side of "Build pre-season": gathers the team's data exactly as the hub does (same season rows,
 * team match unit, saved days, camps, cadence, step, aerobic test) and runs the pure builder. Also the
 * accept writer. Team-scoped by the caller (service-role client).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPeriodization } from "./loader";
import { buildPreseasonProposal, type PreseasonProposal, type SavedDay } from "./preseasonProposal";
import { plansNextSeason, preseasonSeasonYear, type PreseasonSavedRow } from "./preseasonWindow";
import { planPreseasonAccept, type AcceptPlan } from "./preseasonAccept";
import { isAerobicMode, type AerobicMode } from "./testingSchedule";
import { writeWeekSetup } from "./weekSetupWrite";
import type { MatchUnitAbs } from "./index";

/** What the coach changed in the draft (stored in plan_proposals.coach_edits). */
export type ProposalEdits = {
  settings?: { preseasonSessions?: number; preseasonWeek1Mult?: number; preWeek1Kpi?: Record<string, number>; preMesoTail?: number[] | null; preTaperPct?: number };
  days?: Record<string, SavedDay>;
};

type Ov = Record<string, unknown> & PreseasonSavedRow & { preseasonStart?: string; seasonEnd?: string; nextPreseasonStart?: string; offseasonWeeks?: number; deloadCadence?: number; blockWeeks?: Record<string, number>; blockDeload?: Record<string, string>; stepPct?: number; aerobicTest?: string };

export type ProposalContext = {
  proposal: PreseasonProposal;
  seasonYear: number;
  plansNext: boolean;
  savedRow: Ov;
  existingDays: Record<string, SavedDay>;
  existingWeekSetups: Record<string, { system_key: string; intensity_target: number }>;
  fixtures: string[];
  breaks: Array<{ start: string; end: string }>;
  existingTests: Array<{ test_key: string; test_date: string }>;
};

const today = () => new Date().toISOString().slice(0, 10);

export async function buildProposalContext(sb: SupabaseClient, teamId: string, opts: { fromScratch: boolean; edits: ProposalEdits }): Promise<ProposalContext | null> {
  const loadedYear = new Date().getUTCFullYear();
  const { data: saved } = await sb.from("season_plans").select("overrides").eq("team_id", teamId).eq("season_year", loadedYear).maybeSingle();
  const ov = ((saved as { overrides?: Ov } | null)?.overrides ?? {}) as Ov;
  const plan = await loadPeriodization(sb, {
    teamId, seasonYear: loadedYear,
    preseasonStart: ov.preseasonStart ?? null, seasonEnd: ov.seasonEnd ?? null, nextPreseasonStart: ov.nextPreseasonStart ?? null,
    offseasonWeeks: ov.offseasonWeeks ?? null, deloadCadence: ov.deloadCadence ?? null, blockWeeksByStart: ov.blockWeeks ?? null, deloadByStart: ov.blockDeload ?? null,
  });
  const plansNext = plansNextSeason(plan);
  const seasonYear = preseasonSeasonYear(plan);
  let savedRow: Ov = ov;
  if (plansNext) {
    const { data: n } = await sb.from("season_plans").select("overrides").eq("team_id", teamId).eq("season_year", seasonYear).maybeSingle();
    savedRow = ((n as { overrides?: Ov } | null)?.overrides ?? {}) as Ov;
  }
  // The team's aerobic test: the loaded season's pick, else the newest season that set one (as the GET does).
  let aerobic: AerobicMode | null = isAerobicMode(ov.aerobicTest) ? (ov.aerobicTest as AerobicMode) : null;
  if (!aerobic) {
    const { data: rows } = await sb.from("season_plans").select("aerobic_test:overrides->>aerobicTest").eq("team_id", teamId).not("overrides->>aerobicTest", "is", null).order("season_year", { ascending: false }).limit(5);
    for (const r of (rows ?? []) as Array<{ aerobic_test: string | null }>) if (isAerobicMode(r.aerobic_test)) { aerobic = r.aerobic_test; break; }
  }

  const t = today();
  const horizon = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: wp }, { data: ws }, { data: camps }, { data: brk }, { data: tests }, { data: fx }] = await Promise.all([
    // Saved days from a year back (the window can start before today), so the draft shows what the hub shows.
    sb.from("week_plans").select("day_date, day_type, focus").eq("team_id", teamId).gte("day_date", new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)).lte("day_date", horizon),
    sb.from("week_setups").select("week_start, system_key, intensity_target").eq("team_id", teamId).gte("week_start", new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)).lte("week_start", horizon),
    sb.from("team_camps").select("start_date, end_date, load_pct, two_a_day").eq("team_id", teamId).gte("end_date", t),
    sb.from("team_breaks").select("start_date, end_date").eq("team_id", teamId).gte("end_date", t),
    sb.from("coach_test_schedule").select("test_key, test_date").eq("team_id", teamId).gte("test_date", t),
    sb.from("match_schedule").select("match_date").eq("team_id", teamId).gte("match_date", t).lte("match_date", horizon),
  ]);
  const existingDays: Record<string, SavedDay> = {};
  for (const r of (wp ?? []) as Array<{ day_date: string; day_type: string; focus: string | null }>) existingDays[r.day_date] = { dayType: r.day_type, focus: r.focus };
  const existingWeekSetups: ProposalContext["existingWeekSetups"] = {};
  for (const r of (ws ?? []) as Array<{ week_start: string; system_key: string; intensity_target: number }>) existingWeekSetups[r.week_start] = { system_key: r.system_key, intensity_target: r.intensity_target };

  // The coach's choices: his saved row + draft edits (from scratch: the draft edits only).
  const edits = opts.edits ?? {};
  const savedForBuild: PreseasonSavedRow = opts.fromScratch ? { ...(edits.settings ?? {}) } : { ...savedRow, ...(edits.settings ?? {}) };
  const daysForBuild: Record<string, SavedDay> = opts.fromScratch ? { ...(edits.days ?? {}) } : { ...existingDays, ...(edits.days ?? {}) };

  // The team match unit for the calendar (the hub's team scope).
  const ta = plan.teamBaseline?.avg;
  const dir = ta?.direction ?? null;
  const unit: MatchUnitAbs = {
    dist: ta?.matchDistanceM ?? null, hsr: ta?.matchHsrM ?? null, load: ta?.matchPlayerLoad ?? null, accdec: ((ta?.matchAccel ?? 0) + (ta?.matchDecel ?? 0)) || null,
    accHiEff: ta?.matchAccelHiEff ?? null, decHiEff: ta?.matchDecelHiEff ?? null, stride: ta?.matchStrideHi ?? null,
    dirFwd: dir?.forward ?? null, dirBack: dir?.backward ?? null, dirLat: dir?.lateral ?? null,
    rhie: ta?.rhieBouts ?? null, symmetry: ta?.runSymmetry ?? null, metPower: ta?.metabolicPower ?? null,
    fr: ta?.matchImaFrDist ?? null, cod: ta?.matchImaCod ?? null, accel: ta?.matchAccel ?? null, decel: ta?.matchDecel ?? null,
  } as MatchUnitAbs;
  const cadence = [4, 5, 6].includes(Number(ov.deloadCadence)) ? Number(ov.deloadCadence) : 4;
  const stepPct = typeof ov.stepPct === "number" && Number.isFinite(ov.stepPct) ? Math.max(0, Math.min(15, ov.stepPct)) : 5;

  const proposal = buildPreseasonProposal({
    phases: plan.phases, today: t, nextFirstFixture: plan.nextFirstFixture, nextFirstFixtureEstimated: plan.nextFirstFixtureEstimated,
    startSetByCoach: !!ov.nextPreseasonStart, saved: savedForBuild,
    matchUnits: plan.players.map((p) => p.matchUnit), matchLoad: plan.matchLoad, matchSrpe: plan.matchSrpe, loadSource: plan.tier.loadSource,
    unit, fixtures: plan.fixtures ?? [],
    camps: ((camps ?? []) as Array<{ start_date: string; end_date: string; load_pct: number; two_a_day: boolean }>).map((c) => ({ start: c.start_date, end: c.end_date, loadPct: c.load_pct, twoADay: c.two_a_day })),
    savedDays: daysForBuild, cadence, baseOverloadPct: 100, stepPct, aerobicMode: aerobic,
    hasVald: plan.players.some((p) => p.vald.status != null),
  });
  if (!proposal) return null;
  return {
    proposal, seasonYear, plansNext, savedRow, existingDays, existingWeekSetups,
    fixtures: Array.from(new Set([...(plan.fixtures ?? []), ...((fx ?? []) as Array<{ match_date: string }>).map((r) => r.match_date)])),
    breaks: ((brk ?? []) as Array<{ start_date: string; end_date: string }>).map((b) => ({ start: b.start_date, end: b.end_date })),
    existingTests: (tests ?? []) as Array<{ test_key: string; test_date: string }>,
  };
}

export function acceptPlanFor(ctx: ProposalContext, opts: { fromScratch: boolean; edits: ProposalEdits }): AcceptPlan {
  return planPreseasonAccept({
    proposal: ctx.proposal, today: today(), existingDays: ctx.existingDays, existingWeekSetups: ctx.existingWeekSetups,
    fixtures: ctx.fixtures, breaks: ctx.breaks, editedDays: Object.keys(opts.edits?.days ?? {}), fromScratch: opts.fromScratch,
    existingTests: ctx.existingTests, plansNext: ctx.plansNext, existingBlockWeeks: ctx.savedRow.blockWeeks ?? null,
  });
}

/** Write an accept plan. Returns an error message, or null. */
export async function writeAcceptPlan(sb: SupabaseClient, teamId: string, userId: string, seasonYear: number, plan: AcceptPlan): Promise<string | null> {
  // 1. Settings → the season row (merge; never drop other keys).
  const { data: existing } = await sb.from("season_plans").select("overrides").eq("team_id", teamId).eq("season_year", seasonYear).maybeSingle();
  const prev = ((existing as { overrides?: Record<string, unknown> } | null)?.overrides) ?? {};
  const { error: sErr } = await sb.from("season_plans").upsert({ team_id: teamId, season_year: seasonYear, overrides: { ...prev, ...plan.overrides }, created_by: userId, updated_at: new Date().toISOString() }, { onConflict: "team_id,season_year" });
  if (sErr) return sErr.message;
  // 2. Days → Week Setup (existing week rows keep their system/intensity).
  const wErr = await writeWeekSetup(sb, teamId, plan.weeks.map((w) => ({ week_start: w.week_start, system_key: w.system_key, intensity_target: w.intensity_target, upsertSetup: w.createSetup, days: w.days })));
  if (wErr) return wErr;
  // 3. Tests → the schedule (only new ones; the unique key ignores a duplicate).
  if (plan.tests.length) {
    const { error: tErr } = await sb.from("coach_test_schedule").upsert(
      plan.tests.map((t) => ({ team_id: teamId, test_key: t.test_key, test_date: t.test_date, note: "Build pre-season", created_by: userId, updated_at: new Date().toISOString() })),
      { onConflict: "team_id,test_key,test_date", ignoreDuplicates: true },
    );
    if (tErr) return tErr.message;
  }
  return null;
}

/** The stored copy of a proposal: everything but the raw engine pieces (calendar internals). */
export function storedProposal(p: PreseasonProposal): Omit<PreseasonProposal, "engine"> {
  const { engine: _engine, ...rest } = p;
  void _engine;
  return rest;
}
