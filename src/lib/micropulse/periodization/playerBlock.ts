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
import type { Bi, CalType, CalendarBlock, MatchUnitAbs, TeamAverages } from "./index";
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
  };
}
export interface PlayerBlockPlan {
  teamBaseline: { avg: TeamAverages };
  positionBaselines: Array<{ key: number; avg: TeamAverages; label: Bi }>;
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
  steer?: { active: boolean; steer: BuildUpSteer | null };
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
  };
  const useOwn = !!(mu && mu.load.typical != null && mu.nNearFull >= MIN_SAMPLE);
  const unit: MatchUnitAbs = useOwn
    ? {
        dist: mu.distance.typical, hsr: mu.hsr.typical, load: mu.load.typical,
        accdec: ((mu.accel.typical ?? 0) + (mu.decel.typical ?? 0)) || null,
        accHiEff: mu.accHiEff.typical, decHiEff: mu.decHiEff.typical, stride: mu.stride.typical,
        ...dirFields, rhie: mu.rhie.typical, symmetry: mu.symmetry.typical, metPower: mu.metPower.typical,
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
    maxMult, loadScale, emphasis: { hsr: hsrEmph, mech: mechEmph },
  });

  const uncappedPeak = Math.min(1.4, (blkBase + blkStep * Math.max(0, opts.blkWeeks - 2)) / 100);
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
