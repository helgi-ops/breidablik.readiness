/**
 * Shared per-player block builder — the canonical implementation behind BOTH the
 * coach Periodization Hub (which passes the coach's edited skeleton + weakness
 * steer) and the player app's read-only "my build-up" view (which passes the
 * active Meso block window and the default, non-steered ramp). One engine, so
 * what the coach plans and what the player sees can never drift.
 *
 * Pure — derives the player's match unit, position emphasis, VALD cap and
 * minutes trim, then calls `buildCalendarBlock`. Never touches the readiness
 * colour. Typed structurally so the client hub types and the server loader types
 * both satisfy it without importing across the client/server boundary.
 */
import { buildCalendarBlock, positionGroup } from "./index";
import type { Bi, BlockDeload, CalType, CalendarBlock, CalWeek, MatchUnitAbs, RecGoalKey, TeamAverages } from "./index";
import { standardTrainingDays, weeklyKpiMultiple } from "./plannedVolume";
import { LIGHT_WEEK_VOL } from "./imaStandard";
import type { WeeklyLoadMetricKey } from "../externalLoad/weeklyLoadTypes";
import type { BuildUpSteer } from "./buildUpSteer";

type Metric = { typical: number | null };
type Confidence = "high" | "medium" | "low";

export interface PlayerBlockPlayer {
  name: string;
  position: string | null;
  vald: { capPct: number | null };
  recentMinutesAvg: number | null;
  matchUnit: {
    nNearFull: number;
    confidence: Confidence;
    load: Metric; hsr: Metric; distance: Metric; accel: Metric; decel: Metric;
    accHiEff: Metric; decHiEff: Metric; stride: Metric; rhie: Metric; symmetry: Metric; metPower: Metric;
    imaFr?: Metric; imaCod?: Metric;
  };
}
export interface PlayerBlockPlan {
  teamBaseline: { avg: TeamAverages };
  positionBaselines: Array<{ key: number; avg: TeamAverages; label: Bi }>;
  fixtures?: string[];
}
export interface PlayerBlockOpts {
  blkStart: string;
  blkWeeks: number;
  phaseLabel: Bi;
  blkBase?: number;
  blkStep?: number;
  /** Coach path: the edited day grid. */
  skeletonSets?: { matchDates: string[]; offDays: string[]; onDays: string[] };
  typeOverrides?: Record<string, CalType>;
  /** Player path: just the window's fixtures — buildCalendarBlock auto-solves the microcycle. */
  matchDates?: string[];
  /** Off-season boundary — when the block spans it, the days after it render as the development build. */
  offseasonStart?: string;
  /** Block goal — shapes the player's ramp volume / taper / strength exactly as the coach's team block. */
  goal?: RecGoalKey;
  /** The block's unload week (`blockDeloadOf`), same as the team calendar. */
  deload?: BlockDeload;
  /** Hold the standard week (`holdsStandardWeek`), same as the team calendar. */
  hold?: boolean;
  /** Training camps overlaid on the block (same as the team block) — concentrated-load periods. */
  camps?: Array<{ start: string; end: string; loadPct: number; twoADay: boolean }>;
  steer?: { active: boolean; steer: BuildUpSteer | null };
  /** The block's matches are FRIENDLIES (pre-season), so they must NOT reduce the training-week alignment
   *  target — a friendly carries its own load but the training week still builds the full ×match volume.
   *  When true the alignment uses a no-match training week; when false (in-season) real matches count. */
  friendlyMatches?: boolean;
}
export interface PlayerBlockResult {
  block: CalendarBlock;
  unit: MatchUnitAbs;
  useOwn: boolean;
  hsrEmph: number;
  mechEmph: number;
  maxMult: number;
  loadScale: number;
  capPct: number | null;
  nNearFull: number;
  avgMin: number | null;
  lighterPct: number;
  confidence: Confidence;
  posLabel: Bi | null;
  steered: boolean;
}

const MIN_SAMPLE = 4;

/** Rescale a built block so each axis's PEAK (non-deload) week sums to the team's weekly ×match multiple for
 *  that variable (plannedVolume) — the same model the Meso tab + the Build-up ramp use. One constant factor
 *  per axis keeps the ramp/deload shape and the day-type distribution; only the absolute level changes.
 *  Mutates `block` in place (buildCalendarBlock returns a fresh block, so there is no shared reference). */
function alignBlockToTeamMultiple(block: CalendarBlock, friendlyMatches: boolean): void {
  // Friendlies (pre-season) don't reduce the training target — a friendly carries its own load but the
  // training week still builds the full no-match ×match volume. Real competitive matches do reduce it.
  const matchDays = friendlyMatches ? 0 : block.weeks.reduce((s, w) => s + w.days.filter((d) => d.type === "match").length, 0);
  const perWk = block.weeks.length ? Math.round(matchDays / block.weeks.length) : 0;
  const preDays = standardTrainingDays(perWk); // the team's training-week shape for this congestion
  const AXIS_KPI: Record<"dist" | "hsr" | "load" | "accdec" | "stride" | "fr" | "cod" | "acc" | "dec", WeeklyLoadMetricKey> = {
    dist: "totalDistance", hsr: "velocityBand5", load: "totalPlayerLoad", accdec: "accelB23", stride: "velocityBand6", fr: "imaFrDistance", cod: "imaCod", acc: "imaAccel", dec: "imaDecel",
  };
  const trainWeeks = block.weeks.filter((w) => !w.isDeload || w.isLight);
  if (!trainWeeks.length) return;
  const peakPct = (sel: (w: CalWeek) => number | null): number => Math.max(0, ...trainWeeks.map((w) => sel(w) ?? 0));
  // A light week counts at its un-cut level on the volume axes, so picking one changes only that week.
  const peakVol = (sel: (w: CalWeek) => number | null): number => Math.max(0, ...trainWeeks.map((w) => (sel(w) ?? 0) / (w.isLight ? LIGHT_WEEK_VOL : 1)));
  const scaleOf = (axis: keyof typeof AXIS_KPI, pk: number): number => {
    if (!pk || pk <= 0) return 1;
    const tm = weeklyKpiMultiple(preDays, AXIS_KPI[axis]);
    return Number.isFinite(tm) && tm > 0 ? (tm * 100) / pk : 1; // tm×100 because pct is ×match ×100
  };
  const sc = {
    dist: scaleOf("dist", peakVol((w) => w.pctRunning)),
    hsr: scaleOf("hsr", peakPct((w) => w.pctHsr)),
    load: scaleOf("load", peakVol((w) => w.pctMech)),
    accdec: scaleOf("accdec", peakVol((w) => w.pctAccDec23)),
    stride: scaleOf("stride", peakPct((w) => w.pctStride)),
    fr: scaleOf("fr", peakPct((w) => w.pctFr ?? null)),
    cod: scaleOf("cod", peakVol((w) => w.pctCod ?? null)),
    acc: scaleOf("acc", peakVol((w) => w.pctAccel ?? null)),
    dec: scaleOf("dec", peakVol((w) => w.pctDecel ?? null)),
  };
  if (!Object.values(sc).some((x) => Math.abs(x - 1) > 0.001)) return; // already aligned
  for (const w of block.weeks) {
    for (const d of w.days) {
      if (d.type === "match" || d.type === "rest") continue;
      if (d.dist != null) d.dist = Math.round((d.dist * sc.dist) / 10) * 10;
      if (d.hsr != null) d.hsr = Math.round((d.hsr * sc.hsr) / 5) * 5;
      if (d.load != null) d.load = Math.round(d.load * sc.load);
      if (d.accHiEff != null) d.accHiEff = Math.round(d.accHiEff * sc.accdec);
      if (d.decHiEff != null) d.decHiEff = Math.round(d.decHiEff * sc.accdec);
      if (d.stride != null) d.stride = Math.round(d.stride * sc.stride);
      if (d.fr != null) d.fr = Math.round((d.fr * sc.fr) / 10) * 10;
      if (d.cod != null) d.cod = Math.round(d.cod * sc.cod);
      if (d.accel != null) d.accel = Math.round(d.accel * sc.acc);
      if (d.decel != null) d.decel = Math.round(d.decel * sc.dec);
    }
    if (w.pctRunning != null) w.pctRunning = Math.round(w.pctRunning * sc.dist);
    if (w.pctHsr != null) w.pctHsr = Math.round(w.pctHsr * sc.hsr);
    if (w.pctMech != null) w.pctMech = Math.round(w.pctMech * sc.load);
    if (w.pctAccDec23 != null) w.pctAccDec23 = Math.round(w.pctAccDec23 * sc.accdec);
    if (w.pctStride != null) w.pctStride = Math.round(w.pctStride * sc.stride);
    if (w.pctFr != null) w.pctFr = Math.round(w.pctFr * sc.fr);
    if (w.pctCod != null) w.pctCod = Math.round(w.pctCod * sc.cod);
    if (w.pctAccel != null) w.pctAccel = Math.round(w.pctAccel * sc.acc);
    if (w.pctDecel != null) w.pctDecel = Math.round(w.pctDecel * sc.dec);
  }
}

export function buildPlayerBlock(plan: PlayerBlockPlan, pl: PlayerBlockPlayer, opts: PlayerBlockOpts): PlayerBlockResult {
  const blkBase = opts.blkBase ?? 100;
  const blkStep = opts.blkStep ?? 5;
  const steerActive = !!opts.steer?.active;
  const steer = opts.steer?.steer ?? null;

  const mu = pl.matchUnit;
  const tb = plan.teamBaseline.avg;
  const dir = tb.direction ?? null;
  const dirFields = { dirFwd: dir?.forward ?? null, dirBack: dir?.backward ?? null, dirLat: dir?.lateral ?? null };
  const teamUnit: MatchUnitAbs = {
    dist: tb.matchDistanceM, hsr: tb.matchHsrM, load: tb.matchPlayerLoad,
    accdec: ((tb.matchAccel ?? 0) + (tb.matchDecel ?? 0)) || null,
    accHiEff: tb.matchAccelHiEff, decHiEff: tb.matchDecelHiEff, stride: tb.matchStrideHi,
    ...dirFields, rhie: tb.rhieBouts, symmetry: tb.runSymmetry, metPower: tb.metabolicPower,
    fr: tb.matchImaFrDist ?? null, cod: tb.matchImaCod ?? null, accel: tb.matchAccel, decel: tb.matchDecel,
  };
  const useOwn = !!(mu && mu.load.typical != null && mu.nNearFull >= MIN_SAMPLE);
  const unit: MatchUnitAbs = useOwn
    ? {
        dist: mu.distance.typical, hsr: mu.hsr.typical, load: mu.load.typical,
        accdec: ((mu.accel.typical ?? 0) + (mu.decel.typical ?? 0)) || null,
        accHiEff: mu.accHiEff.typical, decHiEff: mu.decHiEff.typical, stride: mu.stride.typical,
        ...dirFields, rhie: mu.rhie.typical, symmetry: mu.symmetry.typical, metPower: mu.metPower.typical,
        fr: mu.imaFr?.typical ?? teamUnit.fr ?? null, cod: mu.imaCod?.typical ?? teamUnit.cod ?? null,
        accel: mu.accel.typical, decel: mu.decel.typical,
      }
    : teamUnit;

  const pg = positionGroup(pl.position).key;
  const posB = (plan.positionBaselines ?? []).find((b) => b.key === pg && b.avg.sessions > 0) ?? null;
  const clamp = (x: number) => Math.max(0.85, Math.min(1.15, x));
  const posHsr = posB && posB.avg.hsrM && tb.hsrM ? clamp(posB.avg.hsrM / tb.hsrM) : 1;
  const teamMech = (tb.accel ?? 0) + (tb.decel ?? 0);
  const posMech = (posB?.avg.accel ?? 0) + (posB?.avg.decel ?? 0);
  const posMechEmph = posB && posMech > 0 && teamMech > 0 ? clamp(posMech / teamMech) : 1;
  const hsrEmph = clamp(posHsr * (steerActive && steer ? steer.hsrBoost : 1));
  const mechEmph = clamp(posMechEmph * (steerActive && steer ? steer.mechBoost : 1));

  const capPct = pl.vald.capPct;
  const maxMult = capPct == null ? 1.4 : capPct >= 100 ? 1.4 : capPct >= 85 ? 1.15 : 1.0;
  const n = mu?.nNearFull ?? 0;
  const avgMin = pl.recentMinutesAvg;
  const loadScale = avgMin == null ? 1.0 : avgMin >= 70 ? 0.9 : avgMin >= 40 ? 0.95 : 1.0;

  const skeleton = opts.skeletonSets ?? { matchDates: opts.matchDates ?? [] };
  const block = buildCalendarBlock({
    unit, startDate: opts.blkStart, numWeeks: opts.blkWeeks, scopeName: pl.name, scopePos: pl.position,
    phase: opts.phaseLabel, baseOverloadPct: blkBase, stepPct: blkStep, ...skeleton, typeOverrides: opts.typeOverrides,
    maxMult, loadScale, emphasis: { hsr: hsrEmph, mech: mechEmph, dir: steerActive && steer ? steer.dirEmph : undefined }, offseasonStart: opts.offseasonStart, goal: opts.goal, deload: opts.deload, hold: opts.hold, camps: opts.camps,
    // A held week 1 has to see the match just before the block, as the team calendar does, or it plans a
    // full week of training with no recovery days and sets the peak every other week is scaled against.
    ...(opts.hold && plan.fixtures?.length ? { allFixtures: plan.fixtures } : {}),
  });

  // ── Align the block's weekly VOLUME to the TEAM's ×match multiple PER VARIABLE ──
  // The raw CAL_SHARE day-sum over-loads a week (~1.5× the team's planned ×match). Rescale each axis by a
  // single factor so the PEAK (non-deload) week sums to the team's `weeklyKpiMultiple` for that variable —
  // preserving the day-type shape + the ramp/deload curve. This makes His block, the PDF, the player app and
  // the Build-up ramp all tell the same volume story (the Meso tab already uses this multiple). Best-effort.
  try {
    alignBlockToTeamMultiple(block, !!opts.friendlyMatches);
  } catch { /* alignment is advisory; keep the raw block on any surprise */ }

  const uncappedPeak = Math.min(1.4, (blkBase + (opts.hold ? 0 : blkStep) * Math.max(0, opts.blkWeeks - 2)) / 100);
  const lighterPct = uncappedPeak > 0 ? Math.round((1 - (Math.min(uncappedPeak, maxMult) * loadScale) / uncappedPeak) * 100) : 0;

  return {
    block, unit, useOwn, hsrEmph, mechEmph, maxMult, loadScale, capPct, nNearFull: n, avgMin, lighterPct,
    confidence: useOwn ? mu?.confidence ?? "low" : "low",
    posLabel: posB?.label ?? null,
    steered: steerActive,
  };
}

/** The active Meso block window for a player's "my build-up" view: the block
 *  containing today (or the most recent one), its length, phase label, and the
 *  fixtures inside it. Returns null when the team has no periodization blocks. */
export interface BlockWindowPlan {
  blocks: Array<{ start: string; end: string; weeks: number }>;
  phases: Array<{ start: string; end: string; label: Bi }>;
  fixtures: string[];
}
export function pickActiveBlock(
  plan: BlockWindowPlan,
  todayIso: string,
): { blkStart: string; blkWeeks: number; phaseLabel: Bi; matchDates: string[] } | null {
  const blocks = plan.blocks ?? [];
  if (!blocks.length) return null;
  const active = blocks.find((b) => b.start <= todayIso && todayIso < b.end) ?? blocks[blocks.length - 1];
  const phaseLabel =
    plan.phases.find((ph) => ph.start <= active.start && active.start < ph.end)?.label ?? { en: "Season block", is: "Tímabils-lota" };
  const matchDates = (plan.fixtures ?? []).filter((d) => d >= active.start && d < active.end);
  return { blkStart: active.start, blkWeeks: active.weeks, phaseLabel, matchDates };
}
