"use client";

/**
 * Pre-season week's starting-load target, in Week setup. Ties the day plan the coach is building to
 * the controlled re-entry / ramp: it works out WHICH pre-season week this is (from weekStart vs the
 * pre-season phase start) and shows that week's team target — ×match multiple, weekly + per-session
 * load, sRPE/AU, main KPIs — plus a per-day split (by each day's intent) from the same engine the hub
 * uses. Emits the per-day breakdown upward (onComputed) so Week setup can print the dose in each grid
 * cell. Per-player detail + editing live in the hub (linked). Descriptive; never the readiness colour.
 */

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { preseasonStartRamp, type LoadAnchor, type PreseasonWeekTarget } from "@/lib/micropulse/periodization/preseasonStart";
import { distributeWeekKpis, type PerDayKpiTarget } from "@/lib/micropulse/periodization/preseasonWeekPlan";
import { teamKpiAvg } from "@/lib/micropulse/periodization/preseasonKpiMap";
import { WEEKLY_LOAD_LABELS, type WeeklyLoadMetricKey } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";
import type { MatchUnit } from "@/lib/micropulse/periodization";

type Phase = { key: string; start: string; end: string; weeks: number };
type Player = { playerId: string; name: string; matchUnit: MatchUnit };
type Plan = { phases: Phase[]; matchLoad: number | null; matchSrpe: number | null; tier: { loadSource: "gps" | "srpe" | "none" }; players: Player[] };

export type PreseasonComputed = { weekIndex: number; preWeeks: number; row: PreseasonWeekTarget; perDay: PerDayKpiTarget[] };

/** Fetch periodization with a couple of retries — poor networks abort the first request. */
async function fetchPeriodization(signal: AbortSignal): Promise<Plan | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal.aborted) return null;
    try {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
      if (!tok) return null;
      const res = await fetch(`/api/coach/periodization`, { headers: { Authorization: `Bearer ${tok}` }, signal });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) return j.plan as Plan;
    } catch {
      if (signal.aborted) return null; // component unmounted — stop
      // otherwise fall through to a retry
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return null;
}

export default function PreseasonStartWeekCard({ teamId, weekStart, intents, onComputed }: {
  teamId: string; weekStart: string; intents?: string[]; onComputed?: (info: PreseasonComputed | null) => void;
}) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const p = await fetchPeriodization(ctrl.signal);
      if (!ctrl.signal.aborted) { setPlan(p); setLoaded(true); }
    })();
    return () => ctrl.abort();
  }, [teamId]);

  // Weekly target for the pre-season week being edited (stable unless the plan / week changes).
  const info = React.useMemo(() => {
    if (!plan) return null;
    const pre = plan.phases.find((p) => p.key === "preseason");
    const preWeeks = Math.max(1, pre?.weeks ?? 6);
    let weekIndex = 1;
    if (pre?.start) {
      const off = Math.floor((Date.parse(`${weekStart}T00:00:00Z`) - Date.parse(`${pre.start}T00:00:00Z`)) / (7 * 86_400_000));
      weekIndex = Math.min(preWeeks, Math.max(1, off + 1));
    }
    const anchor: LoadAnchor = plan.matchLoad != null ? "match_this_season" : plan.tier.loadSource === "srpe" ? "srpe_only" : "normative";
    const ramp = preseasonStartRamp({ matchTypicalLoad: plan.matchLoad, matchKpiAvg: teamKpiAvg(plan.players.map((p) => p.matchUnit)), matchSrpeAu: plan.matchSrpe, sessionsPerWeek: 4, preseasonWeeks: preWeeks, anchor });
    const row = ramp[weekIndex - 1] ?? null;
    return row ? { preWeeks, weekIndex, anchor, ramp, row } : null;
  }, [plan, weekStart]);

  // Per-day split, recomputed live as the coach edits the day-intent grid.
  const perDay = React.useMemo<PerDayKpiTarget[] | null>(() => {
    if (!info || !intents || intents.length === 0) return null;
    return distributeWeekKpis({ intents, weeklyLoad: info.row.weeklyLoadTarget, weeklySrpe: info.row.sRpeAuTarget, weeklyKpi: info.row.byKpi });
  }, [info, intents]);

  // Report upward so Week setup can print each day's dose in its grid cell.
  React.useEffect(() => {
    if (!onComputed) return;
    onComputed(info && perDay ? { weekIndex: info.weekIndex, preWeeks: info.preWeeks, row: info.row, perDay } : null);
  }, [info, perDay, onComputed]);

  if (!loaded || !info) return null;
  const { row, ramp, weekIndex, preWeeks, anchor } = info;

  const kpiKeys = Object.keys(row.byKpi) as WeeklyLoadMetricKey[];
  const anchorLabel = anchor === "match_this_season" ? (is ? "leikir í ár" : "this season's matches") : anchor === "srpe_only" ? (is ? "sRPE eingöngu" : "sRPE only") : (is ? "stöðu-viðmið" : "positional norm");
  const conf = row.confidence === "high" ? { c: "rgba(28,122,74,0.12)", t: "#1c7a4a", l: is ? "há vissa" : "high confidence" } : row.confidence === "moderate" ? { c: "rgba(222,147,40,0.14)", t: "#9a6a14", l: is ? "miðlungs vissa" : "moderate confidence" } : { c: "rgba(168,62,40,0.12)", t: "#a83e28", l: is ? "lítil vissa" : "low confidence" };

  return (
    <div className="mt-5 rounded-[14px] border bg-white p-4 md:px-[18px]" style={{ borderColor: "rgba(122,92,196,0.4)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "#7a5cc4" }}>{is ? "Undirbúningur — byrjunar-álag þessarar viku" : "Pre-season — this week's starting load"}</span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "#7a5cc4", color: "#fff" }}>{is ? `Vika ${weekIndex}` : `Week ${weekIndex}`} / {preWeeks}</span>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: conf.c, color: conf.t }}>{conf.l}</span>
        <span className="rounded-full bg-[#f4f2ec] px-2 py-0.5 text-[10px] font-medium text-[#6b6f76]">{is ? "grunnur" : "anchor"}: {anchorLabel}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[16px] font-bold text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{row.multipleOfMatch}× {is ? "leik" : "match"}</span>
        {row.weeklyLoadTarget != null ? <span className="text-[13px] text-[#14181c]">{is ? "vika" : "week"} ≈ {row.weeklyLoadTarget} PL</span> : <span className="text-[12px] text-[#9a9689]">{is ? "ekkert GPS-leikvið" : "no GPS match unit"}</span>}
        {row.perSessionLoad != null && <span className="text-[12px] text-[#6b6f76]">≈ {row.perSessionLoad}/{is ? "æfingu" : "session"} × {row.sessionCount}</span>}
        {row.sRpeAuTarget != null && <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(122,92,196,0.1)", color: "#7a5cc4" }}>sRPE ≈ {row.sRpeAuTarget} AU</span>}
      </div>

      {kpiKeys.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {kpiKeys.map((k) => { const lbl = WEEKLY_LOAD_LABELS[k]; return (
            <span key={k} className="rounded border border-[#e3e0d5] px-1.5 py-0.5 text-[10px] text-[#6b6f76]">{is ? lbl.is : lbl.en} <span className="font-semibold tabular-nums text-[#14181c]">{row.byKpi[k]}{lbl.unit}</span></span>
          ); })}
        </div>
      )}

      <p className="mt-2 text-[11.5px] leading-relaxed text-[#6b6f76]">{is ? row.note.is : row.note.en} {weekIndex === 1 && (is ? "Byggðu vikuplanið á þessu — dagsskammtar birtast í reitunum að ofan." : "Base the week plan on this — day doses show in the cells above.")}</p>

      {/* ramp strip — where this week sits on the ramp */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {ramp.map((r) => (
          <span key={r.weekIndex} title={`${is ? "vika" : "week"} ${r.weekIndex}: ${r.multipleOfMatch}×`}
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
            style={r.weekIndex === weekIndex ? { background: "#7a5cc4", color: "#fff" } : { background: "#f4f2ec", color: "#9a9689" }}>
            {r.multipleOfMatch}×
          </span>
        ))}
      </div>

      {perDay && perDay.some((d) => d.training) && (
        <p className="mt-2 text-[10px] text-[#9a9689]">{is ? "Dagsskammtar birtast í reitunum að ofan — summa daganna = vikumarkið; hraða-dagar draga sprett-böndin, kraft-dagar hröðun/hemlun." : "Day doses show in the cells above — the days sum to the weekly target; velocity days pull the sprint bands, force days accel/decel."}</p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <Link href="/coach/periodization-hub?tab=players" className="text-[12px] font-semibold hover:underline" style={{ color: "#2740e6" }}>
          {is ? "Per-leikmaður + breyta →" : "Per-player + edit →"}
        </Link>
        <span className="text-[9px] text-[#9a9689]">{is ? "Lýsandi — breytir aldrei readiness-litnum" : "Descriptive — never the readiness colour"}</span>
      </div>
    </div>
  );
}
