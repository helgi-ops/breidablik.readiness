"use client";

/**
 * PlayerGameReportCard — the player's OWN season game report, so he can follow
 * his physical profile. Self-scoped (/api/player/game-report — player_id comes
 * from his auth, never a param). Capability-aware: shows whatever metrics his
 * team actually records (Lite → GPS; Pro → GPS + IMA), dropping empty ones.
 *
 * Explainability-first: a one-sentence verdict on top, plain-language standout /
 * focus lines, the squad-percentile radar, per-match trends, and a "behind the
 * numbers" details toggle. Confidence (matches + squad size) is always visible.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ProfileRadar, MatchTrendBars, ChartZoom, FormSummary, type RadarMetric, type TrendBar } from "@/components/coach/PlayerGameReportCharts";
import { computeForm } from "@/lib/micropulse/playerGameReport";
import ShareMatchButton from "./ShareMatchButton";
import type { ShareStats } from "@/lib/micropulse/shareCard/pickHeroStat";

type Bench = { player: number; team_avg: number; percentile: number; rank: number; n: number } | null;
type P90 = Record<string, number>;
type RawMatch = { top_speed_kmh?: number; total_distance?: number; sprint?: number };
type Match = { date: string; opponent: string | null; competition?: string | null; is_home?: boolean | null; minutes: number; has_gps: boolean; estimated?: boolean; p90: P90 | null; raw?: RawMatch | null };
type ClubInfo = { name: string; themeColor: string | null; logoUrl: string | null };
type Report = {
  player: { full_name: string; position: string | null; age: number | null };
  season: { year: number };
  summary: { matches_played: number; matches_with_gps: number; total_minutes: number; qualifying_matches: number; per90_avg: P90; best_top_speed_kmh: number };
  benchmarks: Record<string, Bench>;
  availableKeys: string[];
  matches: Match[];
  club?: ClubInfo;
};

const clampSpeed = (v: number | undefined) => (typeof v === "number" && v > 0 && v <= 45 ? v : 0);
const matchStats = (m: Match): ShareStats => ({ topSpeed: clampSpeed(m.raw?.top_speed_kmh), distance: m.raw?.total_distance ?? 0, sprints: m.raw?.sprint ?? 0 });

const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString());
const f1 = (v: number | null | undefined) => (v == null ? "—" : (Math.round(v * 10) / 10).toLocaleString());

// Metric labels (bilingual) + short radar-axis labels + formatter. Two groups,
// echoing the Niklas Virtanen framing the system follows: the ENGINE (GPS — how
// much running you bring) and the DRIVER (IMA — how explosively you move). On a
// Lite/Core team the IMA keys are absent from availableKeys, so the Driver radar
// simply doesn't render and only the Engine profile shows.
type MetricCfg = { key: string; is: string; en: string; sis: string; sen: string; unit: string; fmt: (v: number | null | undefined) => string };
const ENGINE: MetricCfg[] = [
  { key: "total_distance", is: "Vegalengd", en: "Distance", sis: "Vegal.", sen: "Dist", unit: "m", fmt: n0 },
  { key: "hsr", is: "Háhraðahlaup", en: "High-speed running", sis: "Háhraði", sen: "HSR", unit: "m", fmt: n0 },
  { key: "sprint", is: "Sprettir", en: "Sprinting", sis: "Sprettur", sen: "Sprint", unit: "m", fmt: n0 },
  { key: "top_speed_kmh", is: "Hæsti hraði", en: "Top speed", sis: "Hraði", sen: "Speed", unit: "km/h", fmt: f1 },
  { key: "hml", is: "Ákafa-vegalengd", en: "High metabolic distance", sis: "Háless.", sen: "HML", unit: "m", fmt: n0 },
  { key: "efforts", is: "Hröðunar-/hemlunarátök", en: "Accel/decel efforts", sis: "Átök", sen: "Efforts", unit: "", fmt: f1 },
  { key: "accel", is: "Hröðun (GPS)", en: "Accelerations (GPS)", sis: "Hröðun", sen: "Acc", unit: "", fmt: f1 },
  { key: "decel", is: "Hemlun (GPS)", en: "Decelerations (GPS)", sis: "Hemlun", sen: "Dec", unit: "", fmt: f1 },
];
const DRIVER: MetricCfg[] = [
  { key: "ima_acc", is: "Snöggar hröðunir", en: "Sharp accelerations", sis: "Hröðun", sen: "Acc", unit: "", fmt: f1 },
  { key: "ima_dec", is: "Snöggar hemlanir", en: "Sharp decelerations", sis: "Hemlun", sen: "Dec", unit: "", fmt: f1 },
  { key: "cod", is: "Stefnubreytingar", en: "Change of direction", sis: "Stefnub.", sen: "CoD", unit: "", fmt: f1 },
  { key: "jumps", is: "Stökk", en: "Jumps", sis: "Stökk", sen: "Jumps", unit: "", fmt: f1 },
  // High-intensity running broken into stride-rate bands B5-B8 (rising intensity).
  { key: "ima_hir5", is: "Ákafahlaup band 5", en: "High-intensity running — band 5", sis: "B5", sen: "B5", unit: "m", fmt: n0 },
  { key: "ima_hir6", is: "Ákafahlaup band 6", en: "High-intensity running — band 6", sis: "B6", sen: "B6", unit: "m", fmt: n0 },
  { key: "ima_hir7", is: "Ákafahlaup band 7", en: "High-intensity running — band 7", sis: "B7", sen: "B7", unit: "m", fmt: n0 },
  { key: "ima_hir8", is: "Ákafahlaup band 8", en: "High-intensity running — band 8", sis: "B8", sen: "B8", unit: "m", fmt: n0 },
];
const ALL: MetricCfg[] = [...ENGINE, ...DRIVER];

export default function PlayerGameReportCard({ lang = "IS" }: { lang?: "IS" | "EN" }) {
  const isIS = lang === "IS";
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showMatches, setShowMatches] = useState(false);
  const [ai, setAi] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);

  const genAi = async () => {
    setAiLoading(true); setAiErr(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/player/game-report/narrative`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ lang }),
      });
      const j = await res.json();
      if (!res.ok) { setAiErr(j.error ?? "Failed"); return; }
      setAi(j.narrative as string);
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/player/game-report`, { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } });
        const j = await res.json();
        if (!alive) return;
        if (!res.ok) { setErr(j.error ?? "Failed"); return; }
        setReport(j as Report);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Network error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const avail = useMemo(() => (report?.availableKeys ? new Set(report.availableKeys) : null), [report]);

  // Build a radar (squad percentile per metric; spikes out = strengths) from a
  // metric group, keeping only the metrics this club actually captures.
  const buildRadar = useMemo(() => (cfgs: MetricCfg[]): RadarMetric[] => {
    if (!report) return [];
    return cfgs
      .filter((m) => (avail ? avail.has(m.key) : true))
      .map((m) => {
        const b = report.benchmarks[m.key];
        if (!b) return null;
        return { label: isIS ? m.sis : m.sen, percentile: b.percentile, valueLabel: m.fmt(b.player) } as RadarMetric;
      })
      .filter((x): x is RadarMetric => x != null);
  }, [report, avail, isIS]);

  const radarEngine = useMemo(() => buildRadar(ENGINE), [buildRadar]);
  const radarDriver = useMemo(() => buildRadar(DRIVER), [buildRadar]);

  // Plain-language standout / focus, across BOTH profiles (so an IMA quality can
  // be the standout, not just a GPS one).
  const verdict = useMemo(() => {
    const both = [...radarEngine, ...radarDriver];
    if (!report || both.length < 2) return null;
    const sorted = [...both].sort((a, b) => b.percentile - a.percentile);
    return { top: sorted[0], low: sorted[sorted.length - 1] };
  }, [report, radarEngine, radarDriver]);

  // Form lens: his recent window vs his season baseline (null when too few matches).
  const form = useMemo(
    () => (report ? computeForm(report.matches, report.summary.per90_avg, report.availableKeys ?? []) : null),
    [report],
  );
  const formLabel = (key: string): string => ({
    total_distance: isIS ? "Vegal." : "Dist", hsr: isIS ? "Háhraði" : "HSR", sprint: isIS ? "Sprettur" : "Sprint",
    efforts: isIS ? "Átök" : "Efforts", hml: "HML", ima_acc: isIS ? "Hröðun" : "Acc", ima_dec: isIS ? "Hemlun" : "Dec", cod: isIS ? "Stefnub." : "CoD",
  } as Record<string, string>)[key] ?? key;

  const series = (key: string): TrendBar[] =>
    (report?.matches ?? []).filter((m) => m.has_gps && m.p90).map((m) => ({
      label: (m.opponent ?? "—").slice(0, 6),
      value: (m.p90?.[key] as number) ?? 0,
    }));

  if (loading) return <div className="mx-auto max-w-lg px-1 py-6 text-sm text-zinc-500">{isIS ? "Hleð leikjaskýrslu…" : "Loading game report…"}</div>;
  if (err) return <div className="mx-auto max-w-lg px-1 py-6"><div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div></div>;
  if (!report) return null;

  const s = report.summary;
  const noData = s.matches_with_gps === 0;

  // Shareable match card context: this player's GPS matches + club theming.
  const shareClub = report.club ?? { name: "", themeColor: null, logoUrl: null };
  const shareAll: ShareStats[] = report.matches.filter((m) => m.has_gps && m.raw && !m.estimated).map(matchStats);

  return (
    <div className="mx-auto max-w-lg space-y-3 pb-24">
      {/* Header + one-sentence verdict */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          {isIS ? "Leikjaskýrsla" : "Game report"} · {report.season.year}
        </div>
        <h2 className="mt-0.5 text-lg font-bold tracking-tight text-zinc-900">{report.player.full_name}</h2>
        {noData ? (
          <p className="mt-1 text-sm leading-relaxed text-zinc-600">
            {isIS ? "Engin leikgögn skráð enn á þessu tímabili. Skýrslan fyllist um leið og GPS-gögn úr leik berast." : "No match data recorded yet this season. Your report fills in as soon as match GPS data arrives."}
          </p>
        ) : (
          <p className="mt-1 text-sm leading-relaxed text-zinc-700">
            {isIS
              ? `Þú hefur spilað ${s.matches_played} ${s.matches_played === 1 ? "deildarleik" : "deildarleiki"} í ár. Hér er líkamlega prófílinn þinn — borinn saman við liðið.`
              : `You've played ${s.matches_played} league ${s.matches_played === 1 ? "match" : "matches"} this season. Here's your physical profile — compared to the squad.`}
          </p>
        )}
        {/* Confidence: what the report is built on */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip label={isIS ? "Leikir" : "Matches"} value={String(s.matches_with_gps)} />
          <Chip label={isIS ? "Mínútur" : "Minutes"} value={n0(s.total_minutes)} />
          {report.benchmarks.top_speed_kmh && <Chip label={isIS ? "Hæsti hraði" : "Top speed"} value={`${f1(s.best_top_speed_kmh)} km/h`} />}
        </div>
      </div>

      {!noData && (
        <>
          {/* Plain-language standout / focus */}
          {verdict && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-base">⭐</span>
                <p className="text-sm leading-relaxed text-zinc-700">
                  <span className="font-semibold text-zinc-900">{isIS ? "Þinn styrkur: " : "Your standout: "}</span>
                  {verdict.top.label} — {isIS ? `betri en ${verdict.top.percentile}% af liðinu.` : `better than ${verdict.top.percentile}% of the squad.`}
                </p>
              </div>
              <div className="mt-2 flex items-start gap-2">
                <span className="mt-0.5 text-base">🎯</span>
                <p className="text-sm leading-relaxed text-zinc-700">
                  <span className="font-semibold text-zinc-900">{isIS ? "Mest svigrúm: " : "Most room to grow: "}</span>
                  {verdict.low.label} — {isIS ? `${verdict.low.percentile}. hundraðshluti í liðinu.` : `${verdict.low.percentile}th percentile in the squad.`}
                </p>
              </div>
            </div>
          )}

          {/* Form lens — your recent matches vs your season baseline */}
          {form && <FormSummary form={form} metricLabel={formLabel} isIS={isIS} />}

          {/* AI summary about you — on-demand, labelled as AI, from your own numbers */}
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-indigo-900">
                <span>✨</span>{isIS ? "AI samantekt um þig" : "AI summary about you"}
              </div>
              {!ai && (
                <button type="button" onClick={genAi} disabled={aiLoading}
                  className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                  {aiLoading ? (isIS ? "Skrifa…" : "Writing…") : (isIS ? "Búa til" : "Generate")}
                </button>
              )}
            </div>
            {aiErr && <div className="mt-2 text-xs text-red-600">{aiErr}</div>}
            {ai ? (
              <>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700">{ai}</p>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-400">
                  <span className="inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-indigo-700">AI</span>
                  {isIS ? "Búið til úr þínum eigin leiktölum. AI útskýrir — tölurnar ráða." : "Generated from your own match numbers. AI explains — the numbers decide."}
                </div>
              </>
            ) : !aiLoading && !aiErr ? (
              <p className="mt-1 text-xs text-indigo-700/70">
                {isIS ? "Fáðu stutta samantekt á prófílnum þínum, skrifaða úr þínum eigin tölum." : "Get a short summary of your profile, written from your own numbers."}
              </p>
            ) : null}
          </div>

          {/* Engine vs Driver explainer — only when both radars show (Pro). */}
          {radarEngine.length >= 3 && radarDriver.length >= 3 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-[12px] leading-relaxed text-zinc-600 shadow-sm">
              {isIS ? (
                <><span className="font-semibold text-emerald-700">Vél (GPS)</span> = hve mikið þú hleypur (hráa aflið, eins og hestöfl). <span className="font-semibold text-violet-700">Stýring (IMA)</span> = hvernig þú hreyfir þig — snöggar hröðunir, hemlanir, stefnubreytingar, stökk. Tveir geta haft sömu vél en gjörólíka stýringu. <span className="text-zinc-400">(hugmynd: Niklas Virtanen, &bdquo;Data as a language&ldquo;, Catapult)</span></>
              ) : (
                <><span className="font-semibold text-emerald-700">Engine (GPS)</span> = how much running you bring (raw output, like horsepower). <span className="font-semibold text-violet-700">Driver (IMA)</span> = how you move — sharp accelerations, decelerations, changes of direction, jumps. Two players can have the same engine but a very different driver. <span className="text-zinc-400">(concept: Niklas Virtanen, “Data as a language”, Catapult)</span></>
              )}
            </div>
          )}

          {/* Percentile radars — Engine (GPS) and, when the club captures IMA,
              Driver (movement). Each axis = squad percentile; spikes out = strength. */}
          {radarEngine.length >= 3 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">{isIS ? "Vél" : "Engine"}</span>
                <span className="text-sm font-semibold text-zinc-900">{isIS ? "Líkamlegur prófíll (GPS) vs liðið" : "Physical profile (GPS) vs squad"}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-500">{isIS ? "Hve mikið þú hleypur — vegalengd, háhraði, sprettur, hæsti hraði, hröðun/hemlun." : "How much running you bring — distance, high-speed, sprint, top speed, accel/decel."}</div>
              <ChartZoom title={isIS ? "Líkamlegur prófíll (GPS) vs liðið" : "Physical profile (GPS) vs squad"} large={<ProfileRadar metrics={radarEngine} maxHeight={520} />}>
                <ProfileRadar metrics={radarEngine} />
              </ChartZoom>
            </div>
          )}
          {radarDriver.length >= 3 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">{isIS ? "Hreyfing" : "Driver"}</span>
                <span className="text-sm font-semibold text-zinc-900">{isIS ? "Líkamlegur prófíll (IMA) vs liðið" : "Physical profile (IMA) vs squad"}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-500">{isIS ? "Hvernig þú hreyfir þig — snöggar hröðunir/hemlanir, stefnubreytingar, stökk, ákafahlaup eftir böndum (B5–B8)." : "How you move — sharp accel/decel, change of direction, jumps, high-intensity running by band (B5–B8)."}</div>
              <ChartZoom title={isIS ? "Líkamlegur prófíll (IMA) vs liðið" : "Physical profile (IMA) vs squad"} large={<ProfileRadar metrics={radarDriver} maxHeight={520} />}>
                <ProfileRadar metrics={radarDriver} />
              </ChartZoom>
            </div>
          )}

          {/* Per-match trends */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm space-y-4">
            <div className="text-sm font-semibold text-zinc-900">{isIS ? "Per leik (á 90 mín)" : "Per match (per 90)"}</div>
            <ChartZoom title={isIS ? "Vegalengd /90" : "Distance /90"} large={<MatchTrendBars title={isIS ? "Vegalengd" : "Distance"} unit="m" bars={series("total_distance")} avg={s.per90_avg.total_distance ?? null} maxHeight={420} />}>
              <MatchTrendBars title={isIS ? "Vegalengd" : "Distance"} unit="m" bars={series("total_distance")} avg={s.per90_avg.total_distance ?? null} />
            </ChartZoom>
            {(avail ? avail.has("hsr") : true) && (
              <ChartZoom title={isIS ? "Háhraðahlaup /90" : "High-speed running /90"} large={<MatchTrendBars title={isIS ? "Háhraðahlaup" : "High-speed running"} unit="m" bars={series("hsr")} avg={s.per90_avg.hsr ?? null} color="#0891b2" maxHeight={420} />}>
                <MatchTrendBars title={isIS ? "Háhraðahlaup" : "High-speed running"} unit="m" bars={series("hsr")} avg={s.per90_avg.hsr ?? null} color="#0891b2" />
              </ChartZoom>
            )}
          </div>

          {/* All matches — the player's full game list (his own data) */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <button type="button" onClick={() => setShowMatches((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold text-zinc-900">
              <span>{isIS ? "Allir leikir" : "All matches"} <span className="text-zinc-400">({report.matches.length})</span></span>
              <span className="text-zinc-400">{showMatches ? "▲" : "▼"}</span>
            </button>
            {showMatches && (
              <div className="mt-2 divide-y divide-zinc-100">
                {report.matches.map((m, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate text-zinc-800">
                        {m.opponent ?? "—"}{m.is_home != null ? <span className="text-zinc-400"> · {m.is_home ? (isIS ? "heima" : "home") : (isIS ? "úti" : "away")}</span> : null}
                        {m.estimated && (
                          <span className="rounded-full border border-amber-300 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600" title={isIS ? "Áætlað út frá leikja-meðaltali — ekki raunmæling" : "Estimated from match average — not a pod measurement"}>
                            {isIS ? "áætl." : "est."}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400">{m.date} · {m.minutes}′{!m.has_gps ? (isIS ? " · engin GPS" : " · no GPS") : ""}</div>
                    </div>
                    {m.has_gps && m.p90 ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="text-right text-[11px] tabular-nums text-zinc-500">{n0(m.p90.total_distance)} m<span className="text-zinc-400"> /90</span></div>
                        {m.raw && !m.estimated && (matchStats(m).topSpeed > 0 || matchStats(m).distance > 0 || matchStats(m).sprints > 0) && (
                          <ShareMatchButton
                            lang={isIS ? "IS" : "EN"}
                            variant="icon"
                            club={shareClub}
                            playerName={report.player.full_name}
                            match={{ date: m.date, opponent: m.opponent, ...matchStats(m) }}
                            allMatches={shareAll}
                          />
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Behind the numbers — full per-90 vs squad table */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <button type="button" onClick={() => setShowDetails((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold text-zinc-900">
              <span>{isIS ? "Tölurnar á bak við" : "Behind the numbers"}</span>
              <span className="text-zinc-400">{showDetails ? "▲" : "▼"}</span>
            </button>
            {showDetails && (
              <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200">
                <table className="w-full text-[12px]">
                  <thead className="bg-zinc-50 text-zinc-500">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">{isIS ? "Mæling" : "Metric"}</th>
                      <th className="px-2 py-1.5 text-right font-medium">{isIS ? "Þú" : "You"}</th>
                      <th className="px-2 py-1.5 text-right font-medium">{isIS ? "Lið" : "Squad"}</th>
                      <th className="px-2 py-1.5 text-right font-medium">{isIS ? "Röð" : "Rank"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ALL.filter((m) => (avail ? avail.has(m.key) : true) && report.benchmarks[m.key]).map((m) => {
                      const b = report.benchmarks[m.key]!;
                      return (
                        <tr key={m.key} className="border-t border-zinc-100">
                          <td className="px-2 py-1.5 text-zinc-700">{isIS ? m.is : m.en}{m.unit ? <span className="text-zinc-400"> ({m.unit})</span> : null}</td>
                          <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-zinc-900">{m.fmt(b.player)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-zinc-500">{m.fmt(b.team_avg)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-zinc-500">{b.rank}/{b.n}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="bg-zinc-50 px-2 py-1.5 text-[10px] text-zinc-400">
                  {isIS
                    ? "Allt á 90 mín, meðaltal yfir leiki með ≥20 mín. Hæsti hraði er toppgildi (ekki á 90)."
                    : "All per 90, averaged over matches with ≥20 min. Top speed is a peak (not per-90)."}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="font-semibold text-zinc-900">{value}</span>
    </span>
  );
}
