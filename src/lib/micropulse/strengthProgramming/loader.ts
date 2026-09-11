/**
 * Strength Programming — Loader
 *
 * Thin adapter over the shared per-player context. The strength snapshot's data
 * reads now live in `playerContext` (one shared substrate every surface derives
 * from); this file exposes the strength view of it plus the two strength-only
 * helpers that other modules import (`resolveAutoMdContext`, `loadCoachOverrides`).
 *
 * The snapshot output is byte-identical to the previous implementation — the
 * per-signal fetchers were relocated verbatim into `playerContext/domains.ts`
 * and `strengthView` maps them 1:1. See `playerContext/index.ts`.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MdContext, PlayerStrengthSnapshot } from "./types";
import type { CoachOverride } from "./index";
import { buildPlayerContext, strengthView } from "@/lib/micropulse/playerContext";
import { fetchMdContext } from "@/lib/micropulse/playerContext/domains";

/** Load coach manual exercise overrides for one player on one date. */
export async function loadCoachOverrides(
  sb: SupabaseClient,
  args: { playerId: string; dateIso: string },
): Promise<CoachOverride[]> {
  try {
    const { data } = await sb
      .from("strength_session_overrides")
      .select("block_id, position, override_exercise_id, notes")
      .eq("player_id", args.playerId)
      .eq("override_date", args.dateIso);
    return ((data ?? []) as Array<{
      block_id: string; position: number;
      override_exercise_id: string; notes: string | null;
    }>).map((r) => ({
      blockId: r.block_id,
      position: r.position,
      overrideExerciseId: r.override_exercise_id,
      notes: r.notes,
    }));
  } catch {
    return [];
  }
}

/** The week_plans-derived MD context for a team today (no override). Exposed so
 *  the send UI can show the REAL MD it will push (never the PDF-preview control). */
export function resolveAutoMdContext(sb: SupabaseClient, teamId: string | null, todayIso: string): Promise<MdContext> {
  return fetchMdContext(sb, teamId, todayIso, null);
}

/** Main loader — builds the full snapshot for one player, as the strength view of
 *  the shared player context. */
export async function loadPlayerStrengthSnapshot(
  sb: SupabaseClient,
  args: {
    playerId: string;
    playerName?: string;
    teamId: string | null;
    todayIso: string;
    /** Coach manual override of MD-context — bypasses week_plans lookup. */
    mdContextOverride?: MdContext | null;
  },
): Promise<PlayerStrengthSnapshot> {
  return strengthView(await buildPlayerContext(sb, args));
}
