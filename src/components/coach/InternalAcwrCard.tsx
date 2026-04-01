"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type AcwrZone = "undertrain" | "optimal" | "caution" | "high_risk" | "insufficient";

type PlayerAcwr = {
  player_id: string;
  full_name: string;
  position: string | null;
  acute7: number;
  chronic28: number;
  acwr: number | null;
  zone: AcwrZone;
  weekLoads: [number, number, number, number];
  sessionCount28: number;
};

type AcwrResponse = {
  ok: boolean;
  error?: string;
  players: PlayerAcwr[];
  toDate: string;
  fromDate: string;
};

// ── Zone helpers ─────────────────────────────────────────────────────────────

const ZONE_META: Record<AcwrZone, { label: string; bg: string; text: string; bar: string; dot: string }> = {
  high_risk:   { label: "High risk",   bg: "bg-red-50",    text: "text-red-700",    bar: "bg-red-500",    dot: "bg-red-500" },
  caution:     { label: "Caution",     bg: "bg-amber-50",  text: "text-amber-700",  bar: "bg-amber-400",  dot: "bg-amber-400" },
  optimal:     { label: "Optimal",     bg: "bg-emerald-50",text: "text-emerald-700",bar: "bg-emerald-500",dot: "bg-emerald-500" },
  undertrain:  { label: "Undertrain",  bg: "bg-blue-50",   text: "text-blue-700",   bar: "bg-blue-400",   dot: "bg-blue-400" },
  insufficient:{ label: "No data",     bg: "bg-slate-50",  text: "text-slate-500",  bar: "bg-slate-300",  dot: "bg-slate-300" },
};

// ── Tiny Sparkline (4-bar column chart) ──────────────────────────────────────

function WeekSparkline({ loads, zone }: { loads: [number, number, number, number]; zone: AcwrZone }) {
  const max = Math.max(...loads, 1);
  const barColor = zone === "high_risk" ? "#ef4444" : zone === "caution" ? "#f59e0b" : zone === "optimal" ? "#10b981" : zone === "undertrain" ? "#60a5fa" : "#94a3b8";

  return (
    <svg width="44" height="24" viewBox="0 0 44 24" aria-hidden="true">
      {loads.map((v, i) => {
        const h = Math.max(2, Math.round((v / max) * 22));
        return (
          <rect
            key={i}
            x={i * 11 + 1}
            y={24 - h}
            width={8}
            height={h}
            rx={2}
            fill={i === 3 ? barColor : "#cbd5e1"}
            opacity={i === 3 ? 1 : 0.6}
          />
        );
      })}
    </svg>
  );
}

// ── ACWR bar indicator ────────────────────────────────────────────────────────

function AcwrBar({ acwr }: { acwr: number | null }) {
  if (acwr == null) return <span className="text-slate-400 text-xs">—</span>;
  // Map 0→2 range to 0→100%  (cap display at 2.0)
  const pct = Math.min((acwr / 2.0) * 100, 100);
  const color =
    acwr < 0.8 ? "bg-blue-400" :
    acwr <= 1.3 ? "bg-emerald-500" :
    acwr <= 1.5 ? "bg-amber-400" : "bg-red-500";

  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-semibold text-slate-700 w-8 text-right">{acwr.toFixed(2)}</span>
    </div>
  );
}

// ── Zone badge ───────────────────────────────────────────────────────────────

function ZoneBadge({ zone }: { zone: AcwrZone }) {
  const m = ZONE_META[zone];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${m.bg} ${m.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

// ── Zone summary counts ──────────────────────────────────────────────────────

function ZoneSummary({ players }: { players: PlayerAcwr[] }) {
  const counts: Record<AcwrZone, number> = { high_risk: 0, caution: 0, optimal: 0, undertrain: 0, insufficient: 0 };
  for (const p of players) counts[p.zone]++;

  const pills: AcwrZone[] = ["high_risk", "caution", "optimal", "undertrain", "insufficient"];
  return (
    <div className="flex flex-wrap gap-2">
      {pills.map((zone) => {
        if (!counts[zone]) return null;
        const m = ZONE_META[zone];
        return (
          <span key={zone} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${m.bg} ${m.text}`}>
            <span className={`w-2 h-2 rounded-full ${m.dot}`} />
            {counts[zone]} {m.label}
          </span>
        );
      })}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function InternalAcwrCard({ teamId }: { teamId?: string | null }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");
  const [data, setData]     = useState<AcwrResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data: authData, error: authErr } = await supabase.auth.getSession();
      if (authErr) throw new Error(authErr.message);
      const token = authData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const qs = new URLSearchParams();
      if (teamId) qs.set("teamId", teamId);

      const res = await fetch(`/api/coach/session-rpe/acwr?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json: AcwrResponse = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to load ACWR");
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const players = data?.players ?? [];
  const riskPlayers = players.filter((p) => p.zone === "high_risk" || p.zone === "caution");

  return (
    <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Internal Load · ACWR</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Acute:chronic workload ratio — sRPE over 28 days
            {data && (
              <span className="ml-1">· {data.fromDate} → {data.toDate}</span>
            )}
          </p>
        </div>
        <button
          onClick={load}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 rounded-full border-2 border-slate-200 border-t-indigo-600 animate-spin" />
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-red-600 py-4 text-center">{error}</p>
        )}

        {!loading && !error && players.length === 0 && (
          <p className="text-sm text-slate-400 py-4 text-center">No active players found.</p>
        )}

        {!loading && !error && players.length > 0 && (
          <div className="space-y-4">
            {/* Zone summary */}
            <ZoneSummary players={players} />

            {/* Alert strip for at-risk players */}
            {riskPlayers.length > 0 && (
              <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                <p className="text-xs font-semibold text-red-700 mb-1">
                  {riskPlayers.length} player{riskPlayers.length > 1 ? "s" : ""} need attention
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {riskPlayers.map((p) => (
                    <span key={p.player_id} className={`text-xs px-2 py-0.5 rounded-full font-medium ${ZONE_META[p.zone].bg} ${ZONE_META[p.zone].text}`}>
                      {p.full_name.split(" ")[0]} {p.acwr != null ? `(${p.acwr.toFixed(2)})` : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Player table */}
            <div className="overflow-hidden rounded-lg border border-slate-100">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_56px_80px_72px_44px] gap-2 items-center px-3 py-2 bg-slate-50 border-b border-slate-100">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Player</span>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right">Acute</span>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">ACWR</span>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Zone</span>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-center">4wk</span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-50">
                {players.map((p, idx) => (
                  <div
                    key={p.player_id}
                    className={`grid grid-cols-[1fr_56px_80px_72px_44px] gap-2 items-center px-3 py-2.5 ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"} hover:bg-indigo-50/30 transition-colors`}
                  >
                    {/* Name + position + session count */}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">{p.full_name}</p>
                      <p className="text-[11px] text-slate-400">
                        {p.position ?? "—"} · {p.sessionCount28} session{p.sessionCount28 !== 1 ? "s" : ""}
                      </p>
                    </div>

                    {/* Acute load (last 7 days) */}
                    <div className="text-right">
                      <span className="text-xs font-mono font-semibold text-slate-700">
                        {p.acute7 > 0 ? p.acute7.toLocaleString() : "—"}
                      </span>
                      <p className="text-[10px] text-slate-400">AU</p>
                    </div>

                    {/* ACWR bar */}
                    <AcwrBar acwr={p.acwr} />

                    {/* Zone badge */}
                    <ZoneBadge zone={p.zone} />

                    {/* 4-week sparkline */}
                    <div className="flex justify-center">
                      <WeekSparkline loads={p.weekLoads} zone={p.zone} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400 pt-1">
              <span><strong className="text-blue-500">Undertrain</strong> · ACWR &lt; 0.8</span>
              <span><strong className="text-emerald-600">Optimal</strong> · 0.8 – 1.3</span>
              <span><strong className="text-amber-500">Caution</strong> · 1.3 – 1.5</span>
              <span><strong className="text-red-500">High risk</strong> · &gt; 1.5</span>
              <span className="ml-auto text-slate-300">Acute = 7-day sRPE · Chronic = 28-day avg/wk</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
