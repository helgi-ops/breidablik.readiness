/**
 * The Meso week Micro seeds from — one computation for the Periodization Hub (live state) and the standalone
 * Week Setup page (the saved settings, read from the same /api/coach/periodization echo the hub loads from).
 *
 *   pre-season → the pre-season plan's week (buildPreseasonProposal), with its assumed game;
 *   in-season  → the Meso block calendar for the team, the block opened at its start (mesoBlockCalendar).
 *
 * Pure. No new numbers or rules — the hub's own derivations, moved here so both pages read the same week.
 */

import { buildMesoBlocks, blockDeloadOf, holdsStandardWeek, inSeasonRange, type MatchUnit, type MatchUnitAbs, type MesoBlock } from "./index";
import { buildPreseasonProposal, type CampRegion, type PreseasonProposal, type PreseasonProposalInput, type SavedDay } from "./preseasonProposal";
import { preseasonSeasonYear, plansNextSeason, preseasonSettingsFrom, type PreseasonSavedRow } from "./preseasonWindow";
import { DEFAULT_AEROBIC_TEST, aerobicModeOf, type AerobicMode } from "./testingSchedule";
import { MESO_HORIZON, mesoBlockCalendar, planDaysFromCalWeek, type MesoWeekSeed, type PlanDay } from "./mesoWeek";

type Bi = { en: string; is: string };
type GoalKey = "accum" | "transmute" | "realize";
type Breaks = Array<{ start_date: string; end_date: string }>;

/** The plan fields the seed reads (the periodization API's `plan`). */
export type SeedPlan = {
  seasonYear: number;
  nextSeasonYear?: number | null;
  phases: Array<{ key: string; label: Bi; start: string; end: string; weeks: number }>;
  fixtures?: string[];
  upcomingFixtures?: string[];
  fixturesEstimated?: boolean;
  nextFirstFixture?: string | null;
  nextFirstFixtureEstimated?: boolean;
  loadCurve?: Array<{ weekStart: string; load: number | null }>;
  matchLoad: number | null;
  matchLoadTeam?: number | null;
  matchSrpe: number | null;
  tier: { loadSource: string };
  players: Array<{ matchUnit: unknown; vald: { status: string | null } }>;
  teamBaseline?: { avg?: TeamAvgLike | null } | null;
};
type TeamAvgLike = {
  direction?: { forward: number; backward: number; lateral: number } | null;
  matchDistanceM?: number | null; matchHsrM?: number | null; matchPlayerLoad?: number | null; matchAccel?: number | null; matchDecel?: number | null;
  matchAccelHiEff?: number | null; matchDecelHiEff?: number | null; matchStrideHi?: number | null; rhieBouts?: number | null; runSymmetry?: number | null;
  metabolicPower?: number | null; matchImaFrDist?: number | null; matchImaCod?: number | null;
};

/** The team's calendar match unit (the hub's Team scope): the squad's match averages. */
export function teamCalendarUnit(ta: TeamAvgLike | null | undefined): MatchUnitAbs {
  const dir = ta?.direction ?? null;
  return {
    dist: ta?.matchDistanceM ?? null, hsr: ta?.matchHsrM ?? null, load: ta?.matchPlayerLoad ?? null, accdec: ((ta?.matchAccel ?? 0) + (ta?.matchDecel ?? 0)) || null,
    accHiEff: ta?.matchAccelHiEff ?? null, decHiEff: ta?.matchDecelHiEff ?? null, stride: ta?.matchStrideHi ?? null,
    dirFwd: dir?.forward ?? null, dirBack: dir?.backward ?? null, dirLat: dir?.lateral ?? null,
    rhie: ta?.rhieBouts ?? null, symmetry: ta?.runSymmetry ?? null, metPower: ta?.metabolicPower ?? null,
    fr: ta?.matchImaFrDist ?? null, cod: ta?.matchImaCod ?? null, accel: ta?.matchAccel ?? null, decel: ta?.matchDecel ?? null,
  };
}

/** The season's Meso blocks (Macro is the control): the season span sliced by the cadence + the coach's block maps. */
export function seasonMesoBlocks(plan: SeedPlan, o: { cadence: number; teamBreaks: Breaks; offseasonStart: string | null; blockWeeks: Record<string, number>; blockDeload: Record<string, string> }): MesoBlock[] {
  if (plan.phases.length === 0) return [];
  const s = plan.phases[0].start, e = plan.phases[plan.phases.length - 1].end;
  const curve = (plan.loadCurve ?? []).map((w) => ({ weekStart: w.weekStart, load: w.load, readiness: null }));
  // TMr divides the team-total weekly loadCurve by the team-total match load (same scale → ~2–5×).
  const compStart = plan.phases.find((p) => p.key === "competitive")?.start ?? null;
  const offPhaseStart = plan.phases.find((p) => p.key === "offseason")?.start ?? null;
  return buildMesoBlocks(s, e, curve, o.cadence, plan.matchLoadTeam ?? plan.matchLoad, plan.fixtures ?? [], compStart, o.teamBreaks, offPhaseStart, o.offseasonStart || null, { blockWeeks: o.blockWeeks, deloadByStart: o.blockDeload, fixturesEstimated: plan.fixturesEstimated });
}

export type PreseasonSeedSettings = NonNullable<PreseasonProposalInput["settingsOverride"]> & { assumedGames: Record<string, number | null> };

/** The pre-season plan's input — the same one the Pre-season page renders from. */
export function preseasonInputFor(plan: SeedPlan, o: {
  today: string; unit: MatchUnitAbs; settings: PreseasonSeedSettings; savedDays: Record<string, SavedDay>; camps: CampRegion[];
  cadence: number; blockWeeks: Record<string, number>; blockGoals: Record<string, string>; baseOverloadPct: number; stepPct: number; aerobicMode: AerobicMode;
}): PreseasonProposalInput {
  return {
    phases: plan.phases, today: o.today, nextFirstFixture: plan.nextFirstFixture, nextFirstFixtureEstimated: plan.nextFirstFixtureEstimated, fixturesEstimated: plan.fixturesEstimated,
    saved: null, settingsOverride: o.settings,
    matchUnits: plan.players.map((p) => p.matchUnit as MatchUnit), matchLoad: plan.matchLoad, matchSrpe: plan.matchSrpe, loadSource: plan.tier.loadSource,
    unit: o.unit, fixtures: [...(plan.fixtures ?? []), ...(plan.upcomingFixtures ?? [])], camps: o.camps, savedDays: o.savedDays,
    cadence: o.cadence, blockWeeks: o.blockWeeks, blockGoals: o.blockGoals, baseOverloadPct: o.baseOverloadPct, stepPct: o.stepPct,
    aerobicMode: o.aerobicMode, hasVald: plan.players.some((p) => p.vald.status != null),
  };
}

export type MesoSeedContext = {
  plan: SeedPlan;
  preProp: PreseasonProposal | null;
  mesoBlocks: MesoBlock[];
  /** The loaded season row's block goals (in-season blocks). */
  blockGoals: Record<string, GoalKey>;
  cadence: number;
  unit: MatchUnitAbs;
  baseOverloadPct: number;
  stepPct: number;
  savedPlans: Record<string, SavedDay>;
  teamBreaks: Breaks;
  camps: CampRegion[];
};

/** The Meso week for a Monday, as week_plans days — null when the week is outside the pre-season plan and the
 *  in-season Meso window (Micro then falls back to its match-anchored grid). */
export function mesoWeekFor(ctx: MesoSeedContext, ws: string): MesoWeekSeed | null {
  const { plan, preProp } = ctx;
  if (plan.phases.length === 0) return null;
  const pw = preProp?.weeks.find((w) => w.weekStart === ws);
  const pcw = preProp?.engine.cal.weeks.find((w) => w.weekStart === ws);
  if (pw && pcw) return { source: "preseason", days: planDaysFromCalWeek(pcw), assumedGame: pw.assumedGame };
  const ph = plan.phases.find((p) => p.start <= ws && ws < p.end);
  if (!ph || ph.key === "preseason") return null;
  const b = ctx.mesoBlocks.find((x) => x.start <= ws && ws < x.end);
  if (!b) return null;
  // The In-season page opens a block at its start and renders its own length, clamped to the horizon.
  const wkMs = 7 * 86_400_000, mon = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.getTime(); };
  const bMon = mon(b.start);
  const idx = Math.round((Date.parse(`${ws}T00:00:00Z`) - bMon) / wkMs);
  const toEnd = Math.round((Date.parse(`${b.end}T00:00:00Z`) - bMon) / wkMs);
  const nWeeks = Math.max(1, Math.min(MESO_HORIZON, toEnd > 0 ? toEnd : ctx.cadence));
  if (idx < 0 || idx >= nWeeks) return null;
  const goal: GoalKey = ctx.blockGoals[b.start] ?? (b.goalKey && b.goalKey !== "deload" ? b.goalKey : "accum");
  const bPhase = plan.phases.find((p) => p.start <= b.start && b.start < p.end)?.label ?? { en: "Season block", is: "Tímabils-lota" };
  const common = { unit: ctx.unit, scopeName: "__team__", baseOverloadPct: ctx.baseOverloadPct, stepPct: ctx.stepPct, allFixtures: plan.fixtures ?? [], goal, deload: blockDeloadOf(b), hold: holdsStandardWeek(b.inSeason, goal), offseasonStart: plan.phases.find((p) => p.key === "offseason")?.start ?? undefined, inSeason: inSeasonRange(plan.phases), noAutoMatch: true };
  const cal = mesoBlockCalendar({
    seed: { ...common, startDate: b.start, numWeeks: MESO_HORIZON }, savedPlans: ctx.savedPlans, teamBreaks: ctx.teamBreaks,
    calendar: { ...common, startDate: b.start, numWeeks: nWeeks, scopePos: null, phase: bPhase, camps: ctx.camps },
  });
  const cw = cal.weeks.find((w) => w.weekStart === ws);
  return cw ? { source: "inseason", days: planDaysFromCalWeek(cw), assumedGame: null } : null;
}

/** Move / remove / restore the assumed game in a pre-season week: the new assumed map + that week re-flowed (its
 *  saved days not read), as the applyWeekSetup payload Meso writes. null = the week is not in the plan. */
export function assumedWeekMove(input: PreseasonProposalInput, weekStart: string, assumedGames: Record<string, number | null>): { week: { week_start: string; system_key: string; intensity_target: number; days: PlanDay[] } } | null {
  const p2 = buildPreseasonProposal({ ...input, settingsOverride: { ...input.settingsOverride!, assumedGames }, ignoreSavedWeeks: [weekStart] });
  const w2 = p2?.engine.cal.weeks.find((w) => w.weekStart === weekStart);
  if (!w2) return null;
  return { week: { week_start: w2.weekStart, system_key: w2.isDeload ? "RECOVERY" : "STRENGTH", intensity_target: w2.isDeload ? 3 : Math.max(3, Math.min(9, Math.round(5 + (w2.mult - 1) * 12))), days: planDaysFromCalWeek(w2) } };
}

// ── The standalone Week Setup page: the same context from the saved settings ────────────────────────────────

type SavedWindowEcho = PreseasonSavedRow & { stepPct?: number | null; offseasonStart?: string | null; blockGoals?: Record<string, GoalKey>; blockWeeks?: Record<string, number>; blockDeload?: Record<string, string>; deloadCadence?: number | null } | null | undefined;
export type PeriodizationEcho = {
  plan: SeedPlan;
  deloadCadence?: number | null;
  savedWindow?: SavedWindowEcho;
  savedWindowNext?: SavedWindowEcho;
  weekPlans?: Array<{ day_date: string; day_type: string | null; focus: string | null }>;
  aerobicTest?: unknown;
};

export type StandaloneMesoSeed = {
  ctx: MesoSeedContext;
  /** The pre-season plan's input (the "No game this week" re-flow needs it). */
  preInput: PreseasonProposalInput;
  /** The season row that holds the planned pre-season's choices (preAssumedGames is saved there). */
  preYear: number;
  assumedGames: Record<string, number | null>;
};

/**
 * The hub's state after its first load, from the same API echo: the loaded row's step / block maps / cadence, and the
 * planned pre-season's settings from the row it belongs to (next season's when one exists — the hub's upcomingYear).
 * Base overload stays at the hub's 100 % (not a saved setting).
 */
export function mesoSeedFromEcho(j: PeriodizationEcho, o: { teamBreaks: Breaks; camps: CampRegion[]; today: string }): StandaloneMesoSeed {
  const plan = j.plan;
  const sw = j.savedWindow ?? {};
  const swn = j.savedWindowNext ?? {};
  const upcoming = plansNextSeason(plan);
  const c = Number(j.deloadCadence);
  const cadence = c === 4 || c === 5 || c === 6 ? c : 4;
  const stepPct = sw.stepPct != null && Number.isFinite(sw.stepPct) ? Math.max(0, Math.min(15, sw.stepPct)) : 5;
  const baseOverloadPct = 100;
  const blockGoals = (sw.blockGoals && typeof sw.blockGoals === "object" ? sw.blockGoals : {}) as Record<string, GoalKey>;
  const blockWeeks = sw.blockWeeks && typeof sw.blockWeeks === "object" ? sw.blockWeeks : {};
  const blockDeload = sw.blockDeload && typeof sw.blockDeload === "object" ? sw.blockDeload : {};
  const savedPlans: Record<string, SavedDay> = {};
  for (const r of j.weekPlans ?? []) if (r?.day_date) savedPlans[r.day_date] = { dayType: String(r.day_type ?? "").toUpperCase(), focus: r.focus ?? null };
  const unit = teamCalendarUnit(plan.teamBaseline?.avg);
  const mesoBlocks = seasonMesoBlocks(plan, { cadence, teamBreaks: o.teamBreaks, offseasonStart: sw.offseasonStart ?? null, blockWeeks, blockDeload });
  const pre = preseasonSettingsFrom(upcoming ? swn : sw);
  const preCadence = upcoming ? (swn.deloadCadence === 4 || swn.deloadCadence === 5 || swn.deloadCadence === 6 ? swn.deloadCadence : cadence) : cadence;
  const preBlockWeeks = upcoming ? (swn.blockWeeks && typeof swn.blockWeeks === "object" ? swn.blockWeeks : {}) : blockWeeks;
  const preBlockGoals = upcoming ? (swn.blockGoals && typeof swn.blockGoals === "object" ? swn.blockGoals : {}) : blockGoals;
  const preInput = preseasonInputFor(plan, {
    today: o.today, unit, savedDays: savedPlans, camps: o.camps, cadence: preCadence, blockWeeks: preBlockWeeks, blockGoals: preBlockGoals, baseOverloadPct, stepPct,
    aerobicMode: aerobicModeOf(j.aerobicTest) ?? DEFAULT_AEROBIC_TEST,
    settings: { sessionsPerWeek: pre.sessionsPerWeek, week1MatchMultiple: pre.week1MatchMultiple, week1Kpi: pre.week1Kpi, mesoTail: pre.mesoTail, taperPct: pre.taperPct, gamesFrom: pre.gamesFrom, assumedGames: pre.assumedGames },
  });
  const preProp = buildPreseasonProposal(preInput);
  return {
    ctx: { plan, preProp, mesoBlocks, blockGoals, cadence, unit, baseOverloadPct, stepPct, savedPlans, teamBreaks: o.teamBreaks, camps: o.camps },
    preInput, preYear: preseasonSeasonYear(plan), assumedGames: pre.assumedGames,
  };
}
