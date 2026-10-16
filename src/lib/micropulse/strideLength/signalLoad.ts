import "server-only";

/**
 * Team-wide stride-fatigue read for the Today coach-signal chip.
 *
 * Reuses the EXISTING team loader (`loadTeamStrideVerdicts` — one paginated
 * window query, a squad norm per session-kind, no per-player scan) and keeps
 * only the players whose latest verdict is a trustworthy `shortened`:
 *   - verdict === "shortened" (strides SHORTER than his same-kind norm = fatigue);
 *   - confidence >= CONF_FLOOR (enough same-kind history that the norm stands —
 *     mirrors the form-dip low-confidence exclusion; the engine's 2.5-SD gate is
 *     the primary false-flag guard);
 *   - for a `match`-kind verdict, minutesKnown must be true, so a hard training
 *     day misclassified "match" by the distance fallback can't mis-flag.
 *
 * READ-ONLY / ADVISORY — never reads-as or writes the readiness colour. Service-
 * role read (tokenless → cron-safe).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTeamStrideVerdicts } from "./loader";
import type { StrideFatigueLite } from "@/lib/micropulse/coachSignals";

const CONF_FLOOR = 0.5; // historyN >= 4 same-kind sessions (MATURE_HISTORY = 8)

export async function loadTeamStrideFatigueSignals(
  sb: SupabaseClient,
  teamId: string,
  date: string,
): Promise<StrideFatigueLite[]> {
  const verdicts = await loadTeamStrideVerdicts(sb, { teamId, date });
  const out: StrideFatigueLite[] = [];
  for (const v of verdicts) {
    if (v.verdict !== "shortened") continue;
    if (v.confidence < CONF_FLOOR) continue;
    if (v.kind === "match" && !v.minutesKnown) continue; // distance-fallback misclassification guard
    if (v.kind !== "match" && v.kind !== "big_session") continue; // only verdict kinds
    if (v.deltaPct == null) continue;
    out.push({
      playerId: v.playerId,
      name: (v.fullName ?? "").trim() || "—",
      deltaPct: v.deltaPct,
      kind: v.kind,
      confidence: v.confidence,
      reason: v.reason,
      reasonIs: v.reasonIs,
    });
  }
  return out;
}
