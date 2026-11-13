/** Shared by the player goal routes: who the player is (from the token, never the body) and error answers. */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { getPlayerTeamId, requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { authErrorToResponse } from "@/lib/auth/httpError";
import { GoalPlanError } from "@/lib/micropulse/goalPlan/store";

type Sb = ReturnType<typeof getSupabaseServer>;

export async function requireGoalPlayer(sb: Sb, req: Request) {
  const { userId, playerId } = await requireAuthedPlayerId(sb, req);
  const teamId = await getPlayerTeamId(sb, playerId);
  if (!teamId) throw new GoalPlanError(403, "No team", "Ekkert lið");
  const { data: locked } = await sb.rpc("is_free_locked_team", { p_team_id: teamId });
  if (locked === true) throw new GoalPlanError(402, "Not on this plan", "Ekki í áskrift liðsins");
  return { userId, playerId, teamId };
}

export function goalFail(e: unknown) {
  if (e instanceof GoalPlanError) return NextResponse.json({ error: e.message, error_is: e.is }, { status: e.status });
  if (e instanceof Error && e.message === "Authenticated user is not mapped to a player") {
    return NextResponse.json({ error: "Not a player account", error_is: "Ekki leikmannsaðgangur" }, { status: 403 });
  }
  return authErrorToResponse(e) ?? NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
}

