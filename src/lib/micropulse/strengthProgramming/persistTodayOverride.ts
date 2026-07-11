/**
 * strengthProgramming/persistTodayOverride
 *
 * Writes a built StrengthSession into `player_today_strength_override` so it
 * becomes the player's Today session card for that date — the single point that
 * makes "coach sent = player sees". Called by both the per-player and bulk send
 * routes right after buildStrengthSession, in addition to the chat message +
 * push (chat = the "you got a new session" notification; this = the actual
 * Today card).
 *
 * Idempotent per (player_id, entry_date): a re-send overwrites the same row, so
 * the last thing the coach sent is what the player sees.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StrengthSession } from "./types";
import { strengthSessionToTodayStructure } from "./toTodayStructure";

export async function persistTodayStrengthOverride(
  supabase: SupabaseClient,
  args: {
    session: StrengthSession;
    playerId: string;
    teamId: string;
    dateIso: string;
    coachId?: string | null;
    lang: "EN" | "IS";
    title?: string | null;
    description?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const structure = strengthSessionToTodayStructure(args.session, args.lang);
  if (!structure.length) return { ok: false, error: "empty structure" };

  const row = {
    player_id: args.playerId,
    team_id: args.teamId,
    entry_date: args.dateIso,
    md_context: args.session.mdContext,
    // buildStrengthSession is already tuned to the player's verdict, so we don't
    // carry a readiness_level that would trigger a second set-reduction — the
    // render path suppresses adjust for coach-sent sessions.
    readiness_level: null as string | null,
    title: args.title ?? (args.lang === "IS" ? "Styrktaræfing frá þjálfara" : "Coach strength session"),
    description: args.description ?? (args.lang === "IS" ? args.session.summaryIS : args.session.summaryEN) ?? null,
    structure,
    summary: (args.lang === "IS" ? args.session.summaryIS : args.session.summaryEN) ?? null,
    duration_min: args.session.durationMin ?? null,
    source: "coach_sent",
    coach_id: args.coachId ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("player_today_strength_override")
    .upsert(row, { onConflict: "player_id,entry_date" });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
