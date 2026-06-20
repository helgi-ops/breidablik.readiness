"use client";

export const dynamic = "force-dynamic";

/**
 * Train like you Play — preparedness board. For each player, the best training
 * exposure to each match demand vs that player's own match demand, so the coach
 * sees who isn't trained for what matches require (Gabbett 2016; Malone 2018).
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { POSITION_GROUPS } from "@/lib/micropulse/positionStyle";

type MetricKey =
  | "top_speed" | "fmp_run_high" | "fmp_dyn_high" | "fmp_dyn_med"
  | "ima_accel" | "ima_decel" | "ima_cod" | "ima_jumps";
type Mode = "fmp" | "ima";
type Baseline = "own" | "position";
type Flag = "under" | "gap" | "ok" | "none";
type Cell = { match: number | null; train: number | null; pct: number | null; flag: Flag };
type Player = { id: string; name: string; position: string | null; group: string; match_appearances: number; train_sessions: number; metrics: Record<MetricKey, Cell>; gaps: number };
type Micro = { md_day: string; sessions: number; metrics: Record<MetricKey, number | null> };
type Resp = { season: number; metrics: Array<{ key: MetricKey; kind: string }>; modes: Record<Mode, MetricKey[]>; players: Player[]; microcycle?: Micro[]; groupDemand: Record<string, Record<MetricKey, number | null>> };

const FLAG: Record<string, string> = {
  under: "bg-red-100 text-red-700", gap: "bg-amber-100 text-amber-700", ok: "bg-emerald-100 text-emerald-700", none: "bg-slate-100 text-slate-400",
};
function flagOf(kind: string | undefined, pct: number | null): Flag {
  if (pct == null) return "none";
  if (kind === "max") return pct < 70 ? "under" : pct < 85 ? "gap" : "ok";
  return pct < 50 ? "under" : pct < 80 ? "gap" : "ok";
}

export default function TrainLikeYouPlayPage() {
  const [lang] = useLang();
  const IS = lang === "IS";
  const thisYear = new Date().getFullYear();
  const [season, setSeason] = useState(thisYear);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const token = useCallback(async () => {
    const sb = getSupabaseClient();
    const { data: { session } } = await sb.auth.getSession();
    return session?.access_token ?? "";
  }, []);

  const load = useCallback(async (yr: number) => {
    setLoading(true); setErr(null);
    try {
      const t = await token();
      if (!t) { setErr(IS ? "Ekki innskráð(ur)" : "Not signed in"); return; }
      const res = await fetch(`/api/coach/train-like-you-play?season=${yr}`, { headers: { Authorization: `Bearer ${t}` } });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "Failed"); setData(null); return; }
      setData(json as Resp);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, [token, IS]);
  useEffect(() => { void load(season); }, [load, season]);

  const META: Record<MetricKey, { en: string; is: string }> = {
    top_speed: { en: "Top speed", is: "Hámarkshraði" },
    fmp_run_high: { en: "Running High", is: "Hlaup há" },
    fmp_dyn_high: { en: "Dynamic High", is: "Dýnamísk há" },
    fmp_dyn_med: { en: "Dynamic Med", is: "Dýnamísk miðl." },
    ima_accel: { en: "IMA Accel", is: "IMA hröðun" },
    ima_decel: { en: "IMA Decel", is: "IMA hemlun" },
    ima_cod: { en: "IMA CoD", is: "IMA stefnubr." },
    ima_jumps: { en: "IMA Jumps", is: "IMA stökk" },
  };
  const [mode, setMode] = useState<Mode>("fmp");
  const [baseline, setBaseline] = useState<Baseline>("own");
  const metricKeys = useMemo<MetricKey[]>(() => data?.modes?.[mode] ?? [], [data, mode]);
  const microcycle = useMemo(() => data?.microcycle ?? [], [data]);
  // Demand baseline = each player's OWN match demand, or his POSITION group's
  // average match demand (position-specific standard). Gaps are mode-specific.
  const players = useMemo(() => {
    const gd = data?.groupDemand ?? {};
    const kindMap = new Map((data?.metrics ?? []).map((m) => [m.key, m.kind]));
    const ps = (data?.players ?? []).map((p) => {
      const display = {} as Record<MetricKey, { train: number | null; demand: number | null; pct: number | null; flag: Flag }>;
      for (const k of (data?.metrics ?? []).map((m) => m.key)) {
        const cell = p.metrics[k];
        const demand = baseline === "own" ? (cell?.match ?? null) : (gd[p.group]?.[k] ?? null);
        const pct = cell?.train != null && demand != null && demand > 0 ? Math.round((cell.train / demand) * 100) : null;
        display[k] = { train: cell?.train ?? null, demand, pct, flag: flagOf(kindMap.get(k), pct) };
      }
      const modeGaps = metricKeys.filter((k) => display[k].flag === "under").length;
      return { ...p, display, modeGaps };
    });
    return ps.sort((a, b) => b.modeGaps - a.modeGaps || a.name.localeCompare(b.name, "is"));
  }, [data, metricKeys, baseline]);
  // Group players by position for rendering (ties to Position Comparison).
  const grouped = useMemo(() => POSITION_GROUPS
    .map((g) => ({ ...g, members: players.filter((p) => p.group === g.key) }))
    .filter((g) => g.members.length > 0), [players]);
  const totalGaps = useMemo(() => players.reduce((s, p) => s + p.modeGaps, 0), [players]);
  const playersWithGaps = useMemo(() => players.filter((p) => p.modeGaps > 0).length, [players]);
  const [microMetric, setMicroMetric] = useState<MetricKey>("fmp_dyn_high");
  const microKey: MetricKey | undefined = metricKeys.includes(microMetric) ? microMetric : metricKeys[1] ?? metricKeys[0];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <style>{`@media print {@page{size:A4 landscape;margin:11mm} body *{visibility:hidden} #tlp,#tlp *{visibility:visible} #tlp{position:absolute;left:0;top:0;width:100%} .tlp-noprint{display:none!important} .tlp-sec{break-inside:avoid}}`}</style>

      <div className="tlp-noprint mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-base font-bold text-slate-900">{IS ? "Train like you Play" : "Train like you Play"}</div>
            <div className="text-xs text-slate-500">{IS ? "Besta þjálfunar-exposure vs leik-krafa (IMU — virkar innandyra). Grunnur: FMP (Catapult hreyfi-flokkar) eða hrá IMA (atburðir: hröðun, hemlun, stefnubreytingar, stökk)." : "Best training exposure vs match demand (IMU — works indoors). Basis: FMP (Catapult movement zones) or raw IMA (events: accelerations, decelerations, change-of-direction, jumps)."}</div>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-slate-500">{IS ? "Grunnur" : "Basis"}</label>
              <div className="mt-0.5 flex rounded-md border border-slate-300 p-0.5 text-xs">
                <button type="button" onClick={() => setMode("fmp")} className={`rounded px-2 py-1 ${mode === "fmp" ? "bg-slate-900 text-white" : "text-slate-600"}`}>FMP</button>
                <button type="button" onClick={() => setMode("ima")} className={`rounded px-2 py-1 ${mode === "ima" ? "bg-slate-900 text-white" : "text-slate-600"}`}>IMA</button>
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-slate-500">{IS ? "Borið við" : "Compared to"}</label>
              <div className="mt-0.5 flex rounded-md border border-slate-300 p-0.5 text-xs">
                <button type="button" onClick={() => setBaseline("own")} className={`rounded px-2 py-1 ${baseline === "own" ? "bg-slate-900 text-white" : "text-slate-600"}`}>{IS ? "Eigin leik" : "Own match"}</button>
                <button type="button" onClick={() => setBaseline("position")} className={`rounded px-2 py-1 ${baseline === "position" ? "bg-slate-900 text-white" : "text-slate-600"}`}>{IS ? "Stöðu-norm" : "Position"}</button>
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-slate-500">{IS ? "Tímabil" : "Season"}</label>
              <select value={season} onChange={(e) => setSeason(Number(e.target.value))} className="mt-0.5 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => window.print()} disabled={!data || players.length === 0}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">🖨 PDF</button>
          </div>
        </div>
      </div>

      {err && <div className="tlp-noprint mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {loading && <div className="tlp-noprint mb-4 text-sm text-slate-500">…</div>}

      {data && players.length > 0 && (
        <div id="tlp" className="space-y-4">
          <div className="tlp-sec flex items-end justify-between border-b border-slate-200 pb-3">
            <div>
              <div className="text-lg font-bold text-slate-900">{IS ? "Þjálfa eins og þú spilar" : "Train like you play"}</div>
              <div className="text-xs text-slate-500">{IS ? "Tölur = besta þjálfun sem % af leik-kröfu" : "Numbers = best training as % of match demand"} · {season}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums text-slate-900">{playersWithGaps}<span className="text-sm font-normal text-slate-400">/{players.length}</span></div>
              <div className="text-[11px] text-slate-500">{IS ? "með exposure-gap" : "with an exposure gap"}{totalGaps > 0 ? ` · ${totalGaps} ${IS ? "alls" : "total"}` : ""}</div>
            </div>
          </div>

          {/* Microcycle — avg training intensity as % of match demand per MD-day */}
          {microcycle.length > 0 && (
            <div className="tlp-sec rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{IS ? "Vikuskipulag eftir MD-degi" : "Weekly periodization by MD-day"}</div>
                <select value={microKey} onChange={(e) => setMicroMetric(e.target.value as MetricKey)} className="tlp-noprint rounded-md border border-slate-300 px-2 py-1 text-xs">
                  {metricKeys.map((m) => <option key={m} value={m}>{IS ? META[m].is : META[m].en}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                {microcycle.map((d) => {
                  const pct = microKey ? d.metrics[microKey] : null;
                  const w = pct == null ? 0 : Math.min(pct, 150) / 150 * 100;
                  const tone = pct == null ? "bg-slate-200" : pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-sky-500" : "bg-slate-300";
                  return (
                    <div key={d.md_day} className="flex items-center gap-2">
                      <div className="w-12 shrink-0 text-[11px] font-semibold tabular-nums text-slate-600">{d.md_day}</div>
                      <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
                        {/* 100% = full match intensity reference */}
                        <div className="absolute top-0 bottom-0 w-px bg-slate-400" style={{ left: `${100 / 150 * 100}%` }} title={IS ? "100% = leik-ákefð" : "100% = match intensity"} />
                        <div className={`h-full ${tone}`} style={{ width: `${w}%` }} />
                      </div>
                      <div className="w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-700">{pct == null ? "—" : `${pct}%`}</div>
                      <div className="w-12 shrink-0 text-right text-[10px] text-slate-400">{d.sessions}{IS ? " æf" : " s"}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-[10px] text-slate-400">{IS ? "Meðal-þjálfunarákefð sem % af leik-kröfu þann MD-dag · grá lína = 100% (leik-ákefð) · MD-1 lágt = taper (rétt), mið-vika hátt = þróun (Martin-García 2018)." : "Average training intensity as % of match demand on that MD-day · grey line = 100% (match) · MD-1 low = taper (intended), mid-week high = development (Martin-García 2018)."}</div>
            </div>
          )}

          <div className="tlp-sec rounded-xl border border-slate-200 bg-white p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="px-2 py-1.5 text-left font-medium">{IS ? "Leikmaður" : "Player"}</th>
                    {metricKeys.map((m) => <th key={m} className="px-2 py-1.5 text-center font-medium">{IS ? META[m].is : META[m].en}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((g) => (
                    <Fragment key={g.key}>
                      <tr className="border-t border-slate-200 bg-slate-50">
                        <td colSpan={metricKeys.length + 1} className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {IS ? g.is : g.en} <span className="font-normal text-slate-400">({g.members.length})</span>
                        </td>
                      </tr>
                      {g.members.map((p) => (
                        <tr key={p.id} className={`border-t border-slate-100 ${p.modeGaps > 0 ? "bg-red-50/30" : ""}`}>
                          <td className="px-2 py-1.5">
                            <span className="font-medium text-slate-800">{p.name}</span>
                            <span className="ml-1 text-[10px] text-slate-400">{p.position}</span>
                          </td>
                          {metricKeys.map((m) => {
                            const c = p.display[m];
                            return (
                              <td key={m} className="px-2 py-1.5 text-center">
                                <span className={`inline-block min-w-[42px] rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${FLAG[c?.flag ?? "none"]}`}
                                  title={c?.pct != null ? `${IS ? "þjálfun" : "train"} ${c.train} · ${baseline === "own" ? (IS ? "leikur" : "match") : (IS ? "stöðu-krafa" : "position demand")} ${c.demand}` : (IS ? "engin gögn" : "no data")}>
                                  {c?.pct != null ? `${c.pct}%` : "—"}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-400" />{IS ? "undir-þjálfaður (<50% / hraði <70%)" : "under-trained (<50% / speed <70%)"}</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />{IS ? "gap (50–80% / hraði 70–85%)" : "gap (50–80% / speed 70–85%)"}</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400" />{IS ? "vel þjálfaður" : "well trained"}</span>
            </div>
          </div>

          <div className="tlp-sec rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 text-[12px] leading-relaxed text-slate-700">
            {IS
              ? "Byggt á Catapult Football Movement Profile (IMU) — fangar dýnamíska, fjölátta hreyfingu (ekki bara beinan GPS-hraða) og virkar innandyra. Þjálfun á að undirbúa fyrir leik-hreyfimynstrið (Gabbett 2016); undir ~50% af leik-kröfu í háákefðar-flokkunum = aukin áhætta (Malone 2018, Duhig 2016). FMP gefur sína eigin session-lengd, svo per-90 ákefð er reiknanleg þótt GPS-lengd vanti."
              : "Built on the Catapult Football Movement Profile (IMU) — it captures dynamic, multi-directional movement (not just straight-line GPS speed) and works indoors. Training should prepare for the match movement profile (Gabbett 2016); below ~50% of match demand in the high-intensity categories = elevated risk (Malone 2018, Duhig 2016). FMP carries its own session duration, so per-90 intensity is computable even when GPS duration is missing."}
          </div>
          <div className="text-[9px] text-slate-400">
            MicroPulse · {IS ? `FMP/IMA per-90 · topp-3 æfingar vs ${baseline === "own" ? "eigin leik-kröfu" : "stöðu-kröfu (stöðu-meðaltal)"} · hópað eftir stöðu` : `FMP/IMA per-90 · top-3 training vs ${baseline === "own" ? "own match demand" : "position demand (group average)"} · grouped by position`} · Catapult FMP · Gabbett 2016 · Malone 2018 · Duhig 2016
          </div>
        </div>
      )}
      {data && players.length === 0 && !loading && (
        <div className="tlp-noprint rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">{IS ? "Engin gögn." : "No data."}</div>
      )}
    </div>
  );
}
