"use client";

/**
 * Pre-season week's starting-load target, in Week setup. Ties the day plan the coach is building to
 * the controlled re-entry / ramp: it works out WHICH pre-season week this is (from weekStart vs the
 * pre-season phase start) and shows that week's team target — ×match multiple, weekly + per-session
 * load, sRPE/AU, and the main KPIs — from the same `preseasonStartRamp` engine the hub uses. Per-player
 * detail + editing live in the hub (linked). Descriptive; never the readiness colour.
 */

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { preseasonStartRamp, type LoadAnchor } from "@/lib/micropulse/periodization/preseasonStart";
import { distributeWeekKpis } from "@/lib/micropulse/periodization/preseasonWeekPlan";
import { WEEKLY_LOAD_LABELS, type WeeklyLoadMetricKey } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";

const DOW_ABBR: { is: string; en: string }[] = [
  { is: "Mán", en: "Mon" }, { is: "Þri", en: "Tue" }, { is: "Mið", en: "Wed" },
  { is: "Fim", en: "Thu" }, { is: "Fös", en: "Fri" }, { is: "Lau", en: "Sat" }, { is: "Sun", en: "Sun" },
];

type Metric = { typical: number | null; peak: number | null };
type MatchUnit = { load: Metric; hsr: Metric; sprint: Metric; distance: Metric; accel: Metric; decel: Metric };
type Player = { playerId: string; name: string; matchUnit: MatchUnit };
type Phase = { key: string; start: string; end: string; weeks: number };
type Plan = { phases: Phase[]; matchLoad: number | null; matchSrpe: number | null; tier: { loadSource: "gps" | "srpe" | "none" }; players: Player[] };

const kpiAvgFromUnit = (mu: MatchUnit): Partial<Record<WeeklyLoadMetricKey, number>> => {
  const o: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  if (mu.load.typical != null) o.totalPlayerLoad = mu.load.typical;
  if (mu.distance.typical != null) o.totalDistance = mu.distance.typical;
  if (mu.sprint.typical != null) o.velocityBand6 = mu.sprint.typical;
  if (mu.hsr.typical != null && mu.sprint.typical != null && mu.hsr.typical > mu.sprint.typical) o.velocityBand5 = Math.round(mu.hsr.typical - mu.sprint.typical);
  if (mu.accel.typical != null) o.accelB23 = mu.accel.typical;
  if (mu.decel.typical != null) o.decelB23 = mu.decel.typical;
  return o;
};
const teamKpiAvg = (players: Player[]): Partial<Record<WeeklyLoadMetricKey, number>> => {
  const sums: Partial<Record<WeeklyLoadMetricKey, { s: number; n: number }>> = {};
  for (const p of players) { const k = kpiAvgFromUnit(p.matchUnit); for (const key of Object.keys(k) as WeeklyLoadMetricKey[]) { const v = k[key]; if (v == null) continue; const a = sums[key] ?? { s: 0, n: 0 }; a.s += v; a.n += 1; sums[key] = a; } }
  const o: Partial<Record<WeeklyLoadMetricKey, number>> = {};
  for (const key of Object.keys(sums) as WeeklyLoadMetricKey[]) { const a = sums[key]!; o[key] = Math.round(a.s / a.n); }
  return o;
};

export default function PreseasonStartWeekCard({ teamId, weekStart, intents }: { teamId: string; weekStart: string; intents?: string[] }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
        if (!tok) { if (alive) setLoaded(true); return; }
        const res = await fetch(`/api/coach/periodization`, { headers: { Authorization: `Bearer ${tok}` } });
        const j = await res.json().catch(() => null);
        if (alive) { setPlan(res.ok && j?.ok ? (j.plan as Plan) : null); setLoaded(true); }
      } catch { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [teamId]);

  if (!loaded || !plan) return null;

  const pre = plan.phases.find((p) => p.key === "preseason");
  const preWeeks = Math.max(1, pre?.weeks ?? 6);
  // Which pre-season week is the week being edited? (0-based offset from the phase start, clamped.)
  let weekIndex = 1;
  if (pre?.start) {
    const off = Math.floor((Date.parse(`${weekStart}T00:00:00Z`) - Date.parse(`${pre.start}T00:00:00Z`)) / (7 * 86_400_000));
    weekIndex = Math.min(preWeeks, Math.max(1, off + 1));
  }

  const anchor: LoadAnchor = plan.matchLoad != null ? "match_this_season" : plan.tier.loadSource === "srpe" ? "srpe_only" : "normative";
  const ramp = preseasonStartRamp({ matchTypicalLoad: plan.matchLoad, matchKpiAvg: teamKpiAvg(plan.players), matchSrpeAu: plan.matchSrpe, sessionsPerWeek: 4, preseasonWeeks: preWeeks, anchor });
  const row = ramp[weekIndex - 1];
  if (!row) return null;

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

      <p className="mt-2 text-[11.5px] leading-relaxed text-[#6b6f76]">{is ? row.note.is : row.note.en} {weekIndex === 1 && (is ? "Byggðu vikuplanið hér að neðan á þessu." : "Base the week plan below on this.")}</p>

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

      {/* Per-day breakdown — the weekly target spread across the day plan by each day's intent. */}
      {intents && intents.length > 0 && (() => {
        const perDay = distributeWeekKpis({ intents, weeklyLoad: row.weeklyLoadTarget, weeklySrpe: row.sRpeAuTarget, weeklyKpi: row.byKpi });
        const training = perDay.filter((d) => d.training);
        if (training.length === 0) return null;
        // Show the two KPIs each day loads most (its emphasis), so the plan reads at a glance.
        const topKpis = (byKpi: Partial<Record<WeeklyLoadMetricKey, number>>): WeeklyLoadMetricKey[] => {
          const weekKeys = Object.keys(row.byKpi) as WeeklyLoadMetricKey[];
          return (Object.keys(byKpi) as WeeklyLoadMetricKey[])
            .filter((k) => weekKeys.includes(k))
            .sort((a, b) => (row.byKpi[b] ? (byKpi[b] ?? 0) / row.byKpi[b]! : 0) - (row.byKpi[a] ? (byKpi[a] ?? 0) / row.byKpi[a]! : 0))
            .slice(0, 2);
        };
        return (
          <div className="mt-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#7a5cc4]">{is ? "Skipt á dagana (eftir áherslu dagsins)" : "Split across the days (by each day's intent)"}</div>
            <div className="mt-1.5 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead><tr className="text-left text-[9px] uppercase tracking-wide text-[#9a9689]"><th className="py-0.5 pr-2 font-medium">{is ? "Dagur" : "Day"}</th><th className="py-0.5 pr-2 font-medium">{is ? "Áhersla" : "Intent"}</th><th className="py-0.5 pr-2 text-right font-medium">PL</th><th className="py-0.5 pr-2 text-right font-medium">sRPE</th><th className="py-0.5 font-medium">{is ? "Mest álag" : "Loads most"}</th></tr></thead>
                <tbody>
                  {training.map((d) => {
                    const top = topKpis(d.byKpi);
                    return (
                      <tr key={d.dayIndex} className="border-t border-[#eee9dc]">
                        <td className="py-0.5 pr-2 text-[#14181c]">{is ? DOW_ABBR[d.dayIndex]?.is : DOW_ABBR[d.dayIndex]?.en}</td>
                        <td className="py-0.5 pr-2 text-[#6b6f76]">{d.intent.replace(/_/g, " ").toLowerCase()}</td>
                        <td className="py-0.5 pr-2 text-right tabular-nums text-[#14181c]">{d.loadTarget ?? "–"}</td>
                        <td className="py-0.5 pr-2 text-right tabular-nums text-[#6b6f76]">{d.srpeTarget ?? "–"}</td>
                        <td className="py-0.5">
                          <span className="flex flex-wrap gap-1">
                            {top.map((k) => <span key={k} className="rounded border border-[#e3e0d5] px-1 py-0.5 text-[9px] text-[#6b6f76]">{is ? WEEKLY_LOAD_LABELS[k].is : WEEKLY_LOAD_LABELS[k].en} <span className="font-semibold tabular-nums text-[#14181c]">{d.byKpi[k]}{WEEKLY_LOAD_LABELS[k].unit}</span></span>)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[9px] text-[#9a9689]">{is ? "Summa daganna = vikumarkið. Hraða-dagar draga sprett-böndin, kraft-dagar hröðun/hemlun. Þú breytir áherslu dagsins að ofan." : "The days sum to the weekly target. Velocity days pull the sprint bands, force days accel/decel. Change a day's intent above."}</p>
          </div>
        );
      })()}

      <div className="mt-2 flex items-center justify-between gap-2">
        <Link href="/coach/periodization-hub?tab=players" className="text-[12px] font-semibold hover:underline" style={{ color: "#2740e6" }}>
          {is ? "Per-leikmaður + breyta →" : "Per-player + edit →"}
        </Link>
        <span className="text-[9px] text-[#9a9689]">{is ? "Lýsandi — breytir aldrei readiness-litnum" : "Descriptive — never the readiness colour"}</span>
      </div>
    </div>
  );
}
