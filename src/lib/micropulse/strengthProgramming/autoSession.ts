import "server-only";

/**
 * The automatic strength session (origin "auto"), in one place: the 09:00 auto-send builds it, and the player's
 * check-in rebuilds it (2026-11-18, "A").
 *
 * Why the rebuild: the 09:00 send runs before most players check in, so it is built without today's readiness.
 * Once the player checks in, an automatic session that the player has not touched yet is built again from the
 * same inputs plus today's check-in (canonical colour → yellow = fewer sets and a lighter method, red = warm-up
 * and mobility only; wellness → soreness swaps). The colour is only read, never set.
 *
 * What it never does: touch a session a coach sent by hand (any other origin: "sent = seen" holds for those), a
 * session the player has started (a set logged, an exercise swapped, marked done), or the Today layer order. It
 * writes through `persistTodayStrengthOverride` with the same origin "auto", so it is not a new writer. No push.
 * See docs/session-delivery-model.md.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildStrengthSession } from "./index";
import { applyBlockToSession } from "./blockEmphasis";
import { loadCoachStrengthRules } from "./coachStrengthRules";
import { resolveCurrentBlock } from "./resolveCurrentBlock";
import { withGoalSeason } from "./playerGoal";
import { withGoalPlanGym } from "./goalPlanGym";
import { loadCoachOverridesForPlayers, loadPlayerStrengthSnapshot } from "./loader";
import { persistTodayStrengthOverride } from "./persistTodayOverride";
import { normalizeSendMode, type SendMode } from "./sendMode";
import { markRebuilt } from "./sendLog";
import { asAppLang, sessionLangFor } from "./playerLanguage";
import { loadGoalPlanGym } from "@/lib/micropulse/goalPlan/gymLoader";
import type { StrengthSession } from "./types";

/** Team-level inputs, read once per team per day. */
export type AutoTeamContext = {
  teamId: string;
  mode: SendMode;
  todayIso: string;
  coachRules: Awaited<ReturnType<typeof loadCoachStrengthRules>>;
  coachBlock: Awaited<ReturnType<typeof resolveCurrentBlock>>;
  swapsByPlayer: Awaited<ReturnType<typeof loadCoachOverridesForPlayers>>;
  goalGym: Awaited<ReturnType<typeof loadGoalPlanGym>>;
};

export async function loadAutoTeamContext(
  sb: SupabaseClient,
  args: { teamId: string; mode: SendMode; todayIso: string; playerIds: string[] },
): Promise<AutoTeamContext> {
  const { teamId, mode, todayIso, playerIds } = args;
  const ids = mode !== "standard" ? playerIds : [];
  const [coachRules, coachBlock, swapsByPlayer, goalGym] = await Promise.all([
    loadCoachStrengthRules(sb, teamId),
    // The coach's meso block + authored rule for today (team-level).
    resolveCurrentBlock(sb, teamId, todayIso),
    // The coach's swaps for today (strength card). Individualised modes only.
    loadCoachOverridesForPlayers(sb, { playerIds: ids, dateIso: todayIso }),
    // The 8-week goal plans' gym lifts that go into today's session in pre-/off-season.
    loadGoalPlanGym(sb, teamId, todayIso, ids),
  ]);
  return { teamId, mode, todayIso, coachRules, coachBlock, swapsByPlayer, goalGym };
}

export type AutoSession = {
  session: StrengthSession;
  /** Today's check-in colour it was built with; null = no check-in yet (built as a normal day). */
  readinessLevel: "GREEN" | "YELLOW" | "RED" | null;
};

const LEVEL_OF_VERDICT = { FULL: "GREEN", MODIFIED: "YELLOW", REDUCED: "YELLOW", RECOVERY: "RED", HOLD: "RED" } as const;

/** Why there is no session to send (the send log names it). */
export type AutoSkip = { skip: "injured" | "no_session" };

/** One player's automatic session (individualised modes), or why there is none (rest day, injured). */
export async function buildAutoSession(
  sb: SupabaseClient,
  ctx: AutoTeamContext,
  player: { id: string; full_name: string | null },
): Promise<AutoSession | AutoSkip> {
  const snapshot = await loadPlayerStrengthSnapshot(sb, { playerId: player.id, playerName: player.full_name ?? undefined, teamId: ctx.teamId, todayIso: ctx.todayIso });
  // The player's goal adds its set only in pre-/off-season (today's block, 2026-11-17).
  let session = buildStrengthSession(
    withGoalSeason(withGoalPlanGym(snapshot, ctx.goalGym.get(player.id)), ctx.coachBlock),
    ctx.swapsByPlayer.get(player.id) ?? [],
    { mode: ctx.mode },
  );
  if (!session || session.blocks.length === 0) {
    return { skip: session?.appliedAdaptations.some((a) => a.ruleId === "INJURY_BLOCK") ? "injured" : "no_session" };
  }
  // MESO layer: tilt toward today's block + apply the coach's authored rule.
  const b = ctx.coachBlock;
  if (b) session = applyBlockToSession(session, b.goalKey, b.phase, ctx.coachRules?.block?.[`${b.goalKey}:${b.phase}`], b.subPhase) ?? session;
  return { session, readinessLevel: snapshot.verdict ? LEVEL_OF_VERDICT[snapshot.verdict] : null };
}

export type AutoRefreshResult = "rebuilt" | "not_auto" | "started" | "no_session" | "failed";

/**
 * After a check-in: rebuild today's automatic session from today's readiness, if it is still untouched.
 * Never throws.
 */
export async function refreshAutoSessionAfterCheckin(sb: SupabaseClient, playerId: string, dateIso: string): Promise<AutoRefreshResult> {
  try {
    const { data: ov } = await sb
      .from("player_today_strength_override")
      .select("origin, team_id")
      .eq("player_id", playerId)
      .eq("entry_date", dateIso)
      .maybeSingle();
    const row = ov as { origin?: string | null; team_id?: string | null } | null;
    if (!row || row.origin !== "auto" || !row.team_id) return "not_auto";

    // Started = any trace of the player using today's session. Then it stays as it is.
    const [done, sets, swaps] = await Promise.all([
      sb.from("player_strength_completions").select("id", { count: "exact", head: true }).eq("player_id", playerId).eq("entry_date", dateIso),
      sb.from("player_strength_set_log").select("id", { count: "exact", head: true }).eq("player_id", playerId).eq("session_date", dateIso),
      sb.from("player_exercise_swaps").select("id", { count: "exact", head: true }).eq("player_id", playerId).eq("entry_date", dateIso),
    ]);
    if (done.error || sets.error || swaps.error) return "failed";
    if ((done.count ?? 0) + (sets.count ?? 0) + (swaps.count ?? 0) > 0) return "started";

    const [{ data: team }, { data: player }] = await Promise.all([
      sb.from("teams").select("strength_send_mode, default_language").eq("id", row.team_id).maybeSingle(),
      sb.from("players").select("id, full_name, app_language").eq("id", playerId).maybeSingle(),
    ]);
    const mode = normalizeSendMode((team as { strength_send_mode?: string | null } | null)?.strength_send_mode);
    if (mode === "standard" || !player) return "not_auto";

    const ctx = await loadAutoTeamContext(sb, { teamId: row.team_id, mode, todayIso: dateIso, playerIds: [playerId] });
    const built = await buildAutoSession(sb, ctx, player as { id: string; full_name: string | null });
    // Nothing to build now (e.g. an injury logged since 09:00): leave the row; the Today card handles injury.
    if ("skip" in built) return "no_session";

    const persisted = await persistTodayStrengthOverride(sb, { session: built.session, playerId, teamId: row.team_id, dateIso, origin: "auto", readinessLevel: built.readinessLevel,
      // Same language rule as the 09:00 send: the player's app language, else the team's, else English (D).
      lang: sessionLangFor((player as { app_language?: string | null }).app_language, asAppLang((team as { default_language?: string | null } | null)?.default_language) ?? "EN") });
    if (!persisted.ok) return "failed";
    await markRebuilt(sb, { teamId: row.team_id, playerId, date: dateIso, level: built.readinessLevel });
    return "rebuilt";
  } catch {
    return "failed";
  }
}
