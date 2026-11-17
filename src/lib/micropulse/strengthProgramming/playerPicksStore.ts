import "server-only";

/**
 * Player exercise picks (lota 1) + strength goal and one-player test (lota 2), 2026-11-17: database work.
 * Server-only, the ONLY writer of `player_strength_picks` / `player_strength_pick_events`. Called
 * from the player and coach routes AFTER their own auth and team checks, with the service-role client. Every
 * change writes an event (who, what, why).
 *
 * Who takes part (three send modes, 2026-11-17): the team's send mode (`teams.strength_send_mode`, read here, written by
 * the send-mode route) is the one switch. On "individualised_goals" everyone takes part unless the coach took them out
 * (`choices_off`); on "individualised" only players the coach let in (`test_enabled`); on "standard" nobody
 * (`sendMode.ts` takesPart). The old team switch `team_strength_palette.player_picks_enabled` is no longer read.
 *
 * Never writes the readiness colour, `player_today_strength_override` or any Today source: the engine reads the
 * picks while it builds the session the existing writers send (playerContext → fetchPlayerExercisePicks).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizePaletteSlots, type PaletteSlots } from "./palette";
import { EXERCISES_BY_ID } from "./exerciseLibrary";
import { normalizeSendMode, takesPart, type SendMode } from "./sendMode";
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
  /** The coach let this player take part while the team is on another mode (e.g. a test). */
  testEnabled: boolean;
  /** The coach took this player out while the team is on the goals mode. */
  choicesOff: boolean;
  updatedAt: string | null;
  updatedByRole: "player" | "coach" | null;
};

type RawRow = {
  picks?: unknown;
  locked_slots?: unknown;
  strength_goal?: unknown;
  goal_locked?: boolean | null;
  test_enabled?: boolean | null;
  choices_off?: boolean | null;
  updated_at?: string | null;
  updated_by_role?: string | null;
};
const ROW_COLS = "picks, locked_slots, strength_goal, goal_locked, test_enabled, choices_off, updated_at, updated_by_role";

type TeamRow = {
  slots: PaletteSlots;
  /** The team's send mode (the one switch for player choices). */
  mode: SendMode;
  /** The team is on the goals mode (everyone takes part unless taken out). */
  enabled: boolean;
  hasList: boolean;
};

/** The team's list + send mode. No palette row → no list. */
export async function readTeamPickConfig(sb: SupabaseClient, teamId: string): Promise<TeamRow> {
  const [pal, team] = await Promise.all([
    sb.from("team_strength_palette").select("slots").eq("team_id", teamId).maybeSingle(),
    sb.from("teams").select("strength_send_mode").eq("id", teamId).maybeSingle(),
  ]);
  if (pal.error) throw new Error(pal.error.message);
  if (team.error) throw new Error(team.error.message);
  const slots = sanitizePaletteSlots((pal.data as { slots?: unknown } | null)?.slots);
  const mode = normalizeSendMode((team.data as { strength_send_mode?: string } | null)?.strength_send_mode);
  return { slots, mode, enabled: mode === "individualised_goals", hasList: pickableSlots(slots).length > 0 };
}

type Setting = Pick<PlayerPicksRow, "testEnabled" | "choicesOff">;
const settingOf = (row: Partial<Setting> | null | undefined) => ({ on: !!row?.testEnabled, off: !!row?.choicesOff });

/** Does this player take part under the team's mode (goals, 8-week goals without approval)? */
export function playerTakesPart(cfg: Pick<TeamRow, "mode">, row: Partial<Setting> | null | undefined): boolean {
  return takesPart(cfg.mode, settingOf(row));
}

/** Are exercise picks and the strength goal on for this player? They take part, and the team has a list. */
export function choicesOn(cfg: Pick<TeamRow, "mode" | "hasList">, row: Partial<Setting> | null | undefined): boolean {
  return cfg.hasList && playerTakesPart(cfg, row);
}

/** Do 8-week goals start without approval for this player? They take part; no team list needed (lota 4). */
export function goalsWithoutApproval(cfg: Pick<TeamRow, "mode">, row: Partial<Setting> | null | undefined): boolean {
  return playerTakesPart(cfg, row);
}

/**
 * Read-only: does this player take part under the team's send mode? Decides whether they may start an 8-week goal
 * (and whether it starts without approval: goalPlan/store.ts `createGoalRequest({ autoStart })`).
 */
export async function goalsWithoutApprovalFor(sb: SupabaseClient, teamId: string, playerId: string): Promise<boolean> {
  const [team, row] = await Promise.all([
    sb.from("teams").select("strength_send_mode").eq("id", teamId).maybeSingle(),
    sb.from("player_strength_picks").select("test_enabled, choices_off").eq("player_id", playerId).eq("team_id", teamId).maybeSingle(),
  ]);
  if (team.error) throw new Error(team.error.message);
  if (row.error) throw new Error(row.error.message);
  const mode = normalizeSendMode((team.data as { strength_send_mode?: string } | null)?.strength_send_mode);
  const r = row.data as { test_enabled?: boolean; choices_off?: boolean } | null;
  return takesPart(mode, { on: !!r?.test_enabled, off: !!r?.choices_off });
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
    choicesOff: !!raw?.choices_off,
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
const FRESH_TEAM = { strength_goal: null, goal_locked: false, test_enabled: false, choices_off: false };

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
  args: {
    playerId: string; teamId: string; slots: PaletteSlots; goal: StrengthGoal | null; actor: PickActor; reason?: string | null;
    /** What the force-plate tests suggested when the goal was chosen (null = no suggestion). Kept in the history. */
    dsiSuggested?: StrengthGoal | null;
  },
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
  await logEvent(sb, { teamId: args.teamId, playerId: args.playerId, kind: "goal_set", before, after: { goal: args.goal, dsiSuggested: args.dsiSuggested ?? null }, actor: args.actor, reason: args.reason });
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

/** Coach turns player choices on (or off) for ONE player to test, while the team switch is off. Without a team list
 *  only the 8-week goal changes (starts without approval); picks and the strength goal need the list. */
export async function setTestPlayer(
  sb: SupabaseClient,
  args: { playerId: string; teamId: string; on: boolean; actor: PickActor },
): Promise<void> {
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

/** Coach takes ONE player out of the goals mode (or puts them back), with a reason kept in the history. */
export async function setPlayerOut(
  sb: SupabaseClient,
  args: { playerId: string; teamId: string; out: boolean; actor: PickActor; reason: string },
): Promise<void> {
  const prior = await existingRow(sb, args.playerId);
  const sameTeam = prior?.team_id === args.teamId;
  if (!sameTeam && !args.out) return; // nothing to put back on this team
  const { error } = await sb.from("player_strength_picks").upsert(
    {
      player_id: args.playerId,
      team_id: args.teamId,
      ...(sameTeam ? {} : { picks: {}, locked_slots: [], ...FRESH_TEAM }),
      choices_off: args.out,
      updated_by: args.actor.userId,
      updated_by_role: args.actor.role,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "player_id" },
  );
  if (error) throw new Error(error.message);
  await logEvent(sb, { teamId: args.teamId, playerId: args.playerId, kind: args.out ? "player_out" : "player_in", actor: args.actor, reason: args.reason });
}

/** The team's send mode changed to or from the goals mode: kept in the history (who, when, which modes). The mode
 *  itself is written by the send-mode route (`teams.strength_send_mode`). */
export async function logTeamModeChange(
  sb: SupabaseClient,
  args: { teamId: string; from: SendMode; to: SendMode; actor: PickActor },
): Promise<void> {
  const was = args.from === "individualised_goals";
  const now = args.to === "individualised_goals";
  if (was === now) return;
  await logEvent(sb, { teamId: args.teamId, playerId: null, kind: now ? "enabled" : "disabled", before: { mode: args.from }, after: { mode: args.to }, actor: args.actor });
}
