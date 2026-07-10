"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
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
    sparkReadiness:"Readiness",
    sparkSten:     "STEN",
    sparkStenSub:  "1–10 · grunnlína miðgildi = 5–6",
    sparkReadSub:  (w: number) => `0–25 · síðustu ${w} dagar`,
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
    noData:        "Engin gögn",
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
    sparkReadiness:"Readiness",
    sparkSten:     "STEN",
    sparkStenSub:  "1–10 · baseline median = 5–6",
    sparkReadSub:  (w: number) => `0–25 · last ${w} days`,
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
    noData:        "No data",
  },
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

type PlayerRow = {
  player_id: string;
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
  sourceTeamId: string | null;
  sourceTeamName: string | null;
  sourceTeamShort: string | null;
  sourceTeamColor: string | null;
};

type TeamMeta = {
  id: string;
  name: string;
  short: string | null;
  color: string | null;
  type: string | null;
};

function teamBadgeBg(color: string | null): string {
  // Use the team's color as background, at low opacity
  if (!color) return "rgba(100, 116, 139, 0.10)";
  return `${color}1a`; // append 1a hex (10% opacity)
}

function SourceTeamBadge({ team }: { team: { name: string; short: string | null; color: string | null } | null }) {
  if (!team) return <span className="text-slate-300 text-xs">—</span>;
  const label = team.short || team.name;
  const color = team.color || "#8b8676";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide"
      style={{ backgroundColor: teamBadgeBg(color), color }}
      title={team.name}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function zToSten(z: number): number {
  return Math.min(10, Math.max(1, Math.round(2 * z + 5.5)));
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function stenColor(sten: number | null): string {
  if (sten == null) return "#a9a493";
  if (sten >= 9)   return "#1c7a4a";
  if (sten >= 7)   return "#2b8a54";
  if (sten >= 5)   return "#6366f1";
  if (sten >= 3)   return "#cb8420";
  return "#b34a30";
}

function stenChip(sten: number | null): string {
  if (sten == null) return "bg-slate-100 text-slate-400";
  if (sten >= 9)   return "bg-emerald-100 text-emerald-700";
  if (sten >= 7)   return "bg-emerald-50 text-emerald-600";
  if (sten >= 5)   return "bg-indigo-50 text-indigo-700";
  if (sten >= 3)   return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

function ActionChip({ action }: { action: string | null }) {
  if (!action)               return <span className="text-slate-300 text-xs">—</span>;
  if (action === "FULL")     return <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 tracking-wide">FULL</span>;
  if (action === "REDUCED")  return <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 tracking-wide">REDUCED</span>;
  if (action === "RECOVERY") return <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-700 tracking-wide">RECOVERY</span>;
  return <span className="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-500 tracking-wide">{action}</span>;
}

function Sparkline({
  values,
  min,
  max,
  color,
  fillColor,
}: {
  values: (number | null)[];
  min: number;
  max: number;
  color: string;
  fillColor?: string;
}) {
  const W = 300;
  const H = 52;
  const range = Math.max(0.001, max - min);
  const validPts = values
    .map((v, i) => {
      if (v == null) return null;
      const x = (i / Math.max(1, values.length - 1)) * W;
      const y = H * 0.9 - ((v - min) / range) * H * 0.82;
      return { x, y, str: `${x.toFixed(1)},${y.toFixed(1)}` };
    })
    .filter((p): p is { x: number; y: number; str: string } => p !== null);

  if (validPts.length < 2) {
    return <span className="text-xs text-slate-300">—</span>;
  }

  const linePts = validPts.map((p) => p.str).join(" ");
  const first = validPts[0];
  const last = validPts[validPts.length - 1];
  const fillPath = fillColor
    ? `M${first.x.toFixed(1)},${H} ${linePts} L${last.x.toFixed(1)},${H} Z`
    : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {fillPath && (
        <path d={fillPath} fill={fillColor} opacity={0.15} />
      )}
      <polyline
        points={linePts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* last point dot */}
      <circle cx={last.x} cy={last.y} r="3" fill={color} />
    </svg>
  );
}

// ── KPI Tile ──────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div
        className="absolute inset-y-0 left-0 w-1 rounded-l-xl"
        style={{ background: accent }}
      />
      <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
        {label}
      </div>
      <div className="text-3xl font-bold tabular-nums text-slate-900 leading-none">
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-slate-400">{sub}</div>
    </div>
  );
}

// ── Spark Card ────────────────────────────────────────────────────────────────

function SparkCard({
  title,
  sub,
  values,
  min,
  max,
  color,
  current,
  currentLabel,
}: {
  title: string;
  sub: string;
  values: (number | null)[];
  min: number;
  max: number;
  color: string;
  current: string | null;
  currentLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 pt-4 pb-3">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {title}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
        </div>
        {current != null && (
          <div className="text-right">
            <div className="text-xl font-bold tabular-nums" style={{ color }}>
              {current}
            </div>
            {currentLabel && (
              <div className="text-[10px] text-slate-400">{currentLabel}</div>
            )}
          </div>
        )}
      </div>
      <Sparkline values={values} min={min} max={max} color={color} fillColor={color} />
    </div>
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

  const [players, setPlayers]       = useState<PlayerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [window, setWindow]         = useState<30 | 60 | 90>(30);
  const [loading, setLoading]       = useState(false);
  const [entries, setEntries]       = useState<DayEntry[]>([]);
  const [showTable, setShowTable]   = useState(false);
  const [showTrendHelp, setShowTrendHelp] = useState(false);
  const [playerTeams, setPlayerTeams] = useState<TeamMeta[]>([]);

  // Fetch player list
  useEffect(() => {
    if (!coachTeamId) return;
    supabase
      .from("players")
      .select("id, full_name, position")
      .eq("is_active", true)
      // Scope to the coach's own team — without this filter the list leaked
      // every active player across ALL teams into the Trends picker.
      .eq("team_id", coachTeamId)
      .order("full_name")
      .then(({ data }) => {
        const list = ((data ?? []) as Array<{ id: string; full_name: string; position: string | null }>)
          .map((p) => ({ player_id: p.id, full_name: p.full_name, position: p.position }));
        setPlayers(list);
        if (list.length > 0) setSelectedId(list[0].player_id);
      });
  }, [coachTeamId]);

  useEffect(() => {
    if (!selectedId && players.length > 0) setSelectedId(players[0].player_id);
  }, [players, selectedId]);

  // Fetch trend data
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
        .select("date, total_distance, total_player_load, source_team_id")
        .eq("player_id", selectedId)
        .gte("date", startDate)
        .lte("date", today)
        .order("date", { ascending: true }),

      // Fetch teams the player has any membership in — used to label load rows
      supabase
        .from("player_team_memberships")
        .select("team_id, teams(id, name, club_short_name, club_theme_color, team_type)")
        .eq("player_id", selectedId),
    ]).then(([readiness, decisions, gps, memberships]) => {
      if (!alive) return;

      const readMap = new Map<string, { total_score: number | null; training_modifier: unknown }>();
      ((readiness.data ?? []) as Array<{ entry_date: string; total_score: number | null; training_modifier: unknown }>)
        .forEach((r) => readMap.set(r.entry_date, r));

      const actionMap = new Map<string, string>();
      ((decisions.data ?? []) as Array<{ entry_date: string; training_action: string }>)
        .forEach((d) => actionMap.set(d.entry_date, d.training_action));

      const gpsMap = new Map<string, { total_distance: number | null; total_player_load: number | null; source_team_id: string | null }>();
      ((gps.data ?? []) as Array<{ date: string; total_distance: number | null; total_player_load: number | null; source_team_id: string | null }>)
        .forEach((g) => gpsMap.set(g.date, g));

      // Build a team lookup from the memberships query
      const teamMap = new Map<string, TeamMeta>();
      type MembershipRow = {
        team_id: string;
        teams: { id: string; name: string; club_short_name: string | null; club_theme_color: string | null; team_type: string | null } | null;
      };
      ((memberships.data ?? []) as unknown as MembershipRow[]).forEach((m) => {
        const t = Array.isArray(m.teams) ? m.teams[0] : m.teams;
        if (t) {
          teamMap.set(t.id, {
            id: t.id,
            name: t.name,
            short: t.club_short_name,
            color: t.club_theme_color,
            type: t.team_type,
          });
        }
      });

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
          const obj = tm as Record<string, unknown>;
          // Key is stored as baseline_z (primary), also check legacy keys
          const z =
            obj?.baseline_z ??
            obj?.z ??
            obj?.zScore ??
            obj?.z_score ??
            null;
          if (typeof z === "number" && Number.isFinite(z)) zScore = z;
        }

        const sourceTeam = g?.source_team_id ? teamMap.get(g.source_team_id) ?? null : null;

        result.push({
          date: dateStr,
          readinessScore: r?.total_score ?? null,
          zScore,
          sten: zScore != null ? zToSten(zScore) : null,
          trainingAction: actionMap.get(dateStr) ?? null,
          totalDistance: g?.total_distance ?? null,
          playerLoad: g?.total_player_load ?? null,
          sourceTeamId: g?.source_team_id ?? null,
          sourceTeamName: sourceTeam?.name ?? null,
          sourceTeamShort: sourceTeam?.short ?? null,
          sourceTeamColor: sourceTeam?.color ?? null,
        });

        cur.setUTCDate(cur.getUTCDate() + 1);
      }

      setEntries(result);
      setPlayerTeams(Array.from(teamMap.values()));
      setLoading(false);
    });

    return () => { alive = false; };
  }, [selectedId, window, today, coachTeamId]);

  // ── Derived stats ──────────────────────────────────────────────────────────

  const checkedIn     = entries.filter((e) => e.readinessScore != null);
  const stenEntries   = entries.filter((e) => e.sten != null);
  const avgReadiness  = checkedIn.length
    ? checkedIn.reduce((s, e) => s + (e.readinessScore ?? 0), 0) / checkedIn.length
    : null;
  const avgSten = stenEntries.length
    ? stenEntries.reduce((s, e) => s + (e.sten ?? 0), 0) / stenEntries.length
    : null;

  const daysRecovery  = entries.filter((e) => e.trainingAction === "RECOVERY").length;
  const daysReduced   = entries.filter((e) => e.trainingAction === "REDUCED").length;
  const checkInRate   = entries.length ? Math.round((checkedIn.length / entries.length) * 100) : 0;

  const readinessValues = entries.map((e) => e.readinessScore);
  const stenValues      = entries.map((e) => e.sten);
  const loadValues      = entries.map((e) => (isBasketball ? e.playerLoad : e.totalDistance));
  const maxLoad         = Math.max(1, ...loadValues.filter((v): v is number => v != null));

  // Latest non-null values for spark cards
  const latestRead  = [...checkedIn].pop()?.readinessScore ?? null;
  const latestSten  = [...stenEntries].pop()?.sten ?? null;
  const latestLoad  = [...loadValues].reverse().find((v): v is number => v != null) ?? null;

  // ── Trend verdict (recent half vs earlier half of the check-ins) ─────────────
  // Rules compute this; the card only explains it. Needs enough check-ins to be
  // meaningful — below that we show "not enough data" rather than a false trend.
  const trendSummary = (() => {
    const vals = checkedIn.map((e) => e.readinessScore as number);
    if (vals.length < 4) return null;
    const half = Math.floor(vals.length / 2);
    const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const earlierAvg = mean(vals.slice(0, half));
    const recentAvg = mean(vals.slice(half));
    const delta = recentAvg - earlierAvg;
    const dir: "up" | "down" | "flat" = delta > 1 ? "up" : delta < -1 ? "down" : "flat";
    return { earlierAvg, recentAvg, delta, dir, n: vals.length };
  })();
  const lowTrendConfidence = checkedIn.length < 8 || checkInRate < 50;

  const selectedPlayer = players.find((p) => p.player_id === selectedId);
  // Only show days that have at least one data point
  const tableEntries = [...entries]
    .reverse()
    .filter((e) =>
      e.readinessScore != null ||
      e.trainingAction != null ||
      e.totalDistance != null ||
      e.playerLoad != null
    );

  // Distinct source teams actually present in this window (for the legend)
  const sourceTeamsInWindow: TeamMeta[] = (() => {
    const seen = new Map<string, TeamMeta>();
    for (const e of entries) {
      if (e.sourceTeamId && !seen.has(e.sourceTeamId)) {
        const match = playerTeams.find((t) => t.id === e.sourceTeamId);
        if (match) seen.set(e.sourceTeamId, match);
      }
    }
    return Array.from(seen.values());
  })();

  // Active non-primary memberships to surface as a "currently with" indicator
  const otherMemberships = playerTeams.filter((t) => t.type === "national_team");

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
            {ct.player}
          </label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
          >
            {players.map((p) => (
              <option key={p.player_id} value={p.player_id}>
                {p.full_name}{p.position ? ` · ${p.position}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">
            {ct.period}
          </label>
          <div className="flex gap-1.5">
            {([30, 60, 90] as const).map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={`rounded-lg px-4 py-2 text-sm font-bold transition-all ${
                  window === w
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                    : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                {w}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-full border-2 border-indigo-300 border-t-indigo-600 animate-spin" />
            <span className="text-sm text-slate-400">{ct.loadingTrend}</span>
          </div>
        </div>
      ) : !selectedId ? (
        <div className="py-16 text-center text-sm text-slate-400">{ct.noPlayer}</div>
      ) : (
        <>
          {/* Verdict + plain "why" (explainability layers 0 + 1) */}
          {(() => {
            const firstName = selectedPlayer?.full_name?.split(" ")[0] ?? (lang === "IS" ? "Leikmaður" : "Player");
            const verdict = !trendSummary
              ? (lang === "IS" ? "Ekki nóg check-in til að meta þróun." : "Not enough check-ins to call a trend.")
              : trendSummary.dir === "up"
                ? (lang === "IS" ? `${firstName}: dagsform á uppleið síðustu ${window} daga.` : `${firstName}: readiness trending up over the last ${window} days.`)
                : trendSummary.dir === "down"
                  ? (lang === "IS" ? `${firstName}: dagsform á niðurleið síðustu ${window} daga.` : `${firstName}: readiness trending down over the last ${window} days.`)
                  : (lang === "IS" ? `${firstName}: dagsform stöðugt síðustu ${window} daga.` : `${firstName}: readiness steady over the last ${window} days.`);
            const badge = !trendSummary ? null
              : trendSummary.dir === "up" ? { txt: lang === "IS" ? "↑ Uppleið" : "↑ Up", cls: "bg-emerald-100 text-emerald-700" }
              : trendSummary.dir === "down" ? { txt: lang === "IS" ? "↓ Niðurleið" : "↓ Down", cls: "bg-amber-100 text-amber-700" }
              : { txt: lang === "IS" ? "→ Stöðugt" : "→ Steady", cls: "bg-slate-100 text-slate-600" };
            const stenNote = avgSten == null ? null
              : avgSten >= 6 ? (lang === "IS" ? "yfir eigin venju" : "above his own norm")
              : avgSten <= 5 ? (lang === "IS" ? "undir eigin venju" : "below his own norm")
              : (lang === "IS" ? "við eigin venju" : "at his own norm");
            return (
              <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold text-slate-900">{verdict}</div>
                    {trendSummary && (
                      <ul className="mt-1.5 space-y-0.5 text-sm text-slate-600">
                        <li>
                          {lang === "IS"
                            ? `Meðal readiness fór úr ${trendSummary.earlierAvg.toFixed(1)} í ${trendSummary.recentAvg.toFixed(1)} (${trendSummary.delta >= 0 ? "+" : ""}${trendSummary.delta.toFixed(1)}) af 25.`
                            : `Average readiness moved from ${trendSummary.earlierAvg.toFixed(1)} to ${trendSummary.recentAvg.toFixed(1)} (${trendSummary.delta >= 0 ? "+" : ""}${trendSummary.delta.toFixed(1)}) out of 25.`}
                        </li>
                        {stenNote && (
                          <li>
                            {lang === "IS"
                              ? `Form ${stenNote} (meðal STEN ${avgSten!.toFixed(1)}, venjulegt 5–6).`
                              : `Form ${stenNote} (avg STEN ${avgSten!.toFixed(1)}, normal is 5–6).`}
                          </li>
                        )}
                        <li>
                          {lang === "IS"
                            ? `Álag minnkað ${daysRecovery + daysReduced}× á tímabilinu (RECOVERY ${daysRecovery}, REDUCED ${daysReduced}).`
                            : `Load eased ${daysRecovery + daysReduced}× over the period (RECOVERY ${daysRecovery}, REDUCED ${daysReduced}).`}
                        </li>
                      </ul>
                    )}
                    <div className="mt-1.5 text-[11px] text-slate-400">
                      {lang === "IS"
                        ? `Byggt á ${checkedIn.length} check-in af ${entries.length} dögum (${checkInRate}%)`
                        : `Based on ${checkedIn.length} check-ins across ${entries.length} days (${checkInRate}%)`}
                      {trendSummary && lowTrendConfidence ? (lang === "IS" ? " · lítið öryggi" : " · low confidence") : ""}
                    </div>
                  </div>
                  {badge && <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.cls}`}>{badge.txt}</span>}
                </div>

                {/* Layer 2 — what the numbers mean + provenance */}
                <div className="mt-3 border-t border-slate-100 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTrendHelp((v) => !v)}
                    className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    {showTrendHelp
                      ? (lang === "IS" ? "Fela: hvað þýða þessar tölur? ▲" : "Hide: what do these numbers mean? ▲")
                      : (lang === "IS" ? "Hvað þýða þessar tölur? ▼" : "What do these numbers mean? ▼")}
                  </button>
                  {showTrendHelp && (
                    <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-600">
                      <p><span className="font-semibold">Readiness (0–25): </span>{lang === "IS" ? "heildar dagsform úr morgun-check-in (svefn, þreyta, eymsli, skap, streita)." : "overall daily readiness from the morning check-in (sleep, fatigue, soreness, mood, stress)."}</p>
                      <p><span className="font-semibold">STEN (1–10): </span>{lang === "IS" ? "stöðluð einkunn miðað við HANS eigin grunnlínu — 5–6 = venjulegt, hærra = ferskari en vanalega, lægra = þreyttari." : "a standardised score against HIS own baseline — 5–6 = usual, higher = fresher than normal, lower = more fatigued."}</p>
                      <p><span className="font-semibold">{lang === "IS" ? "Þróun: " : "Trend: "}</span>{lang === "IS" ? "berum saman meðal-readiness í seinni helmingi tímabilsins við þann fyrri; munur yfir 1 stig = upp/niður, annars stöðugt." : "compares average readiness in the recent half of the window to the earlier half; a gap over 1 point = up/down, otherwise steady."}</p>
                      <p><span className="font-semibold">RECOVERY / REDUCED: </span>{lang === "IS" ? "dagar þar sem kerfið mælti með minnkuðu álagi." : "days the system recommended easing the load."}</p>
                      <p>{lang === "IS" ? "Af hverju þetta skiptir máli: þróun segir meira en einn dagur — hægt fallandi dagsform eða mörg REDUCED benda á uppsafnaða þreytu. Heimildir: Gabbett 2016, Buchheit 2014 (dagleg vöktun), Saw o.fl. 2016 (sjálfskráð líðan)." : "Why it matters: a trend says more than a single day — slowly falling readiness or many REDUCED days flag accumulating fatigue. Sources: Gabbett 2016, Buchheit 2014 (daily monitoring), Saw et al. 2016 (self-report wellness)."}</p>
                      <p className="text-slate-400">{lang === "IS" ? "Reglur reikna þetta úr check-in og GPS gögnum — engin gervigreind." : "Rules compute this from check-in and GPS data — no AI."}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <KpiTile
              label={ct.avgReadiness}
              value={avgReadiness != null ? avgReadiness.toFixed(1) : "—"}
              sub={ct.outOf}
              accent="#6366f1"
            />
            <KpiTile
              label={ct.avgSten}
              value={avgSten != null ? avgSten.toFixed(1) : "—"}
              sub={ct.outOf10}
              accent={stenColor(avgSten != null ? Math.round(avgSten) : null)}
            />
            <KpiTile
              label={ct.checkInRate}
              value={`${checkInRate}%`}
              sub={`${checkedIn.length} / ${entries.length} ${ct.days}`}
              accent="#0ea5e9"
            />
            <KpiTile
              label={ct.daysRecovery}
              value={String(daysRecovery)}
              sub={ct.days}
              accent="#b34a30"
            />
            <KpiTile
              label={ct.daysReduced}
              value={String(daysReduced)}
              sub={ct.days}
              accent="#cb8420"
            />
          </div>

          {/* Source teams legend — shows which teams contributed load data */}
          {(sourceTeamsInWindow.length > 1 || otherMemberships.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                {lang === "IS" ? "Uppruni álags" : "Load source"}
              </span>
              {sourceTeamsInWindow.map((t) => (
                <SourceTeamBadge key={t.id} team={t} />
              ))}
              {otherMemberships.length > 0 && sourceTeamsInWindow.every((s) => s.type !== "national_team") && (
                <>
                  <span className="text-[11px] text-slate-300 px-1">·</span>
                  <span className="text-[11px] text-slate-400">
                    {lang === "IS" ? "Núverandi í" : "Currently with"}
                  </span>
                  {otherMemberships.map((t) => (
                    <SourceTeamBadge key={`m-${t.id}`} team={t} />
                  ))}
                </>
              )}
            </div>
          )}

          {/* Spark charts */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SparkCard
              title={ct.sparkReadiness}
              sub={ct.sparkReadSub(window)}
              values={readinessValues}
              min={0}
              max={25}
              color="#6366f1"
              current={latestRead != null ? String(latestRead) : null}
              currentLabel="síðast"
            />
            <SparkCard
              title={ct.sparkSten}
              sub={ct.sparkStenSub}
              values={stenValues}
              min={1}
              max={10}
              color={stenColor(latestSten)}
              current={latestSten != null ? String(latestSten) : null}
              currentLabel="síðast"
            />
            <SparkCard
              title={isBasketball ? ct.playerLoad : ct.totalDist}
              sub={ct.sparkGpsSub}
              values={loadValues}
              min={0}
              max={maxLoad}
              color="#cb8420"
              current={
                latestLoad != null
                  ? isBasketball
                    ? latestLoad.toFixed(1)
                    : Math.round(latestLoad).toLocaleString()
                  : null
              }
              currentLabel="síðast"
            />
          </div>

          {/* Daily history — collapsible */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <button
              onClick={() => setShowTable((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/60 transition-colors"
            >
              <div className="text-left">
                <div className="font-semibold text-slate-900 text-sm tracking-wide">
                  {selectedPlayer?.full_name?.toUpperCase()} · {ct.dailyHistory.toUpperCase()}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{ct.historyDesc(window)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-400 bg-slate-100 rounded-full px-3 py-1">
                  {ct.checkinOf(checkedIn.length, entries.length)}
                </span>
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform ${showTable ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {showTable && (
            <div className="border-t border-slate-100">
              <div className="overflow-x-auto">
              <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-5 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{ct.date}</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{ct.readiness}</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">STEN</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{ct.decision}</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {isBasketball ? ct.playerLoad : ct.dist}
                    </th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {lang === "IS" ? "Lið" : "Team"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tableEntries.map((e) => {
                    const loadVal = isBasketball ? e.playerLoad : e.totalDistance;
                    const sc = stenChip(e.sten);

                    return (
                      <tr
                        key={e.date}
                        className="border-t border-slate-100 hover:bg-slate-50/70 transition-colors"
                      >
                        <td className="px-5 py-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-800 text-sm">{e.date}</div>
                          <div className="text-[11px] text-slate-400">
                            {new Date(`${e.date}T00:00:00.000Z`).toLocaleDateString(ct.locale, { weekday: "long" })}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {e.readinessScore != null ? (
                            <span className="font-bold text-slate-800 text-base">{e.readinessScore}</span>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {e.sten != null ? (
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${sc}`}>
                              {e.sten}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <ActionChip action={e.trainingAction} />
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-600 text-sm">
                          {loadVal != null ? (
                            isBasketball
                              ? loadVal.toFixed(1)
                              : Math.round(loadVal).toLocaleString()
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {e.sourceTeamName ? (
                            <SourceTeamBadge
                              team={{
                                name: e.sourceTeamName,
                                short: e.sourceTeamShort,
                                color: e.sourceTeamColor,
                              }}
                            />
                          ) : (
                            <span className="text-slate-300 text-sm">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              </div>
            </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
