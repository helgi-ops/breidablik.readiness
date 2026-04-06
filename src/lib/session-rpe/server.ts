import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserIdFromBearer, requireCoachUserId, resolvePlayerIdForUser } from "@/lib/notifications/auth";

export type CoachProfile = {
  id: string;
  role: string | null;
  team_id: string | null;
};

export async function requireAuthedPlayerId(sb: SupabaseClient, req: Request): Promise<{ userId: string; playerId: string }> {
  const userId = await getUserIdFromBearer(sb, req);
  if (!userId) throw new Error("Unauthorized");

  const playerId = await resolvePlayerIdForUser(sb, userId);
  if (!playerId) throw new Error("Authenticated user is not mapped to a player");

  return { userId, playerId };
}

export async function getPlayerTeamId(sb: SupabaseClient, playerId: string): Promise<string | null> {
  const { data, error } = await sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
  if (error) throw new Error(error.message);
  return ((data as { team_id?: string | null } | null)?.team_id ?? null) as string | null;
}

export async function requireCoachAccessForTeam(
  sb: SupabaseClient,
  req: Request,
  requestedTeamId?: string | null
): Promise<{ coachUserId: string; teamId: string | null; role: string }> {
  const coachUserId = await requireCoachUserId(sb, req);

  const { data, error } = await sb.from("profiles").select("id, role, team_id").eq("id", coachUserId).maybeSingle();
  if (error) throw new Error(error.message);

  const prof = (data ?? null) as CoachProfile | null;
  const role = String(prof?.role ?? "").toLowerCase();
  const ownTeamId = prof?.team_id ?? null;

  const targetTeamId = requestedTeamId ?? ownTeamId;
  if (!targetTeamId && role !== "admin") {
    throw new Error("Team context is required");
  }

  if (role !== "admin" && requestedTeamId && ownTeamId && requestedTeamId !== ownTeamId) {
    throw new Error("Forbidden");
  }

  return {
    coachUserId,
    teamId: targetTeamId,
    role,
  };
}
