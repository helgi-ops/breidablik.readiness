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
import { oneRepMaxesFromLogs } from "./oneRmFromLogs";
import type { SetLogRow } from "@/lib/client/workingOneRm";

/** Working 1RM (canonical lift → kg) from the player's logged working sets — feeds the snapshot's
 *  `oneRepMaxes` so %1RM prescriptions resolve to kg across every consumer (non-VBT loop). Reuses
 *  the corroboration/cap guardrails in oneRepMaxesFromLogs; empty when nothing is logged. */
async function loadOneRepMaxesFromLogs(sb: SupabaseClient, playerId: string): Promise<Record<string, number> | null> {
  const cutoff = new Date(); cutoff.setUTCDate(cutoff.getUTCDate() - 120);
  const { data } = await sb.from("player_strength_set_log")
    .select("session_date, exercise_name, weight_kg, reps, rpe, is_warmup")
    .eq("player_id", playerId).eq("is_warmup", false).gte("session_date", cutoff.toISOString().slice(0, 10));
  const rows = (data ?? []) as Array<{ session_date: string; exercise_name: string; weight_kg: number | null; reps: number | null; rpe: number | null }>;
  if (!rows.length) return null;
  const sets: SetLogRow[] = rows.map((r) => ({ session_date: r.session_date, exercise_name: r.exercise_name, weight_kg: r.weight_kg, reps: r.reps, rpe: r.rpe }));
  const working = oneRepMaxesFromLogs(sets);
  const out: Record<string, number> = {};
  for (const [lift, entry] of Object.entries(working)) out[lift] = entry.one_rm;
  return Object.keys(out).length ? out : null;
}

type OverrideRow = { player_id: string; block_id: string; position: number; original_exercise_id: string | null; override_exercise_id: string; notes: string | null };
const OVERRIDE_COLS = "player_id, block_id, position, original_exercise_id, override_exercise_id, notes";
const toOverride = (r: OverrideRow): CoachOverride => ({
  blockId: r.block_id,
  position: r.position,
  overrideExerciseId: r.override_exercise_id,
  notes: r.notes,
  originalExerciseId: r.original_exercise_id,
});

/** Load coach manual exercise overrides for one player on one date. */
export async function loadCoachOverrides(
  sb: SupabaseClient,
  args: { playerId: string; dateIso: string },
): Promise<CoachOverride[]> {
  try {
    const { data } = await sb
      .from("strength_session_overrides")
      .select(OVERRIDE_COLS)
      .eq("player_id", args.playerId)
      .eq("override_date", args.dateIso);
    return ((data ?? []) as OverrideRow[]).map(toOverride);
  } catch {
    return [];
  }
}

/**
 * The coach's manual swaps for several players on one date, in ONE read (team send, 09:00 auto-send). Players
 * with none are absent. Fail-safe: an error → no swaps (the session as built).
 */
export async function loadCoachOverridesForPlayers(
  sb: SupabaseClient,
  args: { playerIds: string[]; dateIso: string },
): Promise<Map<string, CoachOverride[]>> {
  const out = new Map<string, CoachOverride[]>();
  if (!args.playerIds.length) return out;
  try {
    const { data } = await sb
      .from("strength_session_overrides")
      .select(OVERRIDE_COLS)
      .in("player_id", args.playerIds)
      .eq("override_date", args.dateIso);
    for (const r of (data ?? []) as OverrideRow[]) {
      const list = out.get(r.player_id) ?? [];
      list.push(toOverride(r));
      out.set(r.player_id, list);
    }
  } catch {
    // no swaps
  }
  return out;
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
  const ctxPromise = buildPlayerContext(sb, args);
  const ormPromise = loadOneRepMaxesFromLogs(sb, args.playerId);
  const snapshot = strengthView(await ctxPromise);
  const oneRepMaxes = await ormPromise;
  // Populate %1RM lookups from logged sets (non-VBT). If the coach has already entered 1RMs on the
  // snapshot (VBT/tested path), keep those and only fill lifts they haven't — never override.
  if (oneRepMaxes) {
    snapshot.oneRepMaxes = { ...oneRepMaxes, ...(snapshot.oneRepMaxes ?? {}) };
  }
  return snapshot;
}
