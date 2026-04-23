import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getUserIdFromBearer } from "@/lib/notifications/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
