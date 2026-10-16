import "server-only";

/**
 * Team-wide external-load ACWR read for the Today coach-signal chip.
 *
 * Reuses the EXISTING batch loader (`loadPlayerLoadAcwrBatch` — one paginated
 * query over `player_external_load_daily`, no per-player fan-out) and the pure
 * driver flag (`buildAcwrDriverFlag`). Returns ONLY the players whose ACWR has
 * crossed into WATCH / RISK — i.e. the flagged set the derive function grades.
 * Provenance counts (estimated / away / stale) from the #2.2 work ride along so
 * the chip can down-weight or suppress a spike that rests on fills or old load.
 *
 * READ-ONLY / ADVISORY — never reads-as or writes the readiness colour, load
 * target, or daily decision. Service-role read (tokenless → cron-safe).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPlayerLoadAcwrBatch } from "./loader";
import { buildAcwrDriverFlag } from "./index";
import type { LoadAcwrLite } from "@/lib/micropulse/coachSignals";

export async function loadTeamLoadAcwrSignals(
  sb: SupabaseClient,
  teamId: string,
  todayIso: string,
): Promise<LoadAcwrLite[]> {
  const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true);
  const roster = (players ?? []) as Array<{ id: string; full_name: string | null }>;
  if (roster.length === 0) return [];

  const byPlayer = await loadPlayerLoadAcwrBatch(sb, { playerIds: roster.map((p) => p.id), todayIso });
  const out: LoadAcwrLite[] = [];
  for (const p of roster) {
    const payload = byPlayer.get(p.id);
    if (!payload) continue;
    const flag = buildAcwrDriverFlag(payload); // null on SAFE / UNDERTRAIN / INSUFFICIENT_DATA
    if (!flag || (flag.band !== "WATCH" && flag.band !== "RISK")) continue;
    out.push({
      playerId: p.id,
      name: (p.full_name ?? "").trim() || "—",
      ratio: flag.ratio,
      band: flag.band,
      severity: flag.severity,
      acuteMean: flag.acuteMean,
      chronicMean: flag.chronicMean,
      daysObserved: payload.daysObserved,
      estimatedDays: payload.estimatedDays,
      awayDays: payload.awayDays,
      stale: payload.stale,
    });
  }
  return out;
}
