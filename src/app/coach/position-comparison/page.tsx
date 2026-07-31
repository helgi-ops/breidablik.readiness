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
import PagePurpose from "@/components/coach/PagePurpose";
import { ProfileRadar, MatchTrendBars, type RadarMetric } from "@/components/coach/PlayerGameReportCharts";
import VerdictBanner, { type VerdictTone, type VerdictDriver } from "@/components/coach/VerdictBanner";

type MetricKey = "distance" | "hsr" | "sprint" | "top_speed" | "accel" | "decel" | "cod" | "efforts" | "jumps" | "player_load" | "pl_per_min";
// Metrics that are NOT per-90 (a max or a rate) — used to suppress the "/90" suffix.
const NOT_PER90 = new Set<MetricKey>(["top_speed", "pl_per_min"]);
type Tag = { key: string; en: string; is: string };
type Style = { primary: Tag; secondary: Tag | null; drivers: Array<{ metric: MetricKey; z: number; en: string; is: string }>; axisScores: Record<string, number> };
type Member = {
  id: string; name: string; position: string | null; appearances: number;
  profile: Record<MetricKey, number>; style: Style; standout: boolean;
};
type Group = {
  key: string; label_en: string; label_is: string; players: number; appearances: number;
  profile: Record<MetricKey, number>; percentile: Record<MetricKey, number>; style: Style; members: Member[];
};
type Resp = { season: number; squadAvg: Record<MetricKey, number>; groups: Group[]; metrics: MetricKey[]; normMinutes?: number };

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
  const [eliteRequired, setEliteRequired] = useState(false);
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
    setLoading(true); setErr(null); setEliteRequired(false);
    try {
      const t = await token();
      if (!t) { setErr(IS ? "Ekki innskráð(ur)" : "Not signed in"); return; }
      const res = await fetch(`/api/coach/position-comparison?season=${yr}`, { headers: { Authorization: `Bearer ${t}` } });
      const json = await res.json();
      if (res.status === 402 || json?.error === "ELITE_REQUIRED") { setEliteRequired(true); setData(null); return; }
      if (!res.ok) { setErr(json.error ?? "Failed"); setData(null); return; }
      setData(json as Resp); setNarrative(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, [token, IS]);
  useEffect(() => { void load(season); }, [load, season]);

  // Keep the selected chart metric to one the club actually has data for. The
  // default is GPS "sprint"; an indoor (basketball) team has no GPS, so snap to
  // the first live metric (IMA) instead of showing an empty "0" chart.
  useEffect(() => {
    if (data?.metrics?.length && !data.metrics.includes(metric)) setMetric(data.metrics[0]);
  }, [data, metric]);

  // Per-match normalisation window: football 90-min match, basketball 40-min game.
  const normMin = data?.normMinutes ?? 90;
  const PER = `/${normMin}`;

  const META: Record<MetricKey, { en: string; is: string; unit: string; fmt: (v: number) => string }> = {
    distance: { en: "Distance", is: "Vegalengd", unit: "m", fmt: n0 },
    hsr: { en: "High-speed running", is: "Háhraðahlaup", unit: "m", fmt: n0 },
    sprint: { en: "Sprint distance", is: "Sprettir", unit: "m", fmt: n0 },
    top_speed: { en: "Top speed", is: "Hámarkshraði", unit: "km/h", fmt: f1 },
    accel: { en: "Accelerations", is: "Hröðun", unit: "", fmt: f1 },
    decel: { en: "Decelerations", is: "Hraðaminnkun", unit: "", fmt: f1 },
    cod: { en: "Change of direction", is: "Stefnubreytingar", unit: "", fmt: f1 },
    efforts: { en: "Hard efforts", is: "Ákafa-átök", unit: "", fmt: f1 },
    jumps: { en: "Jumps", is: "Stökk", unit: "", fmt: f1 },
    player_load: { en: "Player Load", is: "Player Load", unit: "AU", fmt: n0 },
    pl_per_min: { en: "Work rate", is: "Ákefð", unit: "AU/min", fmt: f1 },
  };
  // Capability-aware radar axes: keep only the movement metrics the club actually
  // has (data.metrics = the live set from the API). Pro keeps accel/decel/CoD;
  // Lite drops those (IMA-less) and shows hard efforts instead — never dead spokes.
  const radarKeys: MetricKey[] = (["distance", "hsr", "sprint", "top_speed", "accel", "decel", "cod", "efforts"] as MetricKey[])
    .filter((m) => (data?.metrics ?? []).includes(m));
  const groups = useMemo(() => data?.groups ?? [], [data]);

  const compareBars = useMemo(() => {
    if (!data) return null;
    const m = metric;
    const bars = groups.map((g) => ({ label: IS ? shortGroup(g.key) : g.key, value: g.profile[m] }));
    return { bars, avg: data.squadAvg[m], unit: META[m].unit };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, groups, metric, IS]);

  // Movement-DNA fingerprint per position: a softmax over the SAME four style-
  // axis scores the archetype is built from (style.axisScores), normalised to
  // 100% so it reads as one stacked bar per position (same visual as the
  // recovery curve). Using the archetype's own axes guarantees the largest
  // slice always matches the position's playing-style tag.
  const dna = useMemo(() => {
    return groups.map((g) => {
      const scores = STYLE_AXES.map((ax) => ({ ...ax, z: g.style.axisScores?.[ax.key] ?? 0 }));
      const exps = scores.map((s) => Math.exp(s.z));
      const sum = exps.reduce((a, b) => a + b, 0) || 1;
      return { key: g.key, shares: scores.map((s, i) => ({ ...s, pct: (exps[i] / sum) * 100 })) };
    });
  }, [groups]);

  // ── Verdict (rules, not AI): summarise the 1–2 biggest position contrasts ──
  // For every comparable metric we find the leading position and how far it sits
  // above the next-best (relative spread). The axes with the widest spread become
  // the headline; the lead positions become named drivers with the metric jargon
  // (CoD, HSR, Acc, Dec) + paper citations parked in each driver's tooltip.
  const verdict = useMemo(() => {
    if (!data || groups.length < 1) return null;

    // Plain-language phrasing per metric for the headline sentence (no jargon),
    // plus the jargon term + citation that lives only in the driver tooltip.
    const PHRASE: Partial<Record<MetricKey, { en: string; is: string; jargonEn: string; jargonIs: string; cite: string }>> = {
      sprint: { en: "cover the most sprint distance", is: "hlaupa flesta spretti", jargonEn: "Sprint distance (HSR/sprint, Malone 2017)", jargonIs: "Sprettir (HSR/sprettir, Malone 2017)", cite: "Malone 2017" },
      hsr: { en: "cover the most high-speed distance", is: "hlaupa mest á háhraða", jargonEn: "High-speed running (HSR, Buchheit 2014)", jargonIs: "Háhraðahlaup (HSR, Buchheit 2014)", cite: "Buchheit 2014" },
      decel: { en: "absorb the most braking load", is: "taka mesta hemlunarálagið", jargonEn: "Decelerations (Dec / braking, McBurnie 2022)", jargonIs: "Hraðaminnkun (Dec / hemlun, McBurnie 2022)", cite: "McBurnie 2022" },
      accel: { en: "do the most accelerating", is: "hraða sér oftast upp", jargonEn: "Accelerations (Acc, McBurnie 2022)", jargonIs: "Hröðun (Acc, McBurnie 2022)", cite: "McBurnie 2022" },
      cod: { en: "change direction the most", is: "breyta oftast um stefnu", jargonEn: "Change of direction (CoD, McBurnie 2022)", jargonIs: "Stefnubreytingar (CoD, McBurnie 2022)", cite: "McBurnie 2022" },
      efforts: { en: "rack up the most hard accel/decel efforts", is: "safna flestum ákafa-átökum (hröðun/hemlun)", jargonEn: "Accel & decel efforts (Gen2, McBurnie 2022)", jargonIs: "Hröðunar/hemlunar-átök (Gen2, McBurnie 2022)", cite: "McBurnie 2022" },
      player_load: { en: "carry the most Player Load", is: "bera mesta Player Load", jargonEn: "Player Load (total mechanical work)", jargonIs: "Player Load (heildar vélræn vinna)", cite: "" },
      pl_per_min: { en: "work at the highest intensity", is: "vinna á mestri ákefð", jargonEn: "Player Load per minute (work rate)", jargonIs: "Player Load á mínútu (ákefð)", cite: "" },
      top_speed: { en: "hit the highest top speed", is: "ná mestum hámarkshraða", jargonEn: "Top speed (km/h, Buchheit 2014)", jargonIs: "Hámarkshraði (km/klst, Buchheit 2014)", cite: "Buchheit 2014" },
      distance: { en: "cover the most total distance", is: "hlaupa lengstu heildarvegalengd", jargonEn: "Total distance (running volume)", jargonIs: "Heildarvegalengd (hlaupamagn)", cite: "" },
      jumps: { en: "jump the most", is: "stökkva oftast", jargonEn: "Jumps (IMA aerial events)", jargonIs: "Stökk (IMA loftatburðir)", cite: "" },
    };

    // Per metric: leading group, runner-up, and relative spread (lead vs next).
    type Axis = { metric: MetricKey; leadKey: string; leadVal: number; spread: number };
    const axes: Axis[] = data.metrics
      .map((m) => {
        const ranked = groups
          .map((g) => ({ key: g.key, v: g.profile[m] }))
          .filter((r) => Number.isFinite(r.v))
          .sort((a, b) => b.v - a.v);
        if (ranked.length < 2 || !PHRASE[m]) return null;
        const lead = ranked[0];
        const next = ranked[1];
        const spread = next.v > 0 ? (lead.v - next.v) / next.v : 0;
        return { metric: m, leadKey: lead.key, leadVal: lead.v, spread } as Axis;
      })
      .filter((a): a is Axis => a != null && a.spread > 0)
      .sort((a, b) => b.spread - a.spread);

    const tx = (en: string, is: string) => (IS ? is : en);

    // Confidence: how many positions, how many matches behind them.
    const totalMatches = groups.reduce((s, g) => s + g.appearances, 0);
    const thin = groups.length < 2 || totalMatches < 6;
    const level: "high" | "moderate" | "low" = thin ? "low" : totalMatches >= 20 && groups.length >= 3 ? "high" : "moderate";
    const note = tx(
      `${groups.length} positions · ${totalMatches} match-appearances`,
      `${groups.length} stöður · ${totalMatches} leikir`,
    );

    if (axes.length === 0) {
      return {
        tone: "neutral" as VerdictTone,
        sentence: tx(
          "Positions look broadly similar this season — no axis separates them clearly yet.",
          "Stöðurnar líta út fyrir að vera svipaðar á tímabilinu — enginn ás aðgreinir þær skýrt enn.",
        ),
        subtitle: tx(
          "Each bar below is a position's per-match average; the dashed line is the squad average.",
          "Hver súla að neðan er meðaltal stöðu á leik; strikalínan er liðsmeðaltalið.",
        ),
        confidence: { level, note },
        drivers: [] as VerdictDriver[],
      };
    }

    const top = axes.slice(0, 2);
    const groupLabel = (key: string) => {
      const g = groups.find((x) => x.key === key);
      return g ? (IS ? g.label_is : g.label_en) : key;
    };

    // Headline: "X <do the most Y>; Z <do the most W>." — two biggest contrasts.
    const parts = top.map((a) => {
      const p = PHRASE[a.metric]!;
      return `${groupLabel(a.leadKey)} ${tx(p.en, p.is)}`;
    });
    const sentence = parts.join(IS ? "; " : "; ") + ".";

    const drivers: VerdictDriver[] = top.map((a) => {
      const p = PHRASE[a.metric]!;
      const pct = Math.round(a.spread * 100);
      return {
        label: groupLabel(a.leadKey),
        detail: { EN: META[a.metric].en, IS: META[a.metric].is },
        tip: {
          EN: `${p.jargonEn} — ${META[a.metric].fmt(a.leadVal)}${META[a.metric].unit ? ` ${META[a.metric].unit}` : ""}${NOT_PER90.has(a.metric) ? "" : `/${data.normMinutes ?? 90}`}, ~${pct}% above the next position.`,
          IS: `${p.jargonIs} — ${META[a.metric].fmt(a.leadVal)}${META[a.metric].unit ? ` ${META[a.metric].unit}` : ""}${NOT_PER90.has(a.metric) ? "" : `/${data.normMinutes ?? 90}`}, ~${pct}% yfir næstu stöðu.`,
        },
        tone: "neutral",
      };
    });

    const tone: VerdictTone = thin ? "neutral" : "good";
    const subtitle = tx(
      "Pick a metric below to compare positions; each bar is a per-match average and the dashed line is the squad average.",
      "Veldu mæligildi að neðan til að bera saman stöður; hver súla er meðaltal á leik og strikalínan er liðsmeðaltalið.",
    );

    return { tone, sentence, subtitle, confidence: { level, note }, drivers };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, groups, IS]);

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
            <PagePurpose
              en="compare a player's physical output against others in the same position"
              is="bera saman afköst leikmanns við aðra í sömu stöðu"
              tutorial="position-comparison"
            />
            <div className="text-xs text-slate-500">{IS ? `Hreyfimynstur (per-${normMin}) eftir leikstöðu — með leikstíl.` : `Match movement (per-${normMin}) by position — with playing style.`}</div>
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
      {eliteRequired && (
        <div className="pc-noprint rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">🔒 {IS ? "ELITE eiginleiki" : "ELITE feature"}</div>
          <p className="mt-1 text-amber-800">
            {IS
              ? "Stöðu-samanburður (greining eftir leikstöðu) er hluti af ELITE áskrift. Stöður leikmanna má samt setja frítt á Leikmanna-síðunni."
              : "Position Comparison (position-level analysis) is part of the ELITE subscription. You can still set player positions for free on the Players page."}
          </p>
          <a href="/pricing" className="mt-2 inline-block font-semibold underline hover:text-amber-700">
            {IS ? "Sjá pakka →" : "See plans →"}
          </a>
        </div>
      )}
      {loading && <div className="pc-noprint mb-4 text-sm text-slate-500">…</div>}

      {data && groups.length > 0 && (
        <div id="pc-report" className="space-y-5">
          {/* Plain-language verdict (rules, not AI) — the explainability-first
              header. All existing charts/cards stay unchanged below. */}
          {verdict && (
            <VerdictBanner
              lang={lang}
              kicker={IS ? "Stöðu-samanburður" : "Position comparison"}
              tone={verdict.tone}
              sentence={verdict.sentence}
              subtitle={verdict.subtitle}
              confidence={verdict.confidence}
              drivers={verdict.drivers}
            />
          )}

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
                  {(data.metrics).map((m) => <option key={m} value={m}>{IS ? META[m].is : META[m].en}{META[m].unit ? ` (${META[m].unit})` : ""}{NOT_PER90.has(m) ? "" : ` ${PER}`}</option>)}
                </select>
              </div>
              <div className="mx-auto max-w-md">
                <MatchTrendBars title={`${IS ? META[metric].is : META[metric].en}${NOT_PER90.has(metric) ? "" : ` ${PER}`}${META[metric].unit ? ` (${META[metric].unit})` : ""}`} unit={META[metric].unit} bars={compareBars.bars} avg={compareBars.avg} />
              </div>
              <div className="mt-1 text-center text-[10px] text-slate-400">{IS ? "Strikalína = liðsmeðaltal" : "Dashed line = squad average"}</div>
            </div>
          )}

          {/* Movement DNA by position — one stacked bar per position */}
          {dna.length > 0 && (
            <div className="pc-section rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{IS ? "Hreyfi-DNA eftir stöðu" : "Movement DNA by position"}</div>
              <div className="space-y-1.5">
                {dna.map((row) => (
                  <div key={row.key} className="flex items-center gap-2">
                    <div className="w-10 shrink-0 text-[11px] font-semibold tabular-nums text-slate-600">{row.key}</div>
                    <div className="flex h-5 flex-1 overflow-hidden rounded">
                      {row.shares.map((s) => s.pct > 0 ? (
                        <div key={s.key} className="flex items-center justify-center text-[9px] font-semibold text-white"
                          style={{ width: `${s.pct}%`, background: s.color }}
                          title={`${IS ? s.is : s.en}: ${Math.round(s.pct)}%`}>
                          {s.pct >= 12 ? `${Math.round(s.pct)}%` : ""}
                        </div>
                      ) : null)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-3">
                {STYLE_AXES.map((ax) => (
                  <span key={ax.key} className="flex items-center gap-1.5 text-[10px] text-slate-600">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ax.color }} />
                    {IS ? ax.is : ax.en}
                  </span>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-slate-400">{IS ? "Hlutfallslegt vægi hreyfi-ása (úr percentile vs liðið) — stærsta sneið = leikstíll stöðunnar." : "Relative emphasis of movement axes (from squad percentiles) — the largest slice = the position's playing style."}</div>
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
            MicroPulse · {IS ? `Stíll ákvarðaður með reglum úr per-${normMin} hreyfigögnum (z-stig vs aðrar stöður). ★ = leikmaður sker sig úr.` : `Style assigned by rules from per-${normMin} movement (z-score vs other positions). ★ = player stands out.`}
          </div>
        </div>
      )}
      {data && groups.length === 0 && !loading && (
        <div className="pc-noprint rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">{IS ? "Engin leikgögn á tímabilinu." : "No match data this season."}</div>
      )}
    </div>
  );
}

const STYLE_AXES: Array<{ key: string; en: string; is: string; color: string }> = [
  { key: "speed", en: "Speed", is: "Hraði", color: "#0ea5e9" },
  { key: "agility", en: "Agility", is: "Snerpa", color: "#8b5cf6" },
  { key: "volume", en: "Engine", is: "Vél", color: "#2b8a54" },
  { key: "aerial", en: "Aerial", is: "Loftógn", color: "#cb8420" },
];

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
