"use client";

export const dynamic = "force-dynamic";

/**
 * Position comparison — match movement (GPS + IMA, per-90) compared across
 * position groups, each tagged with a rule-based playing-style archetype, with
 * per-player drill-down and an optional AI squad-style overview.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { ProfileRadar, MatchTrendBars, type RadarMetric } from "@/components/coach/PlayerGameReportCharts";

type MetricKey = "distance" | "hsr" | "sprint" | "top_speed" | "accel" | "decel" | "cod" | "jumps";
type Tag = { key: string; en: string; is: string };
type Style = { primary: Tag; secondary: Tag | null; drivers: Array<{ metric: MetricKey; z: number; en: string; is: string }> };
type Member = {
  id: string; name: string; position: string | null; appearances: number;
  profile: Record<MetricKey, number>; style: Style; standout: boolean;
};
type Group = {
  key: string; label_en: string; label_is: string; players: number; appearances: number;
  profile: Record<MetricKey, number>; percentile: Record<MetricKey, number>; style: Style; members: Member[];
};
type Resp = { season: number; squadAvg: Record<MetricKey, number>; groups: Group[]; metrics: MetricKey[] };

const n0 = (v: number) => Math.round(v).toLocaleString();
const f1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString();

export default function PositionComparisonPage() {
  const [lang] = useLang();
  const IS = lang === "IS";
  const thisYear = new Date().getFullYear();
  const [season, setSeason] = useState(thisYear);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [metric, setMetric] = useState<MetricKey>("sprint");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

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
      const res = await fetch(`/api/coach/position-comparison?season=${yr}`, { headers: { Authorization: `Bearer ${t}` } });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "Failed"); setData(null); return; }
      setData(json as Resp); setNarrative(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, [token, IS]);
  useEffect(() => { void load(season); }, [load, season]);

  const META: Record<MetricKey, { en: string; is: string; unit: string; fmt: (v: number) => string }> = {
    distance: { en: "Distance", is: "Vegalengd", unit: "m", fmt: n0 },
    hsr: { en: "High-speed running", is: "Háhraðahlaup", unit: "m", fmt: n0 },
    sprint: { en: "Sprint distance", is: "Sprettir", unit: "m", fmt: n0 },
    top_speed: { en: "Top speed", is: "Hámarkshraði", unit: "km/h", fmt: f1 },
    accel: { en: "Accelerations", is: "Hröðun", unit: "", fmt: f1 },
    decel: { en: "Decelerations", is: "Hraðaminnkun", unit: "", fmt: f1 },
    cod: { en: "Change of direction", is: "Stefnubreytingar", unit: "", fmt: f1 },
    jumps: { en: "Jumps", is: "Stökk", unit: "", fmt: f1 },
  };
  const radarKeys: MetricKey[] = ["distance", "hsr", "sprint", "top_speed", "accel", "decel", "cod"];
  const groups = useMemo(() => data?.groups ?? [], [data]);

  const compareBars = useMemo(() => {
    if (!data) return null;
    const m = metric;
    const bars = groups.map((g) => ({ label: IS ? shortGroup(g.key) : g.key, value: g.profile[m] }));
    return { bars, avg: data.squadAvg[m], unit: META[m].unit };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, groups, metric, IS]);

  async function generateNarrative() {
    if (!data) return;
    setAiBusy(true);
    try {
      const t = await token();
      const res = await fetch(`/api/coach/position-comparison/narrative`, {
        method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ lang, groups: data.groups, squadAvg: data.squadAvg }),
      });
      const json = await res.json();
      if (res.ok) setNarrative(json.narrative); else setErr(json.error ?? "AI failed");
    } catch (e) { setErr(e instanceof Error ? e.message : "AI error"); }
    finally { setAiBusy(false); }
  }

  const tagLabel = (t: Tag) => (IS ? t.is : t.en);
  const styleChips = (s: Style, big?: boolean) => (
    <div className="flex flex-wrap items-center gap-1">
      <span className={`rounded ${big ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[10px]"} font-semibold ${chipTone(s.primary.key)}`}>{tagLabel(s.primary)}</span>
      {s.secondary && <span className={`rounded ${big ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-0.5 text-[10px]"} font-medium ${chipTone(s.secondary.key)} opacity-80`}>+ {tagLabel(s.secondary)}</span>}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <style>{`@media print {@page{size:A4 portrait;margin:12mm} body *{visibility:hidden} #pc-report,#pc-report *{visibility:visible} #pc-report{position:absolute;left:0;top:0;width:100%} .pc-noprint{display:none!important} .pc-section{break-inside:avoid}}`}</style>

      <div className="pc-noprint mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-base font-bold text-slate-900">{IS ? "Stöðu-samanburður" : "Position comparison"}</div>
            <div className="text-xs text-slate-500">{IS ? "Hreyfimynstur (GPS + IMA, per-90) eftir leikstöðu — með leikstíl." : "Match movement (GPS + IMA, per-90) by position — with playing style."}</div>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-slate-500">{IS ? "Tímabil" : "Season"}</label>
              <select value={season} onChange={(e) => setSeason(Number(e.target.value))} className="mt-0.5 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => window.print()} disabled={!data || groups.length === 0}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">🖨 {IS ? "PDF" : "PDF"}</button>
          </div>
        </div>
      </div>

      {err && <div className="pc-noprint mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {loading && <div className="pc-noprint mb-4 text-sm text-slate-500">…</div>}

      {data && groups.length > 0 && (
        <div id="pc-report" className="space-y-5">
          {/* AI overview */}
          <div className="pc-section rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold text-white">AI</span>
                {IS ? "Leikstíls-yfirlit liðsins" : "Squad style overview"}
              </div>
              {!narrative && <button type="button" onClick={generateNarrative} disabled={aiBusy} className="pc-noprint rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50">{aiBusy ? (IS ? "Skrifa…" : "Writing…") : (IS ? "Búa til" : "Generate")}</button>}
            </div>
            {narrative
              ? <><p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-700">{narrative}</p><div className="mt-1.5 text-[9px] text-indigo-400">{IS ? "AI-mynduð úr reglu-greiningunni" : "AI-generated from the rule-based analysis"}</div></>
              : <p className="pc-noprint text-[11px] text-slate-500">{IS ? "Reglur ákveða stílinn; AI útskýrir." : "Rules decide the style; AI explains it."}</p>}
          </div>

          {/* Comparison bars */}
          {compareBars && (
            <div className="pc-section rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{IS ? "Samanburður eftir stöðu" : "Comparison by position"}</div>
                <select value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)} className="pc-noprint rounded-md border border-slate-300 px-2 py-1 text-xs">
                  {(data.metrics).map((m) => <option key={m} value={m}>{IS ? META[m].is : META[m].en}{META[m].unit ? ` (${META[m].unit})` : ""} /90</option>)}
                </select>
              </div>
              <div className="mx-auto max-w-md">
                <MatchTrendBars title={`${IS ? META[metric].is : META[metric].en}${metric === "top_speed" ? "" : " /90"}${META[metric].unit ? ` (${META[metric].unit})` : ""}`} unit={META[metric].unit} bars={compareBars.bars} avg={compareBars.avg} />
              </div>
              <div className="mt-1 text-center text-[10px] text-slate-400">{IS ? "Strikalína = liðsmeðaltal" : "Dashed line = squad average"}</div>
            </div>
          )}

          {/* Position cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {groups.map((g) => {
              const radar: RadarMetric[] = radarKeys.map((m) => ({ label: IS ? shortMetric(m, true) : shortMetric(m, false), percentile: g.percentile[m], valueLabel: META[m].fmt(g.profile[m]) }));
              const isOpen = expanded === g.key;
              return (
                <div key={g.key} className="pc-section rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-slate-900">{IS ? g.label_is : g.label_en}</div>
                      <div className="text-[11px] text-slate-500">{g.players} {IS ? "leikmenn" : "players"} · {g.appearances} {IS ? "leikir" : "matches"}</div>
                    </div>
                    {styleChips(g.style, true)}
                  </div>
                  {g.style.drivers.length > 0 && (
                    <div className="mb-1 text-[10px] text-slate-500">
                      {IS ? "Drifið af: " : "Driven by: "}{g.style.drivers.map((d) => IS ? d.is : d.en).join(", ")}
                    </div>
                  )}
                  <ProfileRadar metrics={radar} />
                  <button type="button" onClick={() => setExpanded(isOpen ? null : g.key)} className="pc-noprint mt-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-700">
                    {isOpen ? (IS ? "Fela leikmenn ▲" : "Hide players ▲") : (IS ? `Sýna leikmenn (${g.members.length}) ▼` : `Show players (${g.members.length}) ▼`)}
                  </button>
                  {isOpen && (
                    <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                      {g.members.map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-2 text-[11px]">
                          <div className="min-w-0">
                            <span className="font-medium text-slate-800">{m.name}</span>
                            {m.standout && <span className="ml-1 text-amber-500" title={IS ? "Sker sig úr" : "Stands out"}>★</span>}
                            <span className="ml-1 text-slate-400">{m.position} · {m.appearances}{IS ? "l" : "m"}</span>
                          </div>
                          {styleChips(m.style)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-200 pt-2 text-[9px] text-slate-400">
            MicroPulse · {IS ? "Stíll ákvarðaður með reglum úr per-90 GPS/IMA (z-stig vs aðrar stöður). ★ = leikmaður sker sig úr." : "Style assigned by rules from per-90 GPS/IMA (z-score vs other positions). ★ = player stands out."}
          </div>
        </div>
      )}
      {data && groups.length === 0 && !loading && (
        <div className="pc-noprint rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">{IS ? "Engin leikgögn á tímabilinu." : "No match data this season."}</div>
      )}
    </div>
  );
}

function chipTone(key: string): string {
  switch (key) {
    case "speed": return "bg-sky-100 text-sky-700";
    case "agility": return "bg-violet-100 text-violet-700";
    case "volume": return "bg-emerald-100 text-emerald-700";
    case "aerial": return "bg-amber-100 text-amber-700";
    case "structural": return "bg-slate-200 text-slate-600";
    default: return "bg-slate-100 text-slate-600";
  }
}
function shortGroup(key: string): string { return key; }
function shortMetric(m: string, is: boolean): string {
  const map: Record<string, [string, string]> = {
    distance: ["Dist", "Vegal."], hsr: ["HSR", "HSR"], sprint: ["Sprint", "Sprettur"],
    top_speed: ["Speed", "Hraði"], accel: ["Acc", "Acc"], decel: ["Dec", "Dec"], cod: ["CoD", "CoD"], jumps: ["Jump", "Stökk"],
  };
  const e = map[m] ?? [m, m];
  return is ? e[1] : e[0];
}
