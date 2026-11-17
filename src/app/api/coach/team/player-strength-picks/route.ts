/**
 * /api/coach/team/player-strength-picks — the coach's view of the players' exercise picks (lota 1) and strength
 * goals + one-player test (lota 2), 2026-11-17.
 *
 * GET → { ok, mode, enabled, hasList, groups, goals, players: [{ id, name, picks, locked, goal, goalLocked, testEnabled,
 *         choicesOff, takesPart, suggestion, updatedAt, updatedByRole }], picked, withGoal, testing, out, taking, total }
 *       `mode` (2026-11-17): the team's send mode, the one switch for player choices (set on the strength send page);
 *       `enabled` = the team is on the goals mode.
 *       `suggestion` (2026-11-17): the goal the player's force-plate tests (DSI, against the team) suggest, or null.
 * PUT one of:
 *   { action: "test", playerId, on }                      → let ONE player take part while the team is on another mode
 *   { action: "out", playerId, out, reason }              → take ONE player out of the goals mode / put back (reason kept)
 *   { action: "set", playerId, slot, ids, reason }        → change a player's picks for a group (reason kept)
 *   { action: "lock", playerId, slot, locked, reason }    → lock / unlock a group for a player (reason kept)
 *   { action: "goal", playerId, goal, reason }            → change a player's goal (null clears; reason kept)
 *   { action: "goal_lock", playerId, locked, reason }     → lock / unlock a player's goal (reason kept)
 *
 * Coach of the team only (requireCoachAccessForTeam; the team is read on the server, never from the body); the
 * player must be on that team. FREE-locked teams get 402. Writes only through playerPicksStore. Nothing is sent to
 * the player; Today's session already sent is not changed.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import {
  GOAL_DAYS,
  PICK_REASON_MIN,
  STRENGTH_GOALS,
  STRENGTH_GOAL_LABEL,
  isPickSlot,
  validateGoal,
  validatePlayerPick,
} from "@/lib/micropulse/strengthProgramming/playerPicks";
import {
  PicksError,
  pickGroups,
  readPlayerPicks,
  readTeamPickConfig,
  readTeamPicks,
  saveGoal,
  savePicks,
  setGoalLock,
  setLock,
  playerTakesPart,
  setPlayerOut,
  setTestPlayer,
} from "@/lib/micropulse/strengthProgramming/playerPicksStore";
import { loadDsiGoalSuggestions } from "@/lib/micropulse/strengthProgramming/loadDsiForTeam";

export const runtime = "nodejs";

type Sb = ReturnType<typeof getSupabaseServer>;

function fail(e: unknown) {
  if (e instanceof PicksError) return NextResponse.json({ error: e.message, error_is: e.is }, { status: e.status });
  return authErrorToResponse(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
}

async function freeLocked(sb: Sb, teamId: string) {
  const { data } = await sb.rpc("is_free_locked_team", { p_team_id: teamId });
  return data === true;
}

async function teamState(sb: Sb, teamId: string) {
  const cfg = await readTeamPickConfig(sb, teamId);
  const { data, error } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true).order("full_name");
  if (error) throw new Error(error.message);
  const [rows, suggestions] = await Promise.all([
    readTeamPicks(sb, teamId, cfg.slots),
    loadDsiGoalSuggestions(sb, teamId, new Date().toISOString().slice(0, 10)),
  ]);
  const players = ((data ?? []) as { id: string; full_name: string | null }[]).map((p) => {
    const r = rows.get(p.id);
    return {
      id: p.id,
      name: (p.full_name ?? "").trim() || "—",
      picks: r?.picks ?? {},
      locked: r?.locked ?? [],
      goal: r?.goal ?? null,
      goalLocked: r?.goalLocked ?? false,
      testEnabled: r?.testEnabled ?? false,
      choicesOff: r?.choicesOff ?? false,
      takesPart: playerTakesPart(cfg, r),
      suggestion: suggestions.get(p.id) ?? null,
      updatedAt: r?.updatedAt ?? null,
      updatedByRole: r?.updatedByRole ?? null,
    };
  });
  const picked = players.filter((p) => Object.keys(p.picks).length > 0).length;
  const withGoal = players.filter((p) => p.goal).length;
  const testing = players.filter((p) => p.testEnabled).length;
  const out = players.filter((p) => p.choicesOff).length;
  const taking = players.filter((p) => p.takesPart).length;
  const goals = STRENGTH_GOALS.map((id) => ({ id, ...STRENGTH_GOAL_LABEL[id], days: GOAL_DAYS[id] }));
  return { ok: true, mode: cfg.mode, enabled: cfg.enabled, out, taking, hasList: cfg.hasList, groups: pickGroups(cfg.slots), goals, players, picked, withGoal, testing, total: players.length };
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { teamId } = await requireCoachAccessForTeam(sb, req);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });
    if (await freeLocked(sb, teamId)) return NextResponse.json({ error: "Not on this plan", error_is: "Ekki í áskrift liðsins" }, { status: 402 });
    return NextResponse.json(await teamState(sb, teamId));
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: Request) {
  try {
    const sb = getSupabaseServer();
    const { teamId, coachUserId } = await requireCoachAccessForTeam(sb, req);
    if (!teamId) return NextResponse.json({ error: "No team" }, { status: 400 });
    if (await freeLocked(sb, teamId)) return NextResponse.json({ error: "Not on this plan", error_is: "Ekki í áskrift liðsins" }, { status: 402 });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Bad body" }, { status: 400 });
    const actor = { role: "coach" as const, userId: coachUserId };

    // The team switch is the team's send mode now (strength send page, 2026-11-17).
    if (body.action === "enable") {
      return NextResponse.json({
        error: "Choose \"Individualised + goals\" as the team's mode on the strength send page.",
        error_is: "Veldu „Einstaklingsmiðað + markmið“ sem ham liðsins á sendingarsíðu styrktaræfinga.",
      }, { status: 400 });
    }

    if (!["set", "lock", "goal", "goal_lock", "test", "out"].includes(String(body.action))) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const playerId = typeof body.playerId === "string" ? body.playerId : "";
    const { data: player, error: pErr } = await sb.from("players").select("id").eq("id", playerId).eq("team_id", teamId).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!player) return NextResponse.json({ error: "Player is not on your team", error_is: "Leikmaður er ekki í liðinu þínu" }, { status: 404 });

    // The coach's own test switch for one player needs no reason (it changes nothing until the player chooses).
    if (body.action === "test") {
      if (typeof body.on !== "boolean") return NextResponse.json({ error: "on must be true or false" }, { status: 400 });
      await setTestPlayer(sb, { playerId, teamId, on: body.on, actor });
      return NextResponse.json(await teamState(sb, teamId));
    }

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < PICK_REASON_MIN) {
      return NextResponse.json({ error: "Add a short reason (kept in the history).", error_is: "Skrifaðu stutta ástæðu (vistuð í sögunni)." }, { status: 400 });
    }

    if (body.action === "out") {
      if (typeof body.out !== "boolean") return NextResponse.json({ error: "out must be true or false" }, { status: 400 });
      await setPlayerOut(sb, { playerId, teamId, out: body.out, actor, reason });
      return NextResponse.json(await teamState(sb, teamId));
    }

    const cfg = await readTeamPickConfig(sb, teamId);
    if (body.action === "goal") {
      const g = validateGoal(body.goal, false, { coach: true });
      if (!g.ok) return NextResponse.json({ error: g.error.en, error_is: g.error.is, code: g.error.code }, { status: 400 });
      const suggested = (await loadDsiGoalSuggestions(sb, teamId, new Date().toISOString().slice(0, 10))).get(playerId)?.goal ?? null;
      await saveGoal(sb, { playerId, teamId, slots: cfg.slots, goal: g.goal, actor, reason, dsiSuggested: suggested });
      return NextResponse.json(await teamState(sb, teamId));
    }
    if (body.action === "goal_lock") {
      if (typeof body.locked !== "boolean") return NextResponse.json({ error: "locked must be true or false" }, { status: 400 });
      await setGoalLock(sb, { playerId, teamId, slots: cfg.slots, locked: body.locked, actor, reason });
      return NextResponse.json(await teamState(sb, teamId));
    }
    if (body.action === "set") {
      const current = await readPlayerPicks(sb, playerId, teamId, cfg.slots);
      const v = validatePlayerPick(String(body.slot ?? ""), body.ids, cfg.slots, current.locked, { coach: true });
      if (!v.ok) return NextResponse.json({ error: v.error.en, error_is: v.error.is, code: v.error.code }, { status: 400 });
      await savePicks(sb, { playerId, teamId, slots: cfg.slots, slot: v.slot, ids: v.ids, actor, reason });
    } else {
      const slot = String(body.slot ?? "");
      if (!isPickSlot(slot)) return NextResponse.json({ error: "Unknown group", error_is: "Óþekktur flokkur" }, { status: 400 });
      if (typeof body.locked !== "boolean") return NextResponse.json({ error: "locked must be true or false" }, { status: 400 });
      await setLock(sb, { playerId, teamId, slots: cfg.slots, slot, locked: body.locked, actor, reason });
    }
    return NextResponse.json(await teamState(sb, teamId));
  } catch (e) {
    return fail(e);
  }
}
