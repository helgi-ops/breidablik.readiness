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
    lastMatchMinutes: ctx.matchExposure.data.lastMatchMinutes,
    lastMatchDnp: ctx.matchExposure.data.lastMatchDnp,
    sport: cfg.sport,
    seasonPhase: cfg.seasonPhase,
    // The player's own picks from the team list (whenever the player has a row on this team).
    ...(cfg.playerPicks ? { playerExercisePicks: cfg.playerPicks } : {}),
    // The player's own strength goal (lota 2).
    ...(cfg.playerGoal ? { playerStrengthGoal: cfg.playerGoal } : {}),
    // Whether those choices are used: the send mode decides in the engine (sendMode.ts, 2026-11-17).
    ...(cfg.playerChoiceAccess ? { playerChoiceAccess: cfg.playerChoiceAccess } : {}),
    // No match near (pre-/off-season: every strength session is a goal day). Only when true, so the snapshot is
    // unchanged otherwise.
    ...(ctx.microcycle.data.noMatchNearby ? { noMatchNearby: true as const } : {}),
    // The coach's weekday plan for weeks without a match (used by the engine only with noMatchNearby).
    ...(cfg.noMatchWeek ? { noMatchWeek: cfg.noMatchWeek } : {}),
    // The coach's reps a set per heavy MD day (the week rule cuts the day's reps into sets by it).
    ...(cfg.mdRepsPerSet ? { mdRepsPerSet: cfg.mdRepsPerSet } : {}),
    // The jump test that feeds today's dose (cmjDose.ts), only when there is one.
    ...(ctx.cmjTest?.data.test ? { cmjTest: ctx.cmjTest.data.test } : {}),
    // Fresh NordBord / ForceFrame tests (testAddons.ts), only when there is one.
    ...(ctx.strengthTests?.data.tests ? { strengthTests: ctx.strengthTests.data.tests } : {}),
    // The coach's asymmetry decision (asymmetryReview.ts), only when there is one.
    ...(ctx.asymmetryReview?.data.review ? { asymmetryReview: ctx.asymmetryReview.data.review } : {}),
    // Overhead squat / single-leg balance findings (screenRules.ts), only when there is one.
    ...(ctx.screenFlags?.data.flags ? { screenFlags: ctx.screenFlags.data.flags } : {}),
  };
}
