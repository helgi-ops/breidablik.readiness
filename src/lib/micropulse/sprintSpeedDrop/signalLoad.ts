import "server-only";

/**
 * Team-wide sprint-speed-drop read for the Today coach-signal chip.
 *
 * Reuses the EXISTING batch loader (`loadSprintDropBatch` — one round-trip over
 * `player_external_load_daily`, no per-player fan-out) and the pure driver flag
 * (`buildSprintDropDriverFlag`). Returns ONLY the players whose max sprint
 * velocity has dropped into WATCH / CONCERN / HIGH_RISK vs their own recent peak
 * — i.e. the flagged set the derive function grades.
 *
 * READ-ONLY / ADVISORY — never reads-as or writes the readiness colour, load
 * target, or daily decision. Service-role read (tokenless → cron-safe).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSprintDropBatch } from "./loader";
import { buildSprintDropSignalFlag } from "./index";
import type { SprintDropLite } from "@/lib/micropulse/coachSignals";

export async function loadTeamSprintDropSignals(
  sb: SupabaseClient,
  teamId: string,
  todayIso: string,
): Promise<SprintDropLite[]> {
  const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const roster = (players ?? []) as Array<{ id: string; full_name: string | null }>;
  if (roster.length === 0) return [];

  const byPlayer = await loadSprintDropBatch(sb, { playerIds: roster.map((p) => p.id), todayIso });
  const out: SprintDropLite[] = [];
  for (const p of roster) {
    const payload = byPlayer.get(p.id);
    if (!payload) continue;
    // The SUSTAINED gate — persists across the last ~3 HSR sessions, not a single
    // sub-maximal day (which over-flags). null below 7% sustained / no data.
    const flag = buildSprintDropSignalFlag(payload);
    if (!flag) continue;
    out.push({
      playerId: p.id,
      name: (p.full_name ?? "").trim() || "—",
      sustainedDropPct: flag.sustainedDropPct,
      recentMeanMs: flag.recentMeanMs,
      referenceMs: flag.referenceMs,
      severity: flag.severity,
      refSessionCount: payload.refSessionCount,
    });
  }
  return out;
}
