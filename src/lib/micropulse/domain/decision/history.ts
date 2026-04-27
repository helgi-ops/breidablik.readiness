/**
 * Per-player verdict persistence to athlete_decision_history.
 *
 * Foundation for:
 *   - Sequence-aware escalation (3+ YELLOW → RED) — reads back via
 *     fetchRecentDecisions
 *   - Counterfactual explanations ("if STEN had been 5, ...") —
 *     input_signals snapshot enables this
 *   - Coach-feedback learning loop (override-vs-outcome calibration)
 *   - Forward-looking risk forecast (trajectory analysis)
 *   - Proof-of-ROI reports
 *
 * UPSERT on (player_id, decision_date) — verdict can be recomputed
 * many times during the day; we always keep the latest. Streak detection
 * looks at decision_date < today, so today's volatility doesn't break
 * the chain.
 */

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { AthleteDecision } from "./types";
import type { RecentDecision } from "./sequence";

export type RecordPlayerDecisionInput = {
  decision: AthleteDecision;
  teamId: string | null;
  /** Optional snapshot of the input signals that fed this verdict —
   * enables counterfactual analysis later. Caller picks what's
   * relevant; we don't impose a schema. Common keys: sten, deltaZ,
   * acwr, sleepZ, sorenessZ, indoorBand, decelFlag, etc. */
  inputSignals?: Record<string, unknown> | null;
  isCoachOverride?: boolean;
  coachAction?: string | null;
};

/**
 * UPSERT today's verdict for one player.
 *
 * Fire-and-forget pattern: failures are logged but never block the
 * verdict response. The verdict is the source of truth for today; the
 * history is best-effort for tomorrow.
 */
export async function recordPlayerDecision(
  input: RecordPlayerDecisionInput,
): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    const d = input.decision;

    const { error } = await sb
      .from("athlete_decision_history")
      .upsert(
        {
          player_id: d.athleteId,
          team_id: input.teamId,
          decision_date: d.date,
          athlete_state: d.athleteState,
          session_mode: d.sessionMode,
          load_action: d.loadAction,
          neural_status: d.neuralStatus,
          readiness_score: d.readinessScore ?? null,
          decision_confidence: d.decisionConfidence,
          reasons: d.reasons ?? [],
          flags: d.flags ?? {},
          engine_contributions: d.engineContributions ?? {},
          input_signals: input.inputSignals ?? null,
          streak_context: d.streakContext ?? null,
          is_coach_override: input.isCoachOverride ?? false,
          coach_action: input.coachAction ?? null,
          computed_at: new Date().toISOString(),
        },
        { onConflict: "player_id,decision_date" },
      );

    if (error) {
      console.error("[recordPlayerDecision] upsert failed:", error.message);
    }
  } catch (err) {
    console.error("[recordPlayerDecision] unexpected error:", err);
  }
}

/**
 * Bulk-fetch recent decisions for a list of players. Used by
 * /api/team/decisions to prime sequence-aware escalation in one
 * round-trip rather than per-player queries.
 *
 * Returns: { player_id → RecentDecision[] sorted newest-first }.
 */
export async function fetchRecentDecisions(
  playerIds: string[],
  daysBack: number = 7,
): Promise<Map<string, RecentDecision[]>> {
  const out = new Map<string, RecentDecision[]>();
  if (!playerIds.length) return out;

  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceStr = since.toISOString().slice(0, 10);

  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("athlete_decision_history")
      .select("player_id, decision_date, athlete_state")
      .in("player_id", playerIds)
      .gte("decision_date", sinceStr)
      .order("decision_date", { ascending: false });

    if (error) {
      console.error("[fetchRecentDecisions] failed:", error.message);
      return out;
    }

    for (const row of (data ?? []) as Array<{
      player_id: string;
      decision_date: string;
      athlete_state: RecentDecision["athlete_state"];
    }>) {
      const pid = String(row.player_id);
      if (!out.has(pid)) out.set(pid, []);
      out.get(pid)!.push({
        decision_date: row.decision_date,
        athlete_state: row.athlete_state,
      });
    }
  } catch (err) {
    console.error("[fetchRecentDecisions] unexpected error:", err);
  }

  return out;
}
