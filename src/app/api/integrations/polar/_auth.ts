import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getUserIdFromBearer } from "@/lib/notifications/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { resolveCoachTeamId } from "@/lib/server/integrations/polarStore";

/**
 * Resolve user id for Polar routes via bearer or cookie session.
 * Returns the supabase user id, or null if unauthenticated.
 */
export async function resolvePolarRouteUserId(req: Request): Promise<string | null> {
  const sb = getSupabaseAdmin();
  const fromBearer = await getUserIdFromBearer(sb, req);
  if (fromBearer) return fromBearer;

  const cookieClient = await createSupabaseServerClient();
  const { data, error } = await cookieClient.auth.getUser();
  if (!error && data?.user?.id) return data.user.id;

  return null;
}

/**
 * The team a Polar route acts on: the caller's own team, or an explicit teamId they have access to
 * (throws "Forbidden" otherwise, see authErrorToResponse).
 */
export async function resolvePolarTeamId(req: Request, userId: string, requestedTeamId?: string | null): Promise<string | null> {
  if (!requestedTeamId) return resolveCoachTeamId(userId);
  const { teamId } = await requireCoachAccessForTeam(getSupabaseAdmin(), req, requestedTeamId);
  return teamId;
}
