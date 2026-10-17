import "server-only";

/**
 * Tokenless team compute for the Today coach-signal cache.
 *
 * Extracted from `/api/coach/signals` so BOTH the on-demand route AND the nightly
 * pre-compute cron derive the exact same signal set from an admin Supabase client
 * + teamId — no user session, no HTTP self-fetch. Every engine reads via its own
 * tokenless team loader (game-plan-fit and post-training now included via
 * signalLoad helpers), so the heavy per-player fan-outs can be computed off the
 * request path on a schedule. Each loader degrades to []/steady on failure.
 *
 * ADVISORY / descriptive — never reads-as or writes the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveGamePlanFitSignal, derivePostTrainingSignal, deriveMatchMinutesSignal,
  deriveFormVsStateSignal, derivePlayerFormVsStateSignals,
  deriveRobustnessTeamSignal, derivePlayerRobustnessSignals,
  mergeRecoveryReads, deriveWearableRecoveryTeamSignal, derivePlayerWearableRecoverySignals,
  deriveHrLoadTeamSignal, derivePlayerHrLoadSignals,
  deriveRecoveryTeamSignal, derivePlayerRecoverySignals,
  deriveFitnessTrendSignal, deriveBodyCompSignal, deriveSpeedZonesSignal,
  derivePositionFitnessSignal, deriveStrength1rmSignal, deriveStrengthPhaseSignal,
  deriveCccGateTeamSignal, derivePlayerCccGateSignals,
  deriveLoadAcwrTeamSignal, derivePlayerLoadAcwrSignals,
  deriveSprintDropTeamSignal, derivePlayerSprintDropSignals,
  deriveStrideFatigueTeamSignal, derivePlayerStrideFatigueSignals,
  type CoachSignal,
} from "@/lib/micropulse/coachSignals";
import { loadTeamFitnessTrendLite, loadTeamBodyCompLite, loadTeamSpeedZonesLite, loadTeamPositionFitnessLite, loadTeamStrength1rmLite, loadTeamStrengthPhaseLite } from "@/lib/micropulse/coachSignals/newEngineLoads";
import { loadGamePlanFitForSignal } from "@/lib/micropulse/gamePlanFit/signalLoad";
import { loadPostTrainingForSignal } from "@/lib/micropulse/postTraining/signalLoad";
import { loadTeamFormReads } from "@/lib/micropulse/formVsState/teamLoad";
import { loadTeamRobustnessWatch } from "@/lib/micropulse/robustnessWatch/teamLoad";
import { loadTeamHrvReads } from "@/lib/micropulse/hrvTrend/teamLoad";
import { loadTeamWearableRecovery } from "@/lib/micropulse/wearableRecovery/teamLoad";
import { loadTeamHrLoadSignals } from "@/lib/micropulse/hrLoad/signalLoad";
import { loadTeamRecoveryWatch } from "@/lib/micropulse/recoveryWatch/teamLoad";
import { loadTeamCccGateSignals } from "@/lib/micropulse/ccc/signalLoad";
import { loadTeamLoadAcwrSignals } from "@/lib/micropulse/playerLoadAcwr/signalLoad";
import { loadTeamSprintDropSignals } from "@/lib/micropulse/sprintSpeedDrop/signalLoad";
import { loadTeamStrideFatigueSignals } from "@/lib/micropulse/strideLength/signalLoad";

/** A signal with its owner — playerId null = team-level (chip strip), set = per-player (attention row). */
export type OwnedSignal = CoachSignal & { playerId: string | null };

export async function computeTeamSignals(sb: SupabaseClient, teamId: string, today: string): Promise<OwnedSignal[]> {
  // Team-level reuses of existing engine loaders (no per-player HTTP fan-out);
  // each failure degrades that ONE signal to steady, never the whole compute.
  const [gpf, pt, formReads, robustReads, hrvReads, wearableReads, hrLoadReads, recoveryReads, fitTrendLite, bodyCompLite, speedZonesLite] = await Promise.all([
    loadGamePlanFitForSignal(sb, teamId, today).catch(() => null),
    loadPostTrainingForSignal(sb, teamId, today).catch(() => null),
    loadTeamFormReads(sb, teamId).catch(() => []),
    loadTeamRobustnessWatch(sb, teamId, today).catch(() => []),
    loadTeamHrvReads(sb, teamId).catch(() => []),
    loadTeamWearableRecovery(sb, teamId).catch(() => []),
    loadTeamHrLoadSignals(sb, teamId).catch(() => []),
    loadTeamRecoveryWatch(sb, teamId, today).catch(() => []),
    loadTeamFitnessTrendLite(sb, teamId).catch(() => []),
    loadTeamBodyCompLite(sb, teamId).catch(() => []),
    loadTeamSpeedZonesLite(sb, teamId).catch(() => []),
  ]);
  const fitTrend = deriveFitnessTrendSignal(fitTrendLite);
  const bodyComp = deriveBodyCompSignal(bodyCompLite);
  const speedZones = deriveSpeedZonesSignal(speedZonesLite);

  const [posFitLite, strengthLite, strengthPhaseLite, cccGateReads, acwrReads, sprintDropReads, strideFatigueReads] = await Promise.all([
    loadTeamPositionFitnessLite(sb, teamId).catch(() => []),
    loadTeamStrength1rmLite(sb, teamId).catch(() => []),
    loadTeamStrengthPhaseLite(sb, teamId).catch(() => ({ phase: null, needBodyComp: 0, total: 0, weeksToOpener: null })),
    loadTeamCccGateSignals(sb, teamId).catch(() => []),
    loadTeamLoadAcwrSignals(sb, teamId, today).catch(() => []),
    loadTeamSprintDropSignals(sb, teamId, today).catch(() => []),
    loadTeamStrideFatigueSignals(sb, teamId, today).catch(() => []),
  ]);
  const posFit = derivePositionFitnessSignal(posFitLite);
  const strength1rm = deriveStrength1rmSignal(strengthLite);
  const strengthPhase = deriveStrengthPhaseSignal(strengthPhaseLite);

  const loadAcwr = deriveLoadAcwrTeamSignal(acwrReads);
  const loadAcwrPlayers = derivePlayerLoadAcwrSignals(acwrReads);
  const sprintDrop = deriveSprintDropTeamSignal(sprintDropReads);
  const sprintDropPlayers = derivePlayerSprintDropSignals(sprintDropReads);
  const strideFatigue = deriveStrideFatigueTeamSignal(strideFatigueReads);
  const strideFatiguePlayers = derivePlayerStrideFatigueSignals(strideFatigueReads);

  const cccGate = deriveCccGateTeamSignal(cccGateReads);
  const cccGatePlayers = derivePlayerCccGateSignals(cccGateReads);

  const fvs = deriveFormVsStateSignal(formReads.map((r) => ({ name: r.name, verdict: r.verdict, confidence: r.confidence })));
  const fvsPlayers = derivePlayerFormVsStateSignals(formReads.map((r) => ({
    playerId: r.playerId, name: r.name, verdict: r.verdict, confidence: r.confidence,
    windowMean: r.windowMean, baselinePer90: r.baselinePer90,
  })));

  const robustLite = robustReads.map((r) => ({
    playerId: r.playerId, name: r.playerName, level: r.level, verdict: r.verdict,
    counterfactual: r.counterfactual, confidence: r.confidence,
  }));
  const rob = deriveRobustnessTeamSignal(robustLite);
  const robPlayers = derivePlayerRobustnessSignals(robustLite);

  const hrvLite = hrvReads.map((r) => ({ playerId: r.playerId, name: r.playerName, level: r.level, verdict: r.verdict, confidence: r.confidence }));
  const recoveryMerged = mergeRecoveryReads(wearableReads, hrvLite);
  const wearable = deriveWearableRecoveryTeamSignal(recoveryMerged);
  const wearablePlayers = derivePlayerWearableRecoverySignals(recoveryMerged);

  const hrLoad = deriveHrLoadTeamSignal(hrLoadReads);
  const hrLoadPlayers = derivePlayerHrLoadSignals(hrLoadReads);

  const recoveryLite = recoveryReads.map((r) => ({ playerId: r.playerId, name: r.playerName, status: r.status, mdOffset: r.mdOffset, confident: r.confident }));
  const recovery = deriveRecoveryTeamSignal(recoveryLite);
  const recoveryPlayers = derivePlayerRecoverySignals(recoveryLite);

  // match-minutes: cheap direct read — most recent match in the last 4 days + whether minutes are entered.
  const fourDaysAgo = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 4); return d.toISOString().slice(0, 10); })();
  const [{ data: fx }, { data: roster }] = await Promise.all([
    sb.from("match_schedule").select("match_date, opponent").eq("team_id", teamId).gte("match_date", fourDaysAgo).lte("match_date", today).order("match_date", { ascending: false }).limit(1),
    sb.from("players").select("id").eq("team_id", teamId).eq("is_active", true),
  ]);
  const recent = (fx ?? [])[0] as { match_date?: string; opponent?: string | null } | undefined;
  let mm = deriveMatchMinutesSignal({ recentMatch: null, entered: 0, roster: 0 });
  if (recent?.match_date) {
    const { count } = await sb.from("match_player_minutes").select("player_id", { count: "exact", head: true })
      .eq("team_id", teamId).eq("match_date", recent.match_date);
    mm = deriveMatchMinutesSignal({
      recentMatch: { date: recent.match_date, opponent: recent.opponent ?? null },
      entered: count ?? 0,
      roster: (roster ?? []).length,
    });
  }

  const team: OwnedSignal[] = [deriveGamePlanFitSignal(gpf), derivePostTrainingSignal(pt), mm, fvs, rob, wearable, hrLoad, recovery, fitTrend, bodyComp, speedZones, posFit, strength1rm, strengthPhase, cccGate, loadAcwr, sprintDrop, strideFatigue].map((s) => ({ ...s, playerId: null }));
  const perPlayer: OwnedSignal[] = [...fvsPlayers, ...robPlayers, ...wearablePlayers, ...hrLoadPlayers, ...recoveryPlayers, ...cccGatePlayers, ...loadAcwrPlayers, ...sprintDropPlayers, ...strideFatiguePlayers].map((x) => ({ ...x.signal, playerId: x.playerId }));
  return [...team, ...perPlayer];
}

/** Persist a freshly-computed signal set as today's cache (delete-then-insert). Best-effort. */
export async function writeTeamSignals(sb: SupabaseClient, teamId: string, today: string, signals: OwnedSignal[]): Promise<void> {
  const nowIso = new Date().toISOString();
  const rows = signals.map((s) => ({
    team_id: teamId, engine: s.engine, player_id: s.playerId, level: s.level,
    label: s.label, why: s.why, confidence: s.confidence, counterfactual: s.counterfactual,
    href: s.href, as_of: today, updated_at: nowIso,
  }));
  await sb.from("coach_signals").delete().eq("team_id", teamId).eq("as_of", today);
  if (rows.length) await sb.from("coach_signals").insert(rows);
}
