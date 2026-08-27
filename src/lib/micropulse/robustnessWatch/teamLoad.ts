/**
 * Team-wide Robustness-watch loader (server helper).
 *
 * The robustness page + `/api/coach/player/[id]/robustness-watch` load ONE player
 * at a time. The Today background-signal needs the whole squad, so this runs the
 * existing per-player `loadRobustnessWatch` over every active player with bounded
 * concurrency (each call composes ~7 reads; ~3s for a 25-man squad). Same engine,
 * same conservative 0%-over-flag behaviour — it just fans out.
 *
 * READ-ONLY / ADVISORY — the robustness engine never reads-as or writes the
 * readiness colour, load target, or daily decision. Feeds the exception-gated
 * coach_signals chip.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadRobustnessWatch } from "./loader";
import type { RobustnessWatch } from "./index";

/** RobustnessWatch carries no player identity — re-attach it for the signal rows. */
export type TeamRobustnessRead = RobustnessWatch & { playerId: string; playerName: string };

export async function loadTeamRobustnessWatch(
  sb: SupabaseClient,
  teamId: string,
  asOf: string,
  concurrency = 6,
): Promise<TeamRobustnessRead[]> {
  const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const roster = (players ?? []) as Array<{ id: string; full_name: string | null }>;

  const out: TeamRobustnessRead[] = [];
  for (let i = 0; i < roster.length; i += concurrency) {
    const chunk = roster.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map(async (p) => {
      const name = p.full_name ?? "Player";
      const w = await loadRobustnessWatch(sb, teamId, p.id, name, asOf).catch(() => null);
      return w ? { ...w, playerId: p.id, playerName: name } : null;
    }));
    for (const r of results) if (r) out.push(r);
  }
  return out;
}
