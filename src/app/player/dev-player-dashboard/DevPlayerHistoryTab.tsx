"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ── Types ───────────────────────────────────────────────────────────────────

type DailyPoint = {
  date: string;
  checkInScore: number | null;
  soreness: number | null;
  sleepQuality: number | null;
  energy: number | null;
  mood: number | null;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Normalise check-in: 0..25 → 0..100
function normCI(v: number | null): number | null {
  if (v == null) return null;
  return Math.max(0, Math.min(100, (v / 25) * 100));
}
// Normalise soreness: 1..5 inverted → 0..100 (high soreness = bad = low score)
function normSor(v: number | null): number | null {
  if (v == null) return null;
  return Math.max(0, Math.min(100, ((5 - v) / 4) * 100));
}
// Normalise sleep: 1..5 → 0..100
function normSleep(v: number | null): number | null {
  if (v == null) return null;
  return Math.max(0, Math.min(100, ((v - 1) / 4) * 100));
}
// Normalise energy: 1..5 → 0..100
function normEnergy(v: number | null): number | null {
  if (v == null) return null;
  return Math.max(0, Math.min(100, ((v - 1) / 4) * 100));
}

function flagColor(v: number | null): string {
  if (v == null) return "#94A3B8";
  if (v < 33) return "#EF4444";
  if (v < 60) return "#F59E0B";
  return "#22C55E";
}

// ── SVG chart helpers ────────────────────────────────────────────────────────

const W = 640, H = 220;
const PAD = { top: 16, right: 48, bottom: 32, left: 38 };
const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top - PAD.bottom;

function toX(idx: number, total: number): number {
  if (total <= 1) return PAD.left + innerW / 2;
  return PAD.left + (idx / (total - 1)) * innerW;
}
function toY(val: number): number {
  const t = (val - 0) / (100 - 0);
  return PAD.top + (1 - t) * innerH;
}
function buildPath(pts: Array<{ x: number; y: number } | null>): string {
  let d = "";
  for (const pt of pts) {
    if (!pt) { d += " "; continue; }
    d += d.trim() ? ` L${pt.x.toFixed(1)},${pt.y.toFixed(1)}` : `M${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
  }
  return d.trim();
}

const SERIES = [
  { key: "ci",    label: "Check-in",  color: "#3B82F6", fn: (p: DailyPoint) => normCI(p.checkInScore) },
  { key: "sor",   label: "Þreyta",    color: "#F97316", fn: (p: DailyPoint) => normSor(p.soreness) },
  { key: "sleep", label: "Svefn",     color: "#14B8A6", fn: (p: DailyPoint) => normSleep(p.sleepQuality) },
  { key: "energy",label: "Orka",      color: "#8B5CF6", fn: (p: DailyPoint) => normEnergy(p.energy) },
] as const;

const Y_LABELS = [
  { val: 100, label: "100" },
  { val: 50,  label: "50"  },
  { val: 0,   label: "0"   },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function DevPlayerHistoryTab() {
  const [points, setPoints] = useState<DailyPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;
        if (!userId) throw new Error("Not authenticated");

        const { data: prof } = await supabase
          .from("profiles")
          .select("player_id")
          .eq("id", userId)
          .maybeSingle();

        const playerId = (prof as any)?.player_id;
        if (!playerId) throw new Error("No player profile linked");

        const startDate = isoMinus(9); // last 10 days (today + 9 back)
        const endDate = todayISO();

        const { data, error: qErr } = await supabase
          .from("readiness_entries")
          .select("entry_date, total_score, muscle_soreness, sleep_quality, fatigue_energy, stress_mood")
          .eq("player_id", playerId)
          .gte("entry_date", startDate)
          .lte("entry_date", endDate)
          .order("entry_date", { ascending: true });

        if (qErr) throw qErr;

        if (!alive) return;
        setPoints(
          (data ?? []).map((r: any) => ({
            date: String(r.entry_date ?? "").slice(0, 10),
            checkInScore: toNum(r.total_score),
            soreness: toNum(r.muscle_soreness),
            sleepQuality: toNum(r.sleep_quality),
            energy: toNum(r.fatigue_energy),
            mood: toNum(r.stress_mood),
          }))
        );
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not load history.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  const today = todayISO();

  // Compute composite score (average of available normalised metrics)
  function composite(p: DailyPoint): number | null {
    const vals = [normCI(p.checkInScore), normSor(p.soreness), normSleep(p.sleepQuality), normEnergy(p.energy)].filter((v): v is number => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }

  const latestPoint = points[points.length - 1] ?? null;
  const latestComp = latestPoint ? composite(latestPoint) : null;

  // Volatility = std dev of check-in scores
  const ciVals = points.map((p) => p.checkInScore).filter((v): v is number => v != null);
  const ciMean = ciVals.length ? ciVals.reduce((s, v) => s + v, 0) / ciVals.length : null;
  const ciStd = ciMean != null && ciVals.length > 1
    ? Math.sqrt(ciVals.map((v) => (v - ciMean) ** 2).reduce((s, v) => s + v, 0) / ciVals.length)
    : null;
  const volLevel = ciStd == null ? null : ciStd > 5 ? "HIGH" : ciStd > 2.5 ? "MODERATE" : "LOW";

  // X ticks: show at most 5
  const total = points.length;
  const xTickStep = Math.max(1, Math.ceil(total / 5));
  const xTicks = points
    .map((p, i) => ({ lbl: shortDate(p.date), x: toX(i, total) }))
    .filter((_, i) => i % xTickStep === 0 || i === total - 1);

  return (
    <div className="py-4">
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="p-4 sm:p-5">

          {/* Header */}
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Saga</div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-zinc-900">Readiness History</div>
              <div className="text-sm text-zinc-500">Síðustu 10 dagar · Check-in · Þreyta · Svefn · Orka</div>
            </div>
            {!loading && latestComp != null && (
              <div className="flex flex-col items-end shrink-0">
                <div className="text-2xl font-bold tabular-nums" style={{ color: flagColor(latestComp) }}>
                  {Math.round(latestComp)}
                </div>
                <div className="text-[10px] text-zinc-400">Nýjasta skor</div>
              </div>
            )}
          </div>

          {/* Volatility badge */}
          {volLevel && (
            <div className="mt-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                volLevel === "HIGH"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : volLevel === "MODERATE"
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
              }`}>
                {volLevel === "HIGH" ? "⚡ Há sveifla" : volLevel === "MODERATE" ? "〜 Miðlungs sveifla" : "✓ Stöðugt"}
              </span>
            </div>
          )}

          {loading && (
            <div className="mt-6 py-8 text-center text-sm text-zinc-400">Hleð sögu...</div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          )}

          {!loading && !error && points.length === 0 && (
            <div className="mt-6 py-8 text-center text-sm text-zinc-400">
              Engin check-in gögn fundust fyrir síðustu 10 daga.
            </div>
          )}

          {!loading && !error && points.length > 0 && (
            <>
              {/* Legend */}
              <div className="mt-4 flex flex-wrap gap-4 text-xs text-zinc-500">
                {SERIES.map((s) => (
                  <span key={s.key} className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-5 rounded-full" style={{ background: s.color }} />
                    {s.label}
                  </span>
                ))}
                <span className="text-zinc-400">· 0 = slæmt, 100 = frábært · Þreyta er snúin</span>
              </div>

              {/* SVG Chart */}
              <div className="mt-3 overflow-x-auto">
                <svg
                  width={W}
                  height={H}
                  viewBox={`0 0 ${W} ${H}`}
                  className="w-full overflow-visible"
                  style={{ minWidth: 280 }}
                >
                  {/* Grid lines */}
                  {Y_LABELS.map(({ val }) => {
                    const y = toY(val);
                    return (
                      <line
                        key={val}
                        x1={PAD.left} x2={W - PAD.right}
                        y1={y} y2={y}
                        stroke="#E4E4E7"
                        strokeWidth="1"
                        strokeDasharray={val === 50 ? "4,4" : undefined}
                      />
                    );
                  })}

                  {/* Y-axis labels */}
                  {Y_LABELS.map(({ val, label }) => (
                    <text
                      key={val}
                      x={PAD.left - 6}
                      y={toY(val) + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="#A1A1AA"
                    >
                      {label}
                    </text>
                  ))}

                  {/* X-axis ticks */}
                  {xTicks.map(({ lbl, x }) => (
                    <text
                      key={lbl}
                      x={x}
                      y={H - 8}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#A1A1AA"
                    >
                      {lbl}
                    </text>
                  ))}

                  {/* Today marker */}
                  {(() => {
                    const idx = points.findIndex((p) => p.date === today);
                    if (idx < 0) return null;
                    const x = toX(idx, total);
                    return (
                      <line
                        x1={x} x2={x}
                        y1={PAD.top} y2={H - PAD.bottom}
                        stroke="#18181B"
                        strokeWidth="1"
                        strokeDasharray="3,2"
                        opacity="0.3"
                      />
                    );
                  })()}

                  {/* Series */}
                  {SERIES.map((s) => {
                    const pathPts = points.map((p, i) => {
                      const val = s.fn(p);
                      if (val == null) return null;
                      return { x: toX(i, total), y: toY(val), val };
                    });
                    const lastPt = [...pathPts].reverse().find(Boolean) ?? null;
                    return (
                      <g key={s.key}>
                        <path
                          d={buildPath(pathPts)}
                          fill="none"
                          stroke={s.color}
                          strokeWidth="2.5"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          opacity="0.85"
                        />
                        {pathPts.map((pt, i) =>
                          pt ? (
                            <circle key={i} cx={pt.x} cy={pt.y} r="4" fill={s.color} opacity="0.9" />
                          ) : null
                        )}
                        {lastPt && (
                          <g>
                            <rect
                              x={lastPt.x + 6}
                              y={lastPt.y - 10}
                              width={28}
                              height={16}
                              rx={5}
                              fill={s.color}
                              opacity={0.15}
                            />
                            <text
                              x={lastPt.x + 20}
                              y={lastPt.y + 3}
                              textAnchor="middle"
                              fontSize="11"
                              fontWeight="700"
                              fill={s.color}
                            >
                              {Math.round(lastPt.val)}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Data table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="pb-2 text-left font-semibold text-[11px] uppercase tracking-wide text-zinc-400">Dagsetning</th>
                      <th className="pb-2 text-right font-semibold text-[11px] uppercase tracking-wide text-zinc-400">Check-in</th>
                      <th className="pb-2 text-right font-semibold text-[11px] uppercase tracking-wide text-zinc-400">Þreyta</th>
                      <th className="pb-2 text-right font-semibold text-[11px] uppercase tracking-wide text-zinc-400">Svefn</th>
                      <th className="pb-2 text-right font-semibold text-[11px] uppercase tracking-wide text-zinc-400">Orka</th>
                      <th className="pb-2 text-right font-semibold text-[11px] uppercase tracking-wide text-zinc-400">Skor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {[...points].reverse().map((p) => {
                      const comp = composite(p);
                      return (
                        <tr key={p.date} className={p.date === today ? "bg-zinc-50" : ""}>
                          <td className="py-2 text-zinc-600">
                            {p.date === today ? <span className="font-semibold text-zinc-900">Í dag</span> : shortDate(p.date)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-zinc-700">
                            {p.checkInScore != null ? p.checkInScore : <span className="text-zinc-300">—</span>}
                          </td>
                          <td className="py-2 text-right tabular-nums text-zinc-700">
                            {p.soreness != null ? p.soreness : <span className="text-zinc-300">—</span>}
                          </td>
                          <td className="py-2 text-right tabular-nums text-zinc-700">
                            {p.sleepQuality != null ? p.sleepQuality : <span className="text-zinc-300">—</span>}
                          </td>
                          <td className="py-2 text-right tabular-nums text-zinc-700">
                            {p.energy != null ? p.energy : <span className="text-zinc-300">—</span>}
                          </td>
                          <td className="py-2 text-right">
                            {comp != null ? (
                              <span className="font-semibold tabular-nums" style={{ color: flagColor(comp) }}>
                                {Math.round(comp)}
                              </span>
                            ) : (
                              <span className="text-zinc-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
