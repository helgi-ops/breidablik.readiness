/**
 * Belt-HR → Today signal loader. A thin bridge that runs the existing
 * `loadHrForTeam` gather and projects each player's LATEST belt session onto the
 * minimal `HrLoadReadLite` the coach_signals `hr_load` adapter consumes. No new
 * data layer, no duplicated compute — the same reads that power the Heart Rate
 * Intelligence page feed the Today chip.
 *
 * READ-ONLY / ADVISORY — never reads-as or writes the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadHrForTeam } from "./loadForTeam";
import type { HrLoadReadLite } from "@/lib/micropulse/coachSignals";

export async function loadTeamHrLoadSignals(sb: SupabaseClient, teamId: string): Promise<HrLoadReadLite[]> {
  const { reads } = await loadHrForTeam(sb, teamId);
  return reads.map((r) => {
    const s = r.read.latest;
    return {
      playerId: r.playerId,
      name: r.name,
      alignment: s?.alignment ?? "insufficient",
      confidence: r.read.confidence,
      verdict: { en: s?.verdict.en ?? "", is: s?.verdict.is ?? "" },
    };
  });
}
