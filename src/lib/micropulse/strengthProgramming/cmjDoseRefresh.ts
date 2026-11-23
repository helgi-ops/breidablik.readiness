import "server-only";

/**
 * After a VALD sync brings in today's jump tests (brief §3): the test day's rule must reach today's session and the
 * coach's Today line, the same day. The team tests on MD+3 / MD-2 (MD-1 when MD-2 is off), often after the 09:00
 * send, and the VALD sync is started by hand.
 *
 *  - Each player with a jump test today: today's AUTOMATIC session is rebuilt with the same builder as the check-in
 *    rebuild (`refreshAutoSessionAfterCheckin`): untouched origin-"auto" rows only, never a coach's hand send, never a
 *    started session, no push. The jump rule (cmjDose.ts) then runs in it.
 *  - The coach's "Jump test before the match" line (coach_signals engine cmj_dose) is replaced for today.
 *
 * Read the readiness colour: never. Best-effort: never throws.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshAutoSessionAfterCheckin, type AutoRefreshResult } from "./autoSession";
import { loadTeamCmjDoseReads } from "./cmjDoseLoader";
import { cmjTestFacts } from "./cmjDose";
import { deriveCmjDoseTeamSignal, derivePlayerCmjDoseSignals } from "@/lib/micropulse/coachSignals";

export async function refreshAfterJumpTests(sb: SupabaseClient, teamId: string, todayIso: string): Promise<{ rebuilt: Record<string, AutoRefreshResult>; coachLine: number } | null> {
  try {
    const { data } = await sb
      .from("vald_forcedecks_results")
      .select("microplayer_id")
      .eq("team_id", teamId)
      .eq("is_valid", true)
      .gte("test_timestamp", `${todayIso}T00:00:00`)
      .lte("test_timestamp", `${todayIso}T23:59:59`)
      .limit(1000);
    const players = [...new Set(((data ?? []) as Array<{ microplayer_id: string | null }>).map((r) => r.microplayer_id).filter((x): x is string => !!x))];

    const rebuilt: Record<string, AutoRefreshResult> = {};
    for (let i = 0; i < players.length; i += 3) {
      const chunk = players.slice(i, i + 3);
      const res = await Promise.all(chunk.map((p) => refreshAutoSessionAfterCheckin(sb, p, todayIso)));
      chunk.forEach((p, k) => { rebuilt[p] = res[k]; });
    }

    // The coach's line: replace today's cmj_dose rows only (the rest of the cache stays as computed).
    const reads = await loadTeamCmjDoseReads(sb, teamId, todayIso);
    const lite = reads.map((r) => ({ playerId: r.playerId, name: r.name, rule: r.rule, facts: cmjTestFacts(r.test) }));
    const team = deriveCmjDoseTeamSignal(lite);
    const rows = [{ ...team, playerId: null as string | null }, ...derivePlayerCmjDoseSignals(lite).map((x) => ({ ...x.signal, playerId: x.playerId }))];
    const nowIso = new Date().toISOString();
    await sb.from("coach_signals").delete().eq("team_id", teamId).eq("as_of", todayIso).eq("engine", "cmj_dose");
    await sb.from("coach_signals").insert(rows.map((s) => ({
      team_id: teamId, engine: s.engine, player_id: s.playerId, level: s.level, label: s.label, why: s.why,
      confidence: s.confidence, counterfactual: s.counterfactual, href: s.href, as_of: todayIso, updated_at: nowIso,
    })));
    return { rebuilt, coachLine: lite.length };
  } catch {
    return null;
  }
}
