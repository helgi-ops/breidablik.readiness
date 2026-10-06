import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Does this team run velocity-based training (GymAware)? Team-level flag from `gymaware_settings`
 * (sync_enabled) — the same source `/api/team/decisions` uses to decide whether to read VBT.
 *
 * Used to gate the non-VBT strength loop (log sets → e1RM → working kg + RPE autoregulation): that
 * loop is the objective-load path for teams WITHOUT VBT; where VBT is enabled the velocity read is the
 * objective source, so the log/e1RM surfaces hide. Adds NO new tier source.
 */
export async function teamHasVbt(sb: SupabaseClient, teamId: string | null | undefined): Promise<boolean> {
  if (!teamId) return false;
  const { data } = await sb
    .from("gymaware_settings")
    .select("team_id")
    .eq("team_id", teamId)
    .eq("sync_enabled", true)
    .maybeSingle();
  return !!data;
}
