import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveMatchMinutesSignal,
  deriveFormVsStateSignal, derivePlayerFormVsStateSignals,
  deriveRobustnessTeamSignal, derivePlayerRobustnessSignals,
  deriveHrvTeamSignal, derivePlayerHrvSignals,
  deriveHrLoadTeamSignal, derivePlayerHrLoadSignals,
  deriveRecoveryTeamSignal, derivePlayerRecoverySignals,
  type CoachSignal,
} from "@/lib/micropulse/coachSignals";
import { loadTeamFormReads } from "@/lib/micropulse/formVsState/teamLoad";
import { loadTeamRobustnessWatch } from "@/lib/micropulse/robustnessWatch/teamLoad";
import { loadTeamHrvReads } from "@/lib/micropulse/hrvTrend/teamLoad";
import { loadTeamHrLoadSignals } from "@/lib/micropulse/hrLoad/signalLoad";
import { loadTeamRecoveryWatch } from "@/lib/micropulse/recoveryWatch/teamLoad";

/** A signal with its owner — playerId null = team-level, set = per-player. */
export type OwnedSignal = CoachSignal & { playerId: string | null };

/**
 * The TOKENLESS subset of the coach_signals engines — everything the Today
 * dashboard's computeSignals() derives EXCEPT game-plan-fit and post-training
 * (those two are fetched from token-gated coach endpoints and so need a coach
 * JWT + request origin). These engines all load via the service-role admin
 * client, so they can run from a cron with no coach in the loop.
 *
 * Used by the coach morning digest (proactive-delivery Addition 1). It composes
 * from these fresh reads and does NOT write the coach_signals cache — writing a
 * gpf/pt-less cache would mask those two on the dashboard until a coach opened
 * it with ?refresh=1. The dashboard route stays the canonical cache writer.
 *
 * Mirrors src/app/api/coach/signals/route.ts:computeSignals (minus gpf/pt) on
 * purpose — kept side-by-side so a change to the engine set is a two-line diff,
 * not a refactor of the hot dashboard path. Descriptive only; never the colour.
 */
export async function computeAdminSignals(
  sb: SupabaseClient,
  teamId: string,
  today: string,
): Promise<OwnedSignal[]> {
  const [formReads, robustReads, hrvReads, hrLoadReads, recoveryReads] = await Promise.all([
    loadTeamFormReads(sb, teamId).catch(() => []),
    loadTeamRobustnessWatch(sb, teamId, today).catch(() => []),
    loadTeamHrvReads(sb, teamId).catch(() => []),
    loadTeamHrLoadSignals(sb, teamId).catch(() => []),
    loadTeamRecoveryWatch(sb, teamId, today).catch(() => []),
  ]);

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
  const hrv = deriveHrvTeamSignal(hrvLite);
  const hrvPlayers = derivePlayerHrvSignals(hrvLite);

  const hrLoad = deriveHrLoadTeamSignal(hrLoadReads);
  const hrLoadPlayers = derivePlayerHrLoadSignals(hrLoadReads);

  const recoveryLite = recoveryReads.map((r) => ({ playerId: r.playerId, name: r.playerName, status: r.status, mdOffset: r.mdOffset, confident: r.confident }));
  const recovery = deriveRecoveryTeamSignal(recoveryLite);
  const recoveryPlayers = derivePlayerRecoverySignals(recoveryLite);

  // match-minutes: cheap direct read — most recent match in the last 4 days.
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

  const team: OwnedSignal[] = [mm, fvs, rob, hrv, hrLoad, recovery].map((s) => ({ ...s, playerId: null }));
  const perPlayer: OwnedSignal[] = [...fvsPlayers, ...robPlayers, ...hrvPlayers, ...hrLoadPlayers, ...recoveryPlayers].map((x) => ({ ...x.signal, playerId: x.playerId }));
  return [...team, ...perPlayer];
}
