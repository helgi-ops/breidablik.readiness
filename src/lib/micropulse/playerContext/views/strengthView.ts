/**
 * playerContext / strengthView
 *
 * The governed view that projects the shared PlayerContext into the exact
 * `PlayerStrengthSnapshot` the strength engine consumes. PURE — no IO. This is
 * the first of the view accessors the whole north-star inherits: a surface reads
 * the context only through its view, never the raw domains.
 *
 * CONTRACT: the output must be byte-identical to what `loadPlayerStrengthSnapshot`
 * produced before convergence (the reads moved into `buildPlayerContext`; the
 * field mapping lives here). Strength is NOT a walled view — a strength session
 * legitimately reads injury STATUS to deload — so it does not call the medical
 * leak guard.
 */

import type { PlayerContext } from "../index";
import type { PlayerStrengthSnapshot } from "../../strengthProgramming/types";

export function strengthView(ctx: PlayerContext): PlayerStrengthSnapshot {
  const el = ctx.externalLoad.data;
  const cfg = ctx.teamConfig.data;
  const md = ctx.movementDeficit.data;
  return {
    playerId: ctx.playerId,
    playerName: ctx.playerName,
    todayIso: ctx.todayIso,
    mdContext: ctx.microcycle.data.mdContext,
    verdict: ctx.verdict.data.action,
    sprintSpeedDropPct: el.sprintDropPct,
    sprintExposureBand: el.sprintBand,
    codAsymmetryPct: el.codAsymmetryPct,
    codWeakerSide: el.codWeakerSide,
    valdAsymmetryPct: ctx.forcePlate.data.valdAsymmetryPct,
    valdWeakerSide: ctx.forcePlate.data.valdWeakerSide,
    decelBurdenBand: el.decelBurdenBand,
    decelBurdenHighStreakDays: el.decelBurdenHighStreakDays,
    wellness: ctx.wellness.data,
    vbtDecrement: ctx.vbtDecrement,
    injuryStatus: ctx.injury.data.status,
    fosterMonotony: ctx.conditioning.data.fosterMonotony,
    fosterStrain: ctx.conditioning.data.fosterStrain,
    isCongestedWeek: ctx.conditioning.data.isCongestedWeek,
    ledgerEmphases: md.ledgerEmphases,
    correctives: md.correctives,
    correctiveEmphases: md.correctiveEmphases,
    teamPalette: cfg.palette,
    mdStructures: cfg.mdStructures,
    sport: cfg.sport,
    seasonPhase: cfg.seasonPhase,
  };
}
