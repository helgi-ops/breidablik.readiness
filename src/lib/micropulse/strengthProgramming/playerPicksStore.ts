import "server-only";

/**
 * Player exercise picks (lota 1) + strength goal and one-player test (lota 2), 2026-11-17: database work.
 * Server-only, the ONLY writer of `player_strength_picks` / `player_strength_pick_events` /
 * `team_strength_palette.player_picks_enabled`. Called
 * from the player and coach routes AFTER their own auth and team checks, with the service-role client. Every
 * change writes an event (who, what, why).
 *
 * Never writes the readiness colour, `player_today_strength_override` or any Today source: the engine reads the
 * picks while it builds the session the existing writers send (playerContext → fetchPlayerExercisePicks).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizePaletteSlots, type PaletteSlots } from "./palette";
import { EXERCISES_BY_ID } from "./exerciseLibrary";
import {
  PICK_MAX,
  PICK_SLOT_LABEL,
  pickableSlots,
  sanitizeGoal,
  sanitizeLockedSlots,
  sanitizePicks,
  type PickSlot,
  type PlayerExercisePicks,
  type StrengthGoal,
} from "./playerPicks";

export class PicksError extends Error {
  constructor(public status: number, message: string, public is: string) {
    super(message);
  }
}

export type PickActor = { role: "player" | "coach"; userId: string | null };

export type PickGroup = {
  slot: PickSlot;
  label: { en: string; is: string };
  max: number;
  options: { id: string; nameEN: string; nameIS: string }[];
};

export type PlayerPicksRow = {
  picks: PlayerExercisePicks;
  locked: PickSlot[];
  /** The player's strength goal (lota 2), null = none. */
  goal: StrengthGoal | null;
  /** The coach chose the goal; the player can't change it. */
  goalLocked: boolean;
  /** The coach turned picks + goal on for this one player (test) while the team switch is off. */
  testEnabled: boolean;
  updatedAt: string | null;
  updatedByRole: "player" | "coach" | null;
};

type RawRow = {
  picks?: unknown;
  locked_slots?: unknown;
  strength_goal?: unknown;
  goal_locked?: boolean | null;
  test_enabled?: boolean | null;
  updated_at?: string | null;
  updated_by_role?: string | null;
};
const ROW_COLS = "picks, locked_slots, strength_goal, goal_locked, test_enabled, updated_at, updated_by_role";

type TeamRow = { slots: PaletteSlots; enabled: boolean; hasList: boolean };

/** The team's list + switch. No palette row → no list, switch off. */
export async function readTeamPickConfig(sb: SupabaseClient, teamId: string): Promise<TeamRow> {
  const { data, error } = await sb.from("team_strength_palette").select("slots, player_picks_enabled").eq("team_id", teamId).maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { slots?: unknown; player_picks_enabled?: boolean } | null;
  const slots = sanitizePaletteSlots(row?.slots);
  return { slots, enabled: !!row?.player_picks_enabled, hasList: pickableSlots(slots).length > 0 };
}

/** Is picking on for this player? The team switch, or the coach's one-player test. Needs the team's list. */
export function choicesOn(cfg: TeamRow, row: Pick<PlayerPicksRow, "testEnabled"> | null | undefined): boolean {
  return cfg.hasList && (cfg.enabled || !!row?.testEnabled);
}

/**
 * Read-only: are player choices on for this player? Lota 3 (2026-11-17): the same switch also lets the player's
 * 8-week goal plan start without the coach's approval (goalPlan/store.ts `createGoalRequest({ autoStart })`).
 */
export async function playerChoicesOnFor(sb: SupabaseClient, teamId: string, playerId: string): Promise<boolean> {
  const cfg = await readTeamPickConfig(sb, teamId);
  if (!cfg.hasList) return false;
  if (cfg.enabled) return true;
  const { data, error } = await sb.from("player_strength_picks").select("test_enabled")
    .eq("player_id", playerId).eq("team_id", teamId).maybeSingle();
  if (error) throw new Error(error.message);
  return !!(data as { test_enabled?: boolean } | null)?.test_enabled;
}

/** The groups a player can choose in, with the team's exercises (coach's order). */
export function pickGroups(slots: PaletteSlots): PickGroup[] {
  return pickableSlots(slots).map((slot) => ({
    slot,
    label: PICK_SLOT_LABEL[slot],
    max: PICK_MAX[slot],
    options: (slots[slot] ?? []).map((id) => {
      const ex = EXERCISES_BY_ID.get(id);
      return { id, nameEN: ex?.nameEN ?? id, nameIS: ex?.nameIS || ex?.nameEN || id };
    }),
  }));
}

function toRow(raw: RawRow | null, slots: PaletteSlots): PlayerPicksRow {
  return {
    picks: sanitizePicks(raw?.picks, slots),
    locked: sanitizeLockedSlots(raw?.locked_slots),
    goal: sanitizeGoal(raw?.strength_goal),
    goalLocked: !!raw?.goal_locked,
    testEnabled: !!raw?.test_enabled,
    updatedAt: raw?.updated_at ?? null,
    updatedByRole: raw?.updated_by_role === "player" || raw?.updated_by_role === "coach" ? raw.updated_by_role : null,
  };
}

/** One player's picks (picks no longer on the list are dropped on read). */
export async function readPlayerPicks(sb: SupabaseClient, playerId: string, teamId: string, slots: PaletteSlots): Promise<PlayerPicksRow> {
  const { data, error } = await sb
    .from("player_strength_picks")
    .select(ROW_COLS)
    .eq("player_id", playerId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return toRow(data as RawRow | null, slots);
}

/** Every player's picks on the team, by player id. */
export async function readTeamPicks(sb: SupabaseClient, teamId: string, slots: PaletteSlots): Promise<Map<string, PlayerPicksRow>> {
  const { data, error } = await sb
    .from("player_strength_picks")
    .select(`player_id, ${ROW_COLS}`)
    .eq("team_id", teamId);
  if (error) throw new Error(error.message);
  const out = new Map<string, PlayerPicksRow>();
  for (const r of (data ?? []) as (RawRow & { player_id: string })[]) {
    out.set(r.player_id, toRow(r, slots));
  }
  return out;
}

async function logEvent(
  sb: SupabaseClient,
  ev: { teamId: string; playerId: string | null; kind: string; slot?: string | null; before?: unknown; after?: unknown; actor: PickActor; reason?: string | null },
) {
  const { error } = await sb.from("player_strength_pick_events").insert({
    team_id: ev.teamId,
    player_id: ev.playerId,
    kind: ev.kind,
    slot: ev.slot ?? null,
    before: ev.before ?? null,
    after: ev.after ?? null,
    actor_user_id: ev.actor.userId,
    actor_role: ev.actor.role,
    reason: ev.reason?.trim() ? ev.reason.trim().slice(0, 500) : null,
  });
  if (error) throw new Error(error.message);
}

/** A row that belongs to ANOTHER team (the player moved) is never edited: the picks are per team. When a write
 *  lands on a row from another team, everything from the old team (picks, locks, goal, test) is cleared. */
const FRESH_TEAM = { strength_goal: null, goal_locked: false, test_enabled: false };

async function existingRow(sb: SupabaseClient, playerId: string) {
  const { data, error } = await sb
    .from("player_strength_picks")
    .select("team_id, picks, locked_slots")
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { team_id: string; picks: unknown; locked_slots: unknown } | null;
}

/** Save one group's picks (already validated by the caller). Returns the new row. */
export async function savePicks(
  sb: SupabaseClient,
  args: { playerId: string; teamId: string; slots: PaletteSlots; slot: PickSlot; ids: string[]; actor: PickActor; reason?: string | null },
): Promise<PlayerPicksRow> {
  const prior = await existingRow(sb, args.playerId);
  const sameTeam = prior?.team_id === args.teamId;
  const before = sameTeam ? sanitizePicks(prior?.picks, args.slots) : {};
  const locked = sameTeam ? sanitizeLockedSlots(prior?.locked_slots) : [];
  const next: PlayerExercisePicks = { ...before };
  if (args.ids.length > 0) next[args.slot] = args.ids;
  else delete next[args.slot];

  const { error } = await sb.from("player_strength_picks").upsert(
    {
      player_id: args.playerId,
      team_id: args.teamId,
      picks: next,
      locked_slots: locked,
      ...(sameTeam ? {} : FRESH_TEAM),
      updated_by: args.actor.userId,
      updated_by_role: args.actor.role,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "player_id" },
  );
  if (error) throw new Error(error.message);
  await logEvent(sb, {
    teamId: args.teamId,
    playerId: args.playerId,
    kind: args.actor.role === "coach" ? "coach_set" : "picked",
    slot: args.slot,
    before: before[args.slot] ?? [],
    after: args.ids,
    actor: args.actor,
    reason: args.reason,
  });
  return readPlayerPicks(sb, args.playerId, args.teamId, args.slots);
}

/** Coach locks / unlocks a group for one player (with a reason). */
export async function setLock(
  sb: SupabaseClient,
  args: { playerId: string; teamId: string; slots: PaletteSlots; slot: PickSlot; locked: boolean; actor: PickActor; reason: string },
): Promise<PlayerPicksRow> {
  const prior = await existingRow(sb, args.playerId);
  const sameTeam = prior?.team_id === args.teamId;
  const picks = sameTeam ? sanitizePicks(prior?.picks, args.slots) : {};
  const was = sameTeam ? sanitizeLockedSlots(prior?.locked_slots) : [];
  const locked = args.locked ? [...new Set([...was, args.slot])] : was.filter((s) => s !== args.slot);
  const { error } = await sb.from("player_strength_picks").upsert(
    {
      player_id: args.playerId,
      team_id: args.teamId,
      picks,
      locked_slots: locked,
      ...(sameTeam ? {} : FRESH_TEAM),
      updated_by: args.actor.userId,
      updated_by_role: args.actor.role,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "player_id" },
  );
  if (error) throw new Error(error.message);
  await logEvent(sb, { teamId: args.teamId, playerId: args.playerId, kind: args.locked ? "locked" : "unlocked", slot: args.slot, actor: args.actor, reason: args.reason });
  return readPlayerPicks(sb, args.playerId, args.teamId, args.slots);
}

/** Save the player's strength goal (already validated by the caller; null clears it). */
export async function saveGoal(
  sb: SupabaseClient,
  args: { playerId: string; teamId: string; slots: PaletteSlots; goal: StrengthGoal | null; actor: PickActor; reason?: string | null },
): Promise<PlayerPicksRow> {
  const prior = await existingRow(sb, args.playerId);
  const sameTeam = prior?.team_id === args.teamId;
  const before = sameTeam ? (await readPlayerPicks(sb, args.playerId, args.teamId, args.slots)).goal : null;
  const { error } = await sb.from("player_strength_picks").upsert(
    {
      player_id: args.playerId,
      team_id: args.teamId,
      ...(sameTeam ? {} : { picks: {}, locked_slots: [], ...FRESH_TEAM }),
      strength_goal: args.goal,
      updated_by: args.actor.userId,
      updated_by_role: args.actor.role,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "player_id" },
  );
  if (error) throw new Error(error.message);
  await logEvent(sb, { teamId: args.teamId, playerId: args.playerId, kind: "goal_set", before, after: args.goal, actor: args.actor, reason: args.reason });
  return readPlayerPicks(sb, args.playerId, args.teamId, args.slots);
}

/** Coach locks / unlocks the player's goal (with a reason). */
export async function setGoalLock(
  sb: SupabaseClient,
  args: { playerId: string; teamId: string; slots: PaletteSlots; locked: boolean; actor: PickActor; reason: string },
): Promise<PlayerPicksRow> {
  const prior = await existingRow(sb, args.playerId);
  const sameTeam = prior?.team_id === args.teamId;
  const { error } = await sb.from("player_strength_picks").upsert(
    {
      player_id: args.playerId,
      team_id: args.teamId,
      ...(sameTeam ? {} : { picks: {}, locked_slots: [], ...FRESH_TEAM }),
      goal_locked: args.locked,
      updated_by: args.actor.userId,
      updated_by_role: args.actor.role,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "player_id" },
  );
  if (error) throw new Error(error.message);
  await logEvent(sb, { teamId: args.teamId, playerId: args.playerId, kind: args.locked ? "goal_locked" : "goal_unlocked", actor: args.actor, reason: args.reason });
  return readPlayerPicks(sb, args.playerId, args.teamId, args.slots);
}

/** Coach turns picks + goal on (or off) for ONE player to test, while the team switch is off. Needs the list. */
export async function setTestPlayer(
  sb: SupabaseClient,
  args: { playerId: string; teamId: string; on: boolean; actor: PickActor },
): Promise<void> {
  const cfg = await readTeamPickConfig(sb, args.teamId);
  if (args.on && !cfg.hasList) {
    throw new PicksError(409, "The team list needs at least 2 exercises in a group first.", "Æfingalisti liðsins þarf fyrst a.m.k. 2 æfingar í einhverjum flokki.");
  }
  const prior = await existingRow(sb, args.playerId);
  const sameTeam = prior?.team_id === args.teamId;
  if (!sameTeam && !args.on) return; // nothing on for this team
  const { error } = await sb.from("player_strength_picks").upsert(
    {
      player_id: args.playerId,
      team_id: args.teamId,
      ...(sameTeam ? {} : { picks: {}, locked_slots: [], ...FRESH_TEAM }),
      test_enabled: args.on,
      updated_by: args.actor.userId,
      updated_by_role: args.actor.role,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "player_id" },
  );
  if (error) throw new Error(error.message);
  await logEvent(sb, { teamId: args.teamId, playerId: args.playerId, kind: args.on ? "test_on" : "test_off", actor: args.actor });
}

/** Coach turns player picks on or off for the team. Needs the team's list (a palette row). */
export async function setTeamEnabled(sb: SupabaseClient, args: { teamId: string; enabled: boolean; actor: PickActor }): Promise<void> {
  const cfg = await readTeamPickConfig(sb, args.teamId);
  if (args.enabled && !cfg.hasList) {
    throw new PicksError(409, "The team list needs at least 2 exercises in a group first.", "Æfingalisti liðsins þarf fyrst a.m.k. 2 æfingar í einhverjum flokki.");
  }
  if (cfg.enabled === args.enabled) return;
  const { error } = await sb.from("team_strength_palette").update({ player_picks_enabled: args.enabled }).eq("team_id", args.teamId);
  if (error) throw new Error(error.message);
  await logEvent(sb, { teamId: args.teamId, playerId: null, kind: args.enabled ? "enabled" : "disabled", actor: args.actor });
}
