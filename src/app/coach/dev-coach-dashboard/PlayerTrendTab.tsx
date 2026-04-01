"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { Lang } from "@/lib/lang";

// ── Copy ──────────────────────────────────────────────────────────────────────

const COPY = {
  IS: {
    player:        "Leikmaður",
    period:        "Tímabil",
    loadingPlayers:"Hleð leikmannalista…",
    loadingTrend:  "Hleð þróunargögnum…",
    noPlayer:      "Veldu leikmann til að sjá þróun.",
    avgReadiness:  "Meðal Readiness",
    avgSten:       "Meðal STEN",
    checkInRate:   "Check-in hlutfall",
    daysRecovery:  "Dagar RECOVERY",
    daysReduced:   "Dagar REDUCED",
    outOf:         "/ 25",
    outOf10:       "/ 10",
    days:          "dagar",
    of:            "af",
    sparkReadiness:"Readiness Score",
    sparkStenSub:  "1 – 10 · grunnlína miðgildi = 5–6",
    sparkReadSub:  (w: number) => `0 – 25 · síðustu ${w} dagar`,
    sparkGpsSub:   "Catapult · per æfing",
    playerLoad:    "Player Load",
    totalDist:     "Heildarvegalengd (m)",
    dailyHistory:  "Dagleg saga",
    historyDesc:   (w: number) => `Síðustu ${w} dagar — nýjast efst`,
    checkinOf:     (c: number, t: number) => `${c} check-in af ${t} dögum`,
    date:          "Dagsetning",
    readiness:     "Readiness",
    decision:      "Ákvörðun",
    dist:          "Dist (m)",
    locale:        "is-IS",
  },
  EN: {
    player:        "Player",
    period:        "Period",
    loadingPlayers:"Loading player list…",
    loadingTrend:  "Loading trend data…",
    noPlayer:      "Select a player to view trends.",
    avgReadiness:  "Avg Readiness",
    avgSten:       "Avg STEN",
    checkInRate:   "Check-in rate",
    daysRecovery:  "Days RECOVERY",
    daysReduced:   "Days REDUCED",
    outOf:         "/ 25",
    outOf10:       "/ 10",
    days:          "days",
    of:            "of",
    sparkReadiness:"Readiness Score",
    sparkStenSub:  "1 – 10 · baseline median = 5–6",
    sparkReadSub:  (w: number) => `0 – 25 · last ${w} days`,
    sparkGpsSub:   "Catapult · per session",
    playerLoad:    "Player Load",
    totalDist:     "Total Distance (m)",
    dailyHistory:  "Daily history",
    historyDesc:   (w: number) => `Last ${w} days — newest first`,
    checkinOf:     (c: number, t: number) => `${c} check-ins of ${t} days`,
    date:          "Date",
    readiness:     "Readiness",
    decision:      "Decision",
    dist:          "Dist (m)",
    locale:        "en-GB",
  },
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type PlayerRow = {
  player_id: string | number;
  full_name: string;
  position?: string | null;
};

type DayEntry = {
  date: string;
  readinessScore: number | null;
  zScore: number | null;
  sten: number | null;
  trainingAction: string | null;
  totalDistance: number | null;
  playerLoad: number | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function zToSten(z: number): number {
  return Math.min(10, Math.max(1, Math.round(2 * z + 5.5)));
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function stenStyle(sten: number | null): { text: string; chip: string } {
  if (sten == null) return { text: "text-slate-400", chip: "bg-slate-100 text-slate-400" };
  if (sten >= 9) return { text: "text-emerald-700", chip: "bg-emerald-100 text-emerald-700" };
  if (sten >= 7) return { text: "text-emerald-600", chip: "bg-emerald-50 text-emerald-600" };
  if (sten >= 5) return { text: "text-slate-700",   chip: "bg-slate-100 text-slate-700" };
  if (sten >= 3) return { text: "text-amber-700",   chip: "bg-amber-100 text-amber-700" };
  return           { text: "text-rose-700",   chip: "bg-rose-100 text-rose-700" };
}

function ActionChip({ action }: { action: string | null }) {
  if (!action)              return <span className="text-slate-300 text-xs">—</span>;
  if (action === "FULL")    return <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700">FULL</span>;
  if (action === "REDUCED") return <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700">REDUCED</span>;
  if (action === "RECOVERY")return <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-700">RECOVERY</span>;
  return <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-500">{action}</span>;
}

function Sparkline({
  values,
  min,
  max,
  color,
}: {
  values: (number | null)[];
  min: number;
  max: number;
  color: string;
}) {
  const W = 200;
  const H = 36;
  const range = Math.max(0.001, max - min);
  const pts = values
    .map((v, i) => {
      if (v == null) return null;
      const x = (i / Math.max(1, values.length - 1)) * W;
      const y = H * 0.9 - ((v - min) / range) * H * 0.8;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean);

  if (pts.length < 2) {
    return <span className="text-xs text-slate-300">Engin gögn</span>;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type Props = {
  coachTeamId: string | null;
  today: string;
  teamSport: string | null;
  lang: Lang;
};

export function PlayerTrendTab({ coachTeamId, today, teamSport, lang }: Props) {
  const ct = COPY[lang];
  const isBasketball = teamSport === "basketball";

  const [players, setPlayers]     = useState<PlayerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [window, setWindow]       = useState<30 | 60 | 90>(30);
  const [loading, setLoading]     = useState(false);
  const [entries, setEntries]     = useState<DayEntry[]>([]);

  // Fetch full active player list from players table (not today's view)
  useEffect(() => {
    if (!coachTeamId) return;
    supabase
      .from("players")
      .select("id, full_name, position")
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => {
        const list = ((data ?? []) as Array<{ id: number; full_name: string; position: string | null }>)
          .map((p) => ({ player_id: p.id, full_name: p.full_name, position: p.position }));
        setPlayers(list);
        if (list.length > 0) setSelectedId(String(list[0].player_id));
      });
  }, [coachTeamId]);

  // Default to first player when list loads
  useEffect(() => {
    if (!selectedId && players.length > 0) {
      setSelectedId(String(players[0].player_id));
    }
  }, [players, selectedId]);

  // Fetch when selection changes
  useEffect(() => {
    if (!selectedId || !coachTeamId) return;
    let alive = true;
    setLoading(true);

    const startDate = addDaysISO(today, -(window - 1));

    Promise.all([
      supabase
        .from("readiness_entries")
        .select("entry_date, total_score, training_modifier")
        .eq("player_id", selectedId)
        .gte("entry_date", startDate)
        .lte("entry_date", today)
        .order("entry_date", { ascending: true }),

      supabase
        .from("stage4_decisions")
        .select("entry_date, training_action")
        .eq("player_id", selectedId)
        .gte("entry_date", startDate)
        .lte("entry_date", today)
        .order("entry_date", { ascending: true }),

      supabase
        .from("player_external_load_daily")
        .select("date, total_distance, total_player_load")
        .eq("player_id", selectedId)
        .eq("source", "catapult")
        .gte("date", startDate)
        .lte("date", today)
        .order("date", { ascending: true }),
    ]).then(([readiness, decisions, gps]) => {
      if (!alive) return;

      const readMap = new Map<string, { total_score: number | null; training_modifier: unknown }>();
      ((readiness.data ?? []) as Array<{ entry_date: string; total_score: number | null; training_modifier: unknown }>)
        .forEach((r) => readMap.set(r.entry_date, r));

      const actionMap = new Map<string, string>();
      ((decisions.data ?? []) as Array<{ entry_date: string; training_action: string }>)
        .forEach((d) => actionMap.set(d.entry_date, d.training_action));

      const gpsMap = new Map<string, { total_distance: number | null; total_player_load: number | null }>();
      ((gps.data ?? []) as Array<{ date: string; total_distance: number | null; total_player_load: number | null }>)
        .forEach((g) => gpsMap.set(g.date, g));

      // Build one entry per calendar day
      const result: DayEntry[] = [];
      const cur = new Date(`${startDate}T00:00:00.000Z`);
      const end = new Date(`${today}T00:00:00.000Z`);

      while (cur <= end) {
        const dateStr = cur.toISOString().slice(0, 10);
        const r = readMap.get(dateStr);
        const g = gpsMap.get(dateStr);

        let zScore: number | null = null;
        if (r?.training_modifier) {
          const tm =
            typeof r.training_modifier === "string"
              ? JSON.parse(r.training_modifier)
              : r.training_modifier;
          const z = (tm as Record<string, unknown>)?.z ?? (tm as Record<string, unknown>)?.zScore ?? (tm as Record<string, unknown>)?.z_score ?? null;
          if (typeof z === "number" && Number.isFinite(z)) zScore = z;
        }

        result.push({
          date: dateStr,
          readinessScore: r?.total_score ?? null,
          zScore,
          sten: zScore != null ? zToSten(zScore) : null,
          trainingAction: actionMap.get(dateStr) ?? null,
          totalDistance: g?.total_distance ?? null,
          playerLoad: g?.total_player_load ?? null,
        });

        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      setEntries(result);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [selectedId, window, today, coachTeamId]);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const checkedIn = entries.filter((e) => e.readinessScore != null);
  const avgReadiness =
    checkedIn.length
      ? checkedIn.reduce((s, e) => s + (e.readinessScore ?? 0), 0) / checkedIn.length
      : null;

  const stenEntries = entries.filter((e) => e.sten != null);
  const avgSten =
    stenEntries.length
      ? stenEntries.reduce((s, e) => s + (e.sten ?? 0), 0) / stenEntries.length
      : null;

  const daysRecovery = entries.filter((e) => e.trainingAction === "RECOVERY").length;
  const daysReduced  = entries.filter((e) => e.trainingAction === "REDUCED").length;
  const checkInRate  = entries.length ? Math.round((checkedIn.length / entries.length) * 100) : 0;

  const readinessValues = entries.map((e) => e.readinessScore);
  const stenValues      = entries.map((e) => e.sten);
  const loadValues      = entries.map((e) => (isBasketball ? e.playerLoad : e.totalDistance));
  const maxLoad         = Math.max(1, ...loadValues.filter((v): v is number => v != null));

  const selectedPlayer = players.find((p) => String(p.player_id) === selectedId);
  const tableEntries   = [...entries].reverse(); // newest first

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Controls */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                {ct.player}
              </label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {players.map((p) => (
                  <option key={p.player_id} value={String(p.player_id)}>
                    {p.full_name}{p.position ? ` · ${p.position}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                {ct.period}
              </label>
              <div className="flex gap-1">
                {([30, 60, 90] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => setWindow(w)}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      window === w
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {w}d
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">{ct.loadingTrend}</div>
      ) : !selectedId ? (
        <div className="py-12 text-center text-sm text-slate-400">{ct.noPlayer}</div>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: ct.avgReadiness, value: avgReadiness != null ? avgReadiness.toFixed(1) : "—", unit: ct.outOf },
              { label: ct.avgSten,      value: avgSten != null ? avgSten.toFixed(1) : "—",           unit: ct.outOf10 },
              { label: ct.checkInRate,  value: `${checkInRate}%`,                                     unit: `${checkedIn.length} / ${entries.length} ${ct.days}` },
              { label: ct.daysRecovery, value: String(daysRecovery),                                  unit: ct.days },
              { label: ct.daysReduced,  value: String(daysReduced),                                   unit: ct.days },
            ].map(({ label, value, unit }) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
                <div className="text-[11px] text-slate-400">{unit}</div>
              </div>
            ))}
          </div>

          {/* Sparklines */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ct.sparkReadiness}</CardTitle>
                <CardDescription className="text-[11px]">{ct.sparkReadSub(window)}</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <Sparkline values={readinessValues} min={0} max={25} color="#6366f1" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">STEN</CardTitle>
                <CardDescription className="text-[11px]">{ct.sparkStenSub}</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <Sparkline values={stenValues} min={1} max={10} color="#10b981" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {isBasketball ? ct.playerLoad : ct.totalDist}
                </CardTitle>
                <CardDescription className="text-[11px]">{ct.sparkGpsSub}</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <Sparkline values={loadValues} min={0} max={maxLoad} color="#f59e0b" />
              </CardContent>
            </Card>
          </div>

          {/* Daily history table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold uppercase tracking-widest text-slate-900">
                    {selectedPlayer?.full_name} · {ct.dailyHistory}
                  </CardTitle>
                  <CardDescription className="mt-1 text-sm text-slate-500">
                    {ct.historyDesc(window)}
                  </CardDescription>
                </div>
                <div className="text-xs text-slate-400">
                  {ct.checkinOf(checkedIn.length, entries.length)}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{ct.date}</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">{ct.readiness}</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">STEN</th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-slate-600 whitespace-nowrap">{ct.decision}</th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">
                        {isBasketball ? ct.playerLoad : ct.dist}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableEntries.map((e, i) => {
                      const ss = stenStyle(e.sten);
                      const hasData =
                        e.readinessScore != null ||
                        e.trainingAction != null ||
                        (isBasketball ? e.playerLoad : e.totalDistance) != null;
                      const loadVal = isBasketball ? e.playerLoad : e.totalDistance;

                      return (
                        <tr
                          key={e.date}
                          className={`border-b border-slate-100 ${!hasData ? "opacity-40" : ""} ${
                            i % 2 === 0 ? "" : "bg-slate-50/40"
                          } hover:bg-slate-100/60`}
                        >
                          <td className="px-4 py-2 whitespace-nowrap">
                            <div className="font-medium text-slate-800">{e.date}</div>
                            <div className="text-[11px] text-slate-400">
                              {new Date(`${e.date}T00:00:00.000Z`).toLocaleDateString(ct.locale, { weekday: "short" })}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {e.readinessScore != null ? (
                              <span className="font-semibold text-slate-800">{e.readinessScore}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {e.sten != null ? (
                              <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold tabular-nums ${ss.chip}`}>
                                {e.sten}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <ActionChip action={e.trainingAction} />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                            {loadVal != null ? (
                              isBasketball
                                ? loadVal.toFixed(1)
                                : Math.round(loadVal).toLocaleString()
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
