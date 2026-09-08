/**
 * Load-monitor prehab flags — a RISK FLAG, not a quality deficit. The load monitor
 * flags a prehab PRIORITY (keep robustness / prehab up), it does not add a specific
 * corrective. Two signals: a prior-injury flag (the strongest modifiable re-injury
 * risk factor) and a load-spike flag (ACWR). Descriptive / advisory — never the
 * readiness colour; used for load-management, not injury prediction. Server-only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { computePlayerLoadAcwr, buildAcwrDriverFlag, formatAcwrReason } from "@/lib/micropulse/playerLoadAcwr";
import type { PrehabFlag } from "./reconcile";

export async function loadPrehabFlags(sb: SupabaseClient, playerId: string): Promise<PrehabFlag[]> {
  const flags: PrehabFlag[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // Prior injury — the strongest modifiable re-injury risk factor.
  try {
    const { data } = await sb
      .from("player_injuries")
      .select("injury_type, body_part, injury_date, status")
      .eq("player_id", playerId)
      .neq("status", "cleared")
      .order("injury_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const r = data as { injury_type?: string | null; body_part?: string | null; injury_date?: string | null } | null;
    if (r) {
      const what = r.injury_type || r.body_part || "injury";
      flags.push({
        key: "prior_injury",
        label: { en: "Prior injury — keep prehab up", is: "Fyrri meiðsli — haltu prehab uppi" },
        detail: { en: `${what}${r.injury_date ? ` · since ${r.injury_date}` : ""}`, is: `${what}${r.injury_date ? ` · síðan ${r.injury_date}` : ""}` },
        severity: "priority",
        source: "load",
        evidence: "Prior injury is the strongest modifiable re-injury risk factor (Green & Pizzari 2017; hamstring / calf reviews).",
      });
    }
  } catch { /* no injuries table row — skip */ }

  // Load spike — ACWR climbing faster than the 28-day base.
  try {
    const since = new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10);
    const { data } = await sb
      .from("player_external_load_daily")
      .select("date, total_player_load")
      .eq("player_id", playerId)
      .gte("date", since)
      .order("date", { ascending: true });
    const rows = ((data ?? []) as Array<{ date: string; total_player_load: number | null }>).map((r) => ({ date: r.date, load: r.total_player_load }));
    if (rows.length) {
      const flag = buildAcwrDriverFlag(computePlayerLoadAcwr(rows, today));
      if (flag) {
        const reason = formatAcwrReason(flag);
        flags.push({
          key: "load_spike",
          label: { en: "Load spike — prehab priority", is: "Álagstoppur — prehab forgangur" },
          detail: { en: reason, is: reason },
          severity: flag.severity === "high" ? "priority" : "watch",
          source: "load",
          evidence: "ACWR spike = a bigger jump than recent weeks built up to (Gabbett; Impellizzeri 2020) — a robustness/prehab priority, never an injury prediction.",
        });
      }
    }
  } catch { /* no load table rows — skip */ }

  return flags;
}
