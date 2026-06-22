"use client";

export const dynamic = "force-dynamic";

/**
 * Player game-data report — per-match GPS + IMA for one player, minutes-adjusted
 * to per-90, with squad benchmarks and an optional AI-written profile. Built to
 * be shared with the player's agent (on-screen + Print/Save-PDF).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { formatMatchLabel } from "@/lib/micropulse/matchLabel";
import { ProfileRadar, MatchTrendBars, type RadarMetric, type TrendBar } from "@/components/coach/PlayerGameReportCharts";

type P90 = {
  total_distance: number; hsr: number; sprint: number; player_load: number;
  accel: number; decel: number; ima_acc: number; ima_dec: number; cod: number; jumps: number; ima_hsr: number;
  efforts: number; hml: number;
};
type Raw = P90 & { top_speed_kmh: number };
type Match = {
  date: string; opponent: string | null; competition: string | null; is_home: boolean | null;
  minutes: number; has_gps: boolean; raw: Raw | null; p90: P90 | null;
};
type Bench = { player: number; team_avg: number; percentile: number; rank: number; n: number } | null;
type Report = {
  player: { id: string; full_name: string; position: string | null; age: number | null };
  season: { year: number; from: string; to: string };
  summary: {
    matches_played: number; matches_with_gps: number; total_minutes: number;
    qualifying_matches: number; per90_avg: P90; best_top_speed_kmh: number;
  };
  benchmarks: Record<string, Bench>;
  availableKeys?: string[];
  matches: Match[];
  roster: Array<{ id: string; full_name: string; position: string | null }>;
};

const n0 = (v: number | null | undefined) => (v == null ? "·" : Math.round(v).toLocaleString());
const km1 = (m: number | null | undefined) => (m == null ? "·" : (m / 1000).toFixed(1));
const f1 = (v: number | null | undefined) => (v == null ? "·" : (Math.round(v * 10) / 10).toLocaleString());

export default function PlayerGameReportPage() {
  const [lang] = useLang();
  const IS = lang === "IS";
  const thisYear = new Date().getFullYear();
  const [season, setSeason] = useState(thisYear);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [roster, setRoster] = useState<Report["roster"]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [per90, setPer90] = useState(true);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const token = useCallback(async () => {
    const sb = getSupabaseClient();
    const { data: { session } } = await sb.auth.getSession();
    return session?.access_token ?? "";
  }, []);

  // Load the roster once (any player) so the picker is populated even before a pick.
  const load = useCallback(async (pid: string | null, yr: number) => {
    setLoading(true); setErr(null);
    try {
      const t = await token();
      if (!t) { setErr(IS ? "Ekki innskráð(ur)" : "Not signed in"); return; }
      // No player yet → ask the API to resolve the first roster member.
      const qs = pid ? `player_id=${pid}&season=${yr}` : `season=${yr}&bootstrap=1`;
      const res = await fetch(`/api/coach/player-game-report?${qs}`, { headers: { Authorization: `Bearer ${t}` } });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "Failed"); setReport(null); return; }
      setReport(json as Report);
      if ((json as Report).roster?.length) setRoster((json as Report).roster);
      setNarrative(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally { setLoading(false); }
  }, [token, IS]);

  // Bootstrap: fetch roster via a lightweight call, then pick the first player.
  useEffect(() => {
    (async () => {
      const t = await token();
      if (!t) return;
      const res = await fetch(`/api/coach/player-game-report?roster_only=1&season=${season}`, { headers: { Authorization: `Bearer ${t}` } });
      const json = await res.json().catch(() => null);
      const r = (json?.roster ?? []) as Report["roster"];
      if (r.length) { setRoster(r); setPlayerId((cur) => cur ?? r[0].id); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (playerId) void load(playerId, season); }, [playerId, season, load]);

  const matches = useMemo(() => report?.matches ?? [], [report]);
  const gpsMatches = useMemo(() => matches.filter((m) => m.has_gps), [matches]);

  // ── Chart data: percentile radar (player vs squad) + per-match trend bars ──
  const charts = useMemo(() => {
    if (!report) return null;
    const shortOpp = (m: Match) =>
      (m.opponent ?? m.date.slice(5)).replace(/\s*\([^)]*\)\s*$/, "").split(" ")[0].slice(0, 7);
    // Drop-empty per team: only metrics the squad actually carries. Core/Lite
    // teams drop the empty IMA columns (cod) and surface efforts/HML instead;
    // Pro teams keep their IMA columns and drop efforts.
    const avail = report.availableKeys ? new Set(report.availableKeys) : null;
    const radarCfg: Array<{ key: string; label: string; fmt: (v: number | null | undefined) => string }> = [
      { key: "total_distance", label: IS ? "Vegal." : "Dist", fmt: n0 },
      { key: "hsr", label: "HSR", fmt: n0 },
      { key: "sprint", label: IS ? "Sprettur" : "Sprint", fmt: n0 },
      { key: "top_speed_kmh", label: IS ? "Hraði" : "Speed", fmt: f1 },
      { key: "accel", label: "Acc", fmt: f1 },
      { key: "decel", label: "Dec", fmt: f1 },
      { key: "cod", label: "CoD", fmt: f1 },
      { key: "efforts", label: IS ? "Átök" : "Efforts", fmt: f1 },
      { key: "hml", label: "HML", fmt: n0 },
    ];
    const radar: RadarMetric[] = radarCfg
      .filter((c) => !avail || avail.has(c.key))
      .map((c) => {
        const b = report.benchmarks[c.key];
        return b ? { label: c.label, percentile: b.percentile, valueLabel: c.fmt(b.player) } : null;
      })
      .filter((x): x is RadarMetric => x != null);
    const series = (key: keyof typeof report.summary.per90_avg): TrendBar[] =>
      gpsMatches.map((m) => ({ label: shortOpp(m), value: (m.p90?.[key] as number) ?? 0 }));
    return {
      radar,
      distance: { bars: series("total_distance"), avg: report.summary.per90_avg.total_distance },
      hsr: { bars: series("hsr"), avg: report.summary.per90_avg.hsr },
      sprint: { bars: series("sprint"), avg: report.summary.per90_avg.sprint },
    };
  }, [report, gpsMatches, IS]);

  async function generateNarrative() {
    if (!report) return;
    setAiBusy(true);
    try {
      const t = await token();
      const res = await fetch(`/api/coach/player-game-report/narrative`, {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          lang,
          player: { ...report.player, season: report.season.year },
          summary: report.summary,
          benchmarks: report.benchmarks,
          availableKeys: report.availableKeys,
        }),
      });
      const json = await res.json();
      if (res.ok) setNarrative(json.narrative);
      else setErr(json.error ?? "AI failed");
    } catch (e) { setErr(e instanceof Error ? e.message : "AI error"); }
    finally { setAiBusy(false); }
  }

  const t = {
    title: IS ? "Leikgögn leikmanns" : "Player game report",
    intro: IS ? "Líkamleg frammistaða per leik, stillt á per-90." : "Physical performance per match, normalised to per-90.",
    player: IS ? "Leikmaður" : "Player", season: IS ? "Tímabil" : "Season",
    print: IS ? "Prenta / Vista PDF" : "Print / Save PDF",
    per90: IS ? "Per 90 mín" : "Per 90 min", totals: IS ? "Heildartölur" : "Totals",
    matchesPlayed: IS ? "Leikir" : "Matches", withGps: IS ? "með GPS" : "with GPS",
    minutes: IS ? "Mínútur" : "Minutes", topSpeed: IS ? "Hæsti hraði" : "Top speed",
    benchTitle: IS ? "Per-90 vs liðið" : "Per-90 vs squad",
    teamAvg: IS ? "Lið" : "Squad", inSquad: IS ? "í liðinu" : "in squad",
    aiTitle: IS ? "AI lýsing" : "AI summary",
    aiGenerate: IS ? "Búa til AI lýsingu" : "Generate AI summary",
    aiBusy: IS ? "Skrifa…" : "Writing…",
    aiLabel: IS ? "AI-mynduð úr gögnunum hér að neðan" : "AI-generated from the data below",
    perMatch: IS ? "Per leikur" : "Per match",
    date: IS ? "Dags." : "Date", opp: IS ? "Andstæðingur" : "Opponent", comp: IS ? "Mót" : "Comp",
    min: IS ? "Mín" : "Min", dist: IS ? "Vegalengd" : "Distance", hsr: "HSR (m)", sprint: IS ? "Sprettur (m)" : "Sprint (m)",
    acc: "Acc", dec: "Dec", imaAcc: "IMA Acc", imaDec: "IMA Dec", cod: "CoD", jumps: IS ? "Stökk" : "Jumps",
    noData: IS ? "Engin leikgögn fyrir þennan leikmann á tímabilinu." : "No match data for this player in this season.",
    home: IS ? "H" : "H", away: IS ? "Ú" : "A", generated: IS ? "Útbúin" : "Generated",
  };

  // Metric config for the benchmark cards (headline per-90 metrics). Drop-empty
  // per team via availableKeys: Core/Lite teams drop the empty IMA cards (CoD,
  // jumps) and gain Hard efforts + HML; Pro teams keep their IMA cards.
  const benchAvail = report?.availableKeys ? new Set(report.availableKeys) : null;
  const benchCards: Array<{ key: string; label: string; unit: string; fmt: (v: number | null | undefined) => string }> = [
    { key: "total_distance", label: IS ? "Vegalengd" : "Distance", unit: "m", fmt: n0 },
    { key: "hsr", label: IS ? "Háhraðahlaup" : "High-speed running", unit: "m", fmt: n0 },
    { key: "sprint", label: IS ? "Sprettir" : "Sprinting", unit: "m", fmt: n0 },
    { key: "top_speed_kmh", label: IS ? "Hæsti hraði" : "Top speed", unit: "km/h", fmt: f1 },
    { key: "accel", label: IS ? "Hröðun" : "Accelerations", unit: "", fmt: f1 },
    { key: "decel", label: IS ? "Hraðaminnkun" : "Decelerations", unit: "", fmt: f1 },
    { key: "cod", label: IS ? "Stefnubreytingar" : "Change of direction", unit: "", fmt: f1 },
    { key: "jumps", label: IS ? "Stökk" : "Jumps", unit: "", fmt: f1 },
    { key: "efforts", label: IS ? "Hörð átök (acc+dec)" : "Hard efforts (acc+dec)", unit: "", fmt: f1 },
    { key: "hml", label: IS ? "Háorkuvegalengd (HML)" : "High metabolic load (HML)", unit: "m", fmt: n0 },
  ].filter((c) => !benchAvail || benchAvail.has(c.key));

  // Variable per-match table columns — same drop-empty rule, so a Lite team's
  // table shows efforts/HML where a Pro team's shows the IMA split.
  const matchCols = ([
    { key: "accel",   label: t.acc,    fmt: f1 },
    { key: "decel",   label: t.dec,    fmt: f1 },
    { key: "ima_acc", label: t.imaAcc, cls: "text-emerald-700", fmt: f1 },
    { key: "ima_dec", label: t.imaDec, cls: "text-emerald-700", fmt: f1 },
    { key: "cod",     label: t.cod,    cls: "text-emerald-700", fmt: f1 },
    { key: "jumps",   label: t.jumps,  cls: "text-emerald-700", fmt: f1 },
    { key: "efforts", label: IS ? "Átök" : "Eff", fmt: f1 },
    { key: "hml",     label: "HML",    fmt: n0 },
  ] as Array<{ key: keyof P90; label: string; cls?: string; fmt: (v: number | null | undefined) => string }>)
    .filter((c) => !benchAvail || benchAvail.has(c.key));

  function topPctLabel(b: Bench): { text: string; tone: string } {
    if (!b) return { text: "·", tone: "bg-slate-100 text-slate-500" };
    if (b.rank === 1) return { text: IS ? "#1 í liðinu" : "#1 in squad", tone: "bg-emerald-100 text-emerald-700" };
    const topPct = Math.max(1, 100 - b.percentile);
    const tone = b.percentile >= 70 ? "bg-emerald-100 text-emerald-700" : b.percentile >= 40 ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700";
    return { text: `${IS ? "efstu" : "top"} ${topPct}%`, tone };
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body * { visibility: hidden; }
          #pgr-report, #pgr-report * { visibility: visible; }
          #pgr-report { position: absolute; left: 0; top: 0; width: 100%; }
          .pgr-noprint { display: none !important; }
          .pgr-section { break-inside: avoid; }
        }
      `}</style>

      {/* Controls (not printed) */}
      <div className="pgr-noprint mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <label className="block text-[11px] uppercase tracking-wide text-slate-500">{t.player}</label>
            <select
              value={playerId ?? ""}
              onChange={(e) => setPlayerId(e.target.value || null)}
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {roster.length === 0 && <option value="">—</option>}
              {roster.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}{p.position ? ` · ${p.position}` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-slate-500">{t.season}</label>
            <select value={season} onChange={(e) => setSeason(Number(e.target.value))}
              className="mt-0.5 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex rounded-md border border-slate-300 p-0.5 text-xs">
            <button type="button" onClick={() => setPer90(true)} className={`rounded px-2 py-1 ${per90 ? "bg-slate-900 text-white" : "text-slate-600"}`}>{t.per90}</button>
            <button type="button" onClick={() => setPer90(false)} className={`rounded px-2 py-1 ${!per90 ? "bg-slate-900 text-white" : "text-slate-600"}`}>{t.totals}</button>
          </div>
          <button type="button" onClick={() => window.print()} disabled={!report || gpsMatches.length === 0}
            className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            🖨 {t.print}
          </button>
        </div>
      </div>

      {err && <div className="pgr-noprint mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {loading && <div className="pgr-noprint mb-4 text-sm text-slate-500">…</div>}

      {report && (
        <div id="pgr-report" className="rounded-xl border border-slate-200 bg-white p-6 text-slate-800">
          {/* Header */}
          <div className="pgr-section mb-4 flex items-end justify-between border-b border-slate-200 pb-3">
            <div>
              <div className="text-xl font-bold text-slate-900">{report.player.full_name}</div>
              <div className="text-xs text-slate-500">
                {[report.player.position, report.player.age != null ? `${report.player.age} ${IS ? "ára" : "yrs"}` : null].filter(Boolean).join(" · ")}
                {report.player.position || report.player.age != null ? " · " : ""}{t.intro}
              </div>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              <div>{t.season}: <b className="text-slate-700">{report.season.year}</b></div>
              <div>{t.generated}: {new Date().toISOString().slice(0, 10)}</div>
            </div>
          </div>

          {gpsMatches.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">{t.noData}</div>
          ) : (
            <>
              {/* Season summary tiles */}
              <div className="pgr-section mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label={`${t.matchesPlayed} (${t.withGps})`} value={`${report.summary.matches_played} (${report.summary.matches_with_gps})`} />
                <Tile label={t.minutes} value={n0(report.summary.total_minutes)} />
                <Tile label={`${t.topSpeed} (km/h)`} value={f1(report.summary.best_top_speed_kmh)} accent />
                <Tile label={`HSR ${t.per90} (m)`} value={n0(report.summary.per90_avg.hsr)} />
              </div>

              {/* Visualisations — radar profile + per-match trends */}
              {charts && charts.radar.length >= 3 && (
                <div className="pgr-section mb-6">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{IS ? "Prófíll & þróun" : "Profile & trends"}</div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="mb-1 text-[11px] font-semibold text-slate-700">{IS ? "Líkamlegur prófíll (vs lið)" : "Physical profile (vs squad)"}</div>
                      <ProfileRadar metrics={charts.radar} />
                    </div>
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                      <MatchTrendBars title={IS ? "Vegalengd /90 (m)" : "Distance /90 (m)"} unit="m" bars={charts.distance.bars} avg={charts.distance.avg} />
                      <MatchTrendBars title={IS ? "Háhraðahlaup /90 (m)" : "High-speed running /90 (m)"} unit="m" bars={charts.hsr.bars} avg={charts.hsr.avg} color="#0ea5e9" />
                    </div>
                  </div>
                </div>
              )}

              {/* Benchmark cards */}
              <div className="pgr-section mb-6">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{t.benchTitle}</div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {benchCards.map((c) => {
                    const b = report.benchmarks[c.key];
                    const lbl = topPctLabel(b);
                    return (
                      <div key={c.key} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                        <div className="flex items-start justify-between gap-1">
                          <div className="text-[11px] font-medium leading-tight text-slate-600">{c.label}</div>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${lbl.tone}`}>{lbl.text}</span>
                        </div>
                        <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                          {c.fmt(b?.player)}<span className="ml-1 text-[10px] font-normal text-slate-400">{c.unit}{c.key === "top_speed_kmh" ? "" : `${IS ? "/90" : "/90"}`}</span>
                        </div>
                        <div className="text-[10px] text-slate-500">{t.teamAvg}: {c.fmt(b?.team_avg)} · #{b?.rank ?? "·"}/{b?.n ?? "·"}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* AI narrative */}
              <div className="pgr-section mb-6 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                    <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold text-white">AI</span>
                    {t.aiTitle}
                  </div>
                  {!narrative && (
                    <button type="button" onClick={generateNarrative} disabled={aiBusy}
                      className="pgr-noprint rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50">
                      {aiBusy ? t.aiBusy : t.aiGenerate}
                    </button>
                  )}
                </div>
                {narrative ? (
                  <>
                    <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-700">{narrative}</p>
                    <div className="mt-1.5 text-[9px] text-indigo-400">{t.aiLabel}</div>
                  </>
                ) : (
                  <p className="pgr-noprint text-[11px] text-slate-500">{t.aiLabel}.</p>
                )}
              </div>

              {/* Per-match table */}
              <div className="pgr-section">
                <div className="mb-1.5 flex items-baseline justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{t.perMatch}</div>
                  <div className="text-[10px] text-slate-400">{per90 ? t.per90 : t.totals}</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b-2 border-slate-300 text-[9px] uppercase tracking-wide text-slate-500">
                        <th className="px-1.5 py-1 text-left font-semibold">{t.date}</th>
                        <th className="px-1.5 py-1 text-left font-semibold">{t.opp}</th>
                        <th className="px-1.5 py-1 text-right font-medium">{t.min}</th>
                        <th className="px-1.5 py-1 text-right font-medium">{t.dist}{per90 ? "" : " (km)"}</th>
                        <th className="px-1.5 py-1 text-right font-medium">{t.hsr}</th>
                        <th className="px-1.5 py-1 text-right font-medium">{t.sprint}</th>
                        <th className="px-1.5 py-1 text-right font-medium">{t.topSpeed}</th>
                        {matchCols.map((c) => (
                          <th key={c.key} className={`px-1.5 py-1 text-right font-medium ${c.cls ?? ""}`}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matches.map((m) => {
                        const d = per90 ? m.p90 : m.raw;
                        return (
                          <tr key={m.date} className="border-b border-slate-100">
                            <td className="px-1.5 py-0.5 text-slate-600">{m.date}</td>
                            <td className="px-1.5 py-0.5 font-medium text-slate-800">{formatMatchLabel(m.opponent, m.is_home, { home: t.home, away: t.away })}</td>
                            <td className="px-1.5 py-0.5 text-right tabular-nums text-slate-500">{m.minutes || "·"}</td>
                            {!m.has_gps ? (
                              <td colSpan={4 + matchCols.length} className="px-1.5 py-0.5 text-center text-[10px] italic text-slate-400">{IS ? "engin GPS" : "no GPS"}</td>
                            ) : (
                              <>
                                <td className="px-1.5 py-0.5 text-right tabular-nums">{per90 ? n0(d?.total_distance) : km1(m.raw?.total_distance)}</td>
                                <td className="px-1.5 py-0.5 text-right tabular-nums">{n0(d?.hsr)}</td>
                                <td className="px-1.5 py-0.5 text-right tabular-nums">{n0(d?.sprint)}</td>
                                <td className="px-1.5 py-0.5 text-right tabular-nums font-semibold">{f1(m.raw?.top_speed_kmh)}</td>
                                {matchCols.map((c) => (
                                  <td key={c.key} className={`px-1.5 py-0.5 text-right tabular-nums ${c.cls ?? ""}`}>{c.fmt(d?.[c.key])}</td>
                                ))}
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-200 pt-2 text-[9px] text-slate-400">
                MicroPulse · micropulse.is · GPS = Catapult · IMA = inertial movement (accel/decel, change-of-direction, jumps) · {IS ? "per-90 = stillt á 90 mín" : "per-90 = normalised to 90 min"}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${accent ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${accent ? "text-emerald-700" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}
