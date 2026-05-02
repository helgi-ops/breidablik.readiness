"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { downloadReportPdf } from "./ReportPdf";
import type { PdfRenderModel } from "@/lib/micropulse/reporting";

// ── Types ────────────────────────────────────────────────────────────

type ReportTab = "daily" | "weekly";

type PlayerRow = {
  player_id: string;
  full_name: string;
  total_score: number | null;
  final_color: string | null;
  fatigue_energy: number | null;
  sleep_quality: number | null;
  stress_mood: number | null;
  muscle_soreness: number | null;
  sleep_duration: number | null;
  training_modifier: unknown;
  computed_auto_flag: string | null;
};

type DailyData = {
  rows: PlayerRow[];
  rosterCount: number;
};

type WeeklyDay = {
  date: string;
  checkedIn: number;
  roster: number;
  green: number;
  yellow: number;
  red: number;
  avgScore: number | null;
};

// ── Helpers ──────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function weekDates(monday: string): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(`${monday}T00:00:00`);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function weekdayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("is-IS", { weekday: "short" });
}

function colorClass(color: string | null): string {
  const c = (color ?? "").toLowerCase();
  if (c === "green") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (c === "yellow") return "bg-amber-100 text-amber-800 border-amber-200";
  if (c === "red") return "bg-red-100 text-red-800 border-red-200";
  return "bg-zinc-100 text-zinc-600 border-zinc-200";
}

function colorDot(color: string | null): string {
  const c = (color ?? "").toLowerCase();
  if (c === "green") return "bg-emerald-500";
  if (c === "yellow") return "bg-amber-500";
  if (c === "red") return "bg-red-500";
  return "bg-zinc-300";
}

function flagLabel(color: string | null): string {
  const c = (color ?? "").toLowerCase();
  if (c === "green") return "Grænn";
  if (c === "yellow") return "Gulur";
  if (c === "red") return "Rauður";
  return "—";
}

// ── Component ────────────────────────────────────────────────────────

export default function ReportingCenterPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [tab, setTab] = useState<ReportTab>("daily");
  const [date, setDate] = useState(todayISO());
  const [weekStart, setWeekStart] = useState(mondayOf(todayISO()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);

  // Daily data
  const [dailyData, setDailyData] = useState<DailyData | null>(null);

  // Weekly data
  const [weeklyDays, setWeeklyDays] = useState<WeeklyDay[]>([]);
  const [weeklyAttention, setWeeklyAttention] = useState<Array<{ name: string; yellowDays: number; redDays: number }>>([]);

  // ── Load daily ──────────────────────────────────────────────────────

  async function loadDaily(targetDate: string) {
    setLoading(true);
    setError("");
    try {
      const { data: rows, error: qErr } = await supabase
        .from("v_coach_readiness_today_v8")
        .select("player_id, full_name, total_score, final_color, fatigue_energy, sleep_quality, stress_mood, muscle_soreness, sleep_duration")
        .eq("entry_date", targetDate)
        .order("total_score", { ascending: true })
        .order("full_name", { ascending: true });

      if (qErr) throw new Error(qErr.message);

      // Get roster count (all active players)
      const { count } = await supabase
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");

      setDailyData({
        rows: (rows ?? []) as PlayerRow[],
        rosterCount: count ?? (rows ?? []).length,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Villa við að sækja gögn");
      setDailyData(null);
    } finally {
      setLoading(false);
    }
  }

  // ── Load weekly ─────────────────────────────────────────────────────

  async function loadWeekly(monday: string) {
    setLoading(true);
    setError("");
    try {
      const dates = weekDates(monday);
      const lastDate = dates[dates.length - 1];

      const { data: rows, error: qErr } = await supabase
        .from("v_coach_readiness_today_v8")
        .select("player_id, full_name, entry_date, total_score, final_color")
        .gte("entry_date", monday)
        .lte("entry_date", lastDate)
        .order("entry_date", { ascending: true });

      if (qErr) throw new Error(qErr.message);

      const { count } = await supabase
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");

      const roster = count ?? 0;
      const allRows = (rows ?? []) as Array<{ player_id: string; full_name: string; entry_date: string; total_score: number | null; final_color: string | null }>;

      // Build daily summaries
      const days: WeeklyDay[] = dates.map((d) => {
        const dayRows = allRows.filter((r) => r.entry_date === d);
        const scores = dayRows.map((r) => r.total_score).filter((s): s is number => s != null);
        return {
          date: d,
          checkedIn: dayRows.length,
          roster,
          green: dayRows.filter((r) => (r.final_color ?? "").toLowerCase() === "green").length,
          yellow: dayRows.filter((r) => (r.final_color ?? "").toLowerCase() === "yellow").length,
          red: dayRows.filter((r) => (r.final_color ?? "").toLowerCase() === "red").length,
          avgScore: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
        };
      });
      setWeeklyDays(days);

      // Attention: players with most yellow/red days
      const playerMap = new Map<string, { name: string; yellowDays: number; redDays: number }>();
      for (const r of allRows) {
        const c = (r.final_color ?? "").toLowerCase();
        if (c !== "yellow" && c !== "red") continue;
        const existing = playerMap.get(r.player_id) ?? { name: r.full_name, yellowDays: 0, redDays: 0 };
        if (c === "yellow") existing.yellowDays++;
        if (c === "red") existing.redDays++;
        playerMap.set(r.player_id, existing);
      }
      const attention = Array.from(playerMap.values())
        .sort((a, b) => (b.redDays + b.yellowDays) - (a.redDays + a.yellowDays))
        .slice(0, 10);
      setWeeklyAttention(attention);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Villa við að sækja gögn");
      setWeeklyDays([]);
      setWeeklyAttention([]);
    } finally {
      setLoading(false);
    }
  }

  // ── Auto-load on tab/date change ────────────────────────────────────

  useEffect(() => {
    if (tab === "daily") void loadDaily(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, date]);

  useEffect(() => {
    if (tab === "weekly") void loadWeekly(weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, weekStart]);

  // ── PDF builders ────────────────────────────────────────────────────

  function buildDailyPdfModel(): PdfRenderModel | null {
    if (!dailyData) return null;
    const { rows, rosterCount } = dailyData;
    const green = rows.filter((r) => (r.final_color ?? "").toLowerCase() === "green").length;
    const yellow = rows.filter((r) => (r.final_color ?? "").toLowerCase() === "yellow").length;
    const red = rows.filter((r) => (r.final_color ?? "").toLowerCase() === "red").length;
    const scores = rows.map((r) => r.total_score).filter((s): s is number => s != null);
    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";

    return {
      title: `Dagsskýrsla — ${date}`,
      subtitle: "Readiness yfirlit",
      generatedAt: new Date().toISOString(),
      summaryLine: `${rows.length} af ${rosterCount} leikmönnum checkuðu inn. Meðalskor: ${avg}. Grænir: ${green}, Gulir: ${yellow}, Rauðir: ${red}.`,
      sections: [
        {
          title: "Yfirlit",
          kind: "METRIC_GRID",
          rows: [
            { label: "Checkuðu inn", value: `${rows.length}/${rosterCount}` },
            { label: "Meðalskor", value: avg },
            { label: "Grænir", value: green },
            { label: "Gulir", value: yellow },
            { label: "Rauðir", value: red },
            { label: "Completion", value: rosterCount > 0 ? `${Math.round((rows.length / rosterCount) * 100)}%` : "—" },
          ],
        },
        {
          title: "Leikmenn",
          kind: "TABLE",
          rows: rows.map((r) => ({
            Nafn: r.full_name,
            Skor: r.total_score ?? "—",
            Staða: flagLabel(r.final_color),
            Orka: r.fatigue_energy ?? "—",
            Svefn: r.sleep_quality ?? "—",
            Stress: r.stress_mood ?? "—",
            Vöðvar: r.muscle_soreness ?? "—",
          })),
        },
        ...(yellow + red > 0
          ? [
              {
                title: "Þarfnast athygli",
                kind: "LIST" as const,
                text: rows
                  .filter((r) => {
                    const c = (r.final_color ?? "").toLowerCase();
                    return c === "yellow" || c === "red";
                  })
                  .map((r) => `${r.full_name} — ${flagLabel(r.final_color)} (skor: ${r.total_score ?? "—"})`),
              },
            ]
          : []),
      ],
      footerNote: "MicroPulse Readiness · Breiðablik",
    };
  }

  function buildWeeklyPdfModel(): PdfRenderModel | null {
    if (!weeklyDays.length) return null;
    const totalCheckins = weeklyDays.reduce((s, d) => s + d.checkedIn, 0);
    const totalGreen = weeklyDays.reduce((s, d) => s + d.green, 0);
    const totalYellow = weeklyDays.reduce((s, d) => s + d.yellow, 0);
    const totalRed = weeklyDays.reduce((s, d) => s + d.red, 0);
    const avgScores = weeklyDays.map((d) => d.avgScore).filter((s): s is number => s != null);
    const weekAvg = avgScores.length ? (avgScores.reduce((a, b) => a + b, 0) / avgScores.length).toFixed(1) : "—";
    const endDate = weeklyDays[weeklyDays.length - 1]?.date ?? weekStart;

    return {
      title: `Vikuskýrsla — ${weekStart} til ${endDate}`,
      subtitle: "Readiness vikulegt yfirlit",
      generatedAt: new Date().toISOString(),
      summaryLine: `${totalCheckins} checkins á vikunni. Meðalskor: ${weekAvg}. Grænir: ${totalGreen}, Gulir: ${totalYellow}, Rauðir: ${totalRed}.`,
      sections: [
        {
          title: "Yfirlit",
          kind: "METRIC_GRID",
          rows: [
            { label: "Checkins (vika)", value: totalCheckins },
            { label: "Meðalskor", value: weekAvg },
            { label: "Grænir", value: totalGreen },
            { label: "Gulir", value: totalYellow },
            { label: "Rauðir", value: totalRed },
          ],
        },
        {
          title: "Dagleg dreifing",
          kind: "TABLE",
          rows: weeklyDays.map((d) => ({
            Dagur: `${weekdayLabel(d.date)} ${d.date.slice(5)}`,
            Checkins: `${d.checkedIn}/${d.roster}`,
            Meðalskor: d.avgScore ?? "—",
            Grænir: d.green,
            Gulir: d.yellow,
            Rauðir: d.red,
          })),
        },
        ...(weeklyAttention.length > 0
          ? [
              {
                title: "Þarfnast athygli",
                kind: "LIST" as const,
                text: weeklyAttention.map(
                  (p) =>
                    `${p.name} — ${p.redDays > 0 ? `${p.redDays} rauðir dagar` : ""}${p.redDays > 0 && p.yellowDays > 0 ? ", " : ""}${p.yellowDays > 0 ? `${p.yellowDays} gulir dagar` : ""}`,
                ),
              },
            ]
          : []),
      ],
      footerNote: "MicroPulse Readiness · Breiðablik",
    };
  }

  async function handleDownloadPdf() {
    setPdfLoading(true);
    try {
      const model = tab === "daily" ? buildDailyPdfModel() : buildWeeklyPdfModel();
      if (!model) return;
      const filename = tab === "daily" ? `dagsskyrsla-${date}.pdf` : `vikuskyrsla-${weekStart}.pdf`;
      await downloadReportPdf(model, filename);
    } catch (e) {
      console.error("PDF error:", e);
      setError("Villa við að búa til PDF");
    } finally {
      setPdfLoading(false);
    }
  }

  // ── Daily stats ─────────────────────────────────────────────────────

  const dailyStats = useMemo(() => {
    if (!dailyData) return null;
    const { rows, rosterCount } = dailyData;
    const green = rows.filter((r) => (r.final_color ?? "").toLowerCase() === "green").length;
    const yellow = rows.filter((r) => (r.final_color ?? "").toLowerCase() === "yellow").length;
    const red = rows.filter((r) => (r.final_color ?? "").toLowerCase() === "red").length;
    const scores = rows.map((r) => r.total_score).filter((s): s is number => s != null);
    const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
    return { green, yellow, red, avg, checkedIn: rows.length, rosterCount };
  }, [dailyData]);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Skýrslur</h1>
        <p className="text-sm text-zinc-500">Readiness yfirlit og PDF útflutningur</p>
      </div>

      {/* Tab toggle + date picker + download */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center rounded-lg border border-zinc-200 bg-white p-0.5">
          <button
            onClick={() => setTab("daily")}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${tab === "daily" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-700"}`}
          >
            Dagsskýrsla
          </button>
          <button
            onClick={() => setTab("weekly")}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${tab === "weekly" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-700"}`}
          >
            Vikuskýrsla
          </button>
        </div>

        {tab === "daily" ? (
          <input
            type="date"
            value={date}
            onChange={(e) => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDate(e.target.value);
            }}
            className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm"
          />
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const d = new Date(`${weekStart}T00:00:00`);
                d.setDate(d.getDate() - 7);
                setWeekStart(d.toISOString().slice(0, 10));
              }}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50"
            >
              ←
            </button>
            <span className="text-sm font-medium text-zinc-700">
              Vika {weekStart.slice(5)}
            </span>
            <button
              onClick={() => {
                const d = new Date(`${weekStart}T00:00:00`);
                d.setDate(d.getDate() + 7);
                if (d.toISOString().slice(0, 10) <= todayISO()) setWeekStart(d.toISOString().slice(0, 10));
              }}
              disabled={(() => {
                const d = new Date(`${weekStart}T00:00:00`);
                d.setDate(d.getDate() + 7);
                return d.toISOString().slice(0, 10) > todayISO();
              })()}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50 disabled:opacity-30"
            >
              →
            </button>
          </div>
        )}

        <button
          onClick={handleDownloadPdf}
          disabled={loading || pdfLoading || (tab === "daily" ? !dailyData?.rows.length : !weeklyDays.length)}
          className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {pdfLoading ? "Bý til PDF..." : "Sækja PDF"}
        </button>
      </div>

      {/* Error */}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
        </div>
      )}

      {/* ── DAILY TAB ────────────────────────────────────────────────── */}
      {tab === "daily" && !loading && dailyData && (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Checkuðu inn" value={`${dailyStats?.checkedIn ?? 0}/${dailyStats?.rosterCount ?? 0}`} />
            <StatCard label="Meðalskor" value={dailyStats?.avg ?? "—"} />
            <StatCard label="Grænir" value={dailyStats?.green ?? 0} accent="emerald" />
            <StatCard label="Gulir" value={dailyStats?.yellow ?? 0} accent="amber" />
            <StatCard label="Rauðir" value={dailyStats?.red ?? 0} accent="red" />
            <StatCard
              label="Completion"
              value={
                dailyStats && dailyStats.rosterCount > 0
                  ? `${Math.round((dailyStats.checkedIn / dailyStats.rosterCount) * 100)}%`
                  : "—"
              }
            />
          </div>

          {/* Color bar */}
          {dailyStats && dailyStats.checkedIn > 0 && (
            <div className="flex h-3 overflow-hidden rounded-full">
              {dailyStats.green > 0 && (
                <div className="bg-emerald-500" style={{ width: `${(dailyStats.green / dailyStats.checkedIn) * 100}%` }} />
              )}
              {dailyStats.yellow > 0 && (
                <div className="bg-amber-400" style={{ width: `${(dailyStats.yellow / dailyStats.checkedIn) * 100}%` }} />
              )}
              {dailyStats.red > 0 && (
                <div className="bg-red-500" style={{ width: `${(dailyStats.red / dailyStats.checkedIn) * 100}%` }} />
              )}
              {dailyStats.checkedIn < (dailyStats.green + dailyStats.yellow + dailyStats.red + 1) ? null : (
                <div className="bg-zinc-200 flex-1" />
              )}
            </div>
          )}

          {/* Player table */}
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <div className="p-4">
              <div className="text-sm font-semibold text-zinc-800">Leikmenn — {date}</div>
            </div>
            {dailyData.rows.length === 0 ? (
              <div className="px-4 pb-4 text-sm text-zinc-500">Engin gögn fyrir valda dagsetningu.</div>
            ) : (
              <div className="max-h-[500px] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-t border-b border-zinc-100 bg-zinc-50 text-left text-xs text-zinc-500">
                      <th className="py-2 pl-4 pr-2 font-medium">Nafn</th>
                      <th className="py-2 px-2 font-medium">Skor</th>
                      <th className="py-2 px-2 font-medium">Staða</th>
                      <th className="py-2 px-2 font-medium">Orka</th>
                      <th className="py-2 px-2 font-medium">Svefn</th>
                      <th className="py-2 px-2 font-medium">Stress</th>
                      <th className="py-2 px-2 pr-4 font-medium">Vöðvar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyData.rows.map((row) => (
                      <tr key={row.player_id} className="border-t border-zinc-100 hover:bg-zinc-50/50">
                        <td className="py-2 pl-4 pr-2 font-medium text-zinc-800">{row.full_name}</td>
                        <td className="py-2 px-2 tabular-nums text-zinc-700">{row.total_score ?? "—"}</td>
                        <td className="py-2 px-2">
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${colorDot(row.final_color)}`} />
                            <span className="text-xs font-medium text-zinc-600">{flagLabel(row.final_color)}</span>
                          </span>
                        </td>
                        <td className="py-2 px-2 tabular-nums text-zinc-600">{row.fatigue_energy ?? "—"}</td>
                        <td className="py-2 px-2 tabular-nums text-zinc-600">{row.sleep_quality ?? "—"}</td>
                        <td className="py-2 px-2 tabular-nums text-zinc-600">{row.stress_mood ?? "—"}</td>
                        <td className="py-2 px-2 pr-4 tabular-nums text-zinc-600">{row.muscle_soreness ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Attention list */}
          {dailyData.rows.filter((r) => {
            const c = (r.final_color ?? "").toLowerCase();
            return c === "yellow" || c === "red";
          }).length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
              <div className="text-sm font-semibold text-amber-900 mb-2">Þarfnast athygli</div>
              <div className="space-y-1.5">
                {dailyData.rows
                  .filter((r) => {
                    const c = (r.final_color ?? "").toLowerCase();
                    return c === "yellow" || c === "red";
                  })
                  .map((r) => (
                    <div key={r.player_id} className="flex items-center gap-2 text-sm">
                      <span className={`h-2 w-2 rounded-full ${colorDot(r.final_color)}`} />
                      <span className="font-medium text-zinc-800">{r.full_name}</span>
                      <span className="text-zinc-500">— skor {r.total_score ?? "—"}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── WEEKLY TAB ───────────────────────────────────────────────── */}
      {tab === "weekly" && !loading && weeklyDays.length > 0 && (
        <>
          {/* Weekly stats */}
          {(() => {
            const totalCheckins = weeklyDays.reduce((s, d) => s + d.checkedIn, 0);
            const totalGreen = weeklyDays.reduce((s, d) => s + d.green, 0);
            const totalYellow = weeklyDays.reduce((s, d) => s + d.yellow, 0);
            const totalRed = weeklyDays.reduce((s, d) => s + d.red, 0);
            const avgScores = weeklyDays.map((d) => d.avgScore).filter((s): s is number => s != null);
            const weekAvg = avgScores.length ? (avgScores.reduce((a, b) => a + b, 0) / avgScores.length).toFixed(1) : "—";
            return (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <StatCard label="Checkins (vika)" value={totalCheckins} />
                <StatCard label="Meðalskor" value={weekAvg} />
                <StatCard label="Grænir" value={totalGreen} accent="emerald" />
                <StatCard label="Gulir" value={totalYellow} accent="amber" />
                <StatCard label="Rauðir" value={totalRed} accent="red" />
              </div>
            );
          })()}

          {/* Day-by-day bar chart */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-zinc-800 mb-3">Dagleg dreifing</div>
            <div className="space-y-2">
              {weeklyDays.map((d) => {
                const total = d.green + d.yellow + d.red;
                return (
                  <div key={d.date} className="flex items-center gap-3">
                    <div className="w-16 text-xs font-medium text-zinc-600 shrink-0">
                      {weekdayLabel(d.date)} {d.date.slice(8)}
                    </div>
                    <div className="flex-1">
                      {total > 0 ? (
                        <div className="flex h-5 overflow-hidden rounded-md">
                          {d.green > 0 && (
                            <div
                              className="bg-emerald-500 flex items-center justify-center text-[9px] font-bold text-white"
                              style={{ width: `${(d.green / total) * 100}%` }}
                            >
                              {d.green}
                            </div>
                          )}
                          {d.yellow > 0 && (
                            <div
                              className="bg-amber-400 flex items-center justify-center text-[9px] font-bold text-white"
                              style={{ width: `${(d.yellow / total) * 100}%` }}
                            >
                              {d.yellow}
                            </div>
                          )}
                          {d.red > 0 && (
                            <div
                              className="bg-red-500 flex items-center justify-center text-[9px] font-bold text-white"
                              style={{ width: `${(d.red / total) * 100}%` }}
                            >
                              {d.red}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="h-5 rounded-md bg-zinc-100 flex items-center px-2 text-[10px] text-zinc-400">
                          Engin gögn
                        </div>
                      )}
                    </div>
                    <div className="w-12 text-right text-xs tabular-nums text-zinc-500">
                      {d.checkedIn}/{d.roster}
                    </div>
                    <div className="w-10 text-right text-xs tabular-nums text-zinc-500">
                      {d.avgScore ?? "—"}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-400">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Grænir</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Gulir</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Rauðir</span>
              <span className="ml-auto">Checkins · Meðalskor</span>
            </div>
          </div>

          {/* Attention */}
          {weeklyAttention.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
              <div className="text-sm font-semibold text-amber-900 mb-2">Þarfnast athygli á vikunni</div>
              <div className="space-y-1.5">
                {weeklyAttention.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className={`h-2 w-2 rounded-full ${p.redDays > 0 ? "bg-red-500" : "bg-amber-500"}`} />
                    <span className="font-medium text-zinc-800">{p.name}</span>
                    <span className="text-zinc-500">
                      — {p.redDays > 0 ? `${p.redDays} rauðir` : ""}{p.redDays > 0 && p.yellowDays > 0 ? ", " : ""}{p.yellowDays > 0 ? `${p.yellowDays} gulir` : ""} dagar
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "weekly" && !loading && weeklyDays.length === 0 && !error && (
        <div className="py-12 text-center text-sm text-zinc-500">Engin gögn fyrir valda viku.</div>
      )}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: "emerald" | "amber" | "red" }) {
  const borderColor = accent === "emerald" ? "border-emerald-200" : accent === "amber" ? "border-amber-200" : accent === "red" ? "border-red-200" : "border-zinc-200";
  const bgColor = accent === "emerald" ? "bg-emerald-50" : accent === "amber" ? "bg-amber-50" : accent === "red" ? "bg-red-50" : "bg-white";
  const textColor = accent === "emerald" ? "text-emerald-800" : accent === "amber" ? "text-amber-800" : accent === "red" ? "text-red-800" : "text-zinc-900";
  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-3`}>
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${textColor}`}>{value}</div>
    </div>
  );
}
