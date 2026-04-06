"use client";

import React from "react";
import { supabase } from "@/lib/supabaseClient";

type DrillUsage = {
  drill_id: string;
  drill_name: string;
  times_used: number;
  total_sets: number;
  last_used: string;
  sessions: string[];
};

type AnalyticsData = {
  total_sessions: number;
  total_unique_drills: number;
  drills: DrillUsage[];
};

export default function DrillAnalytics({ teamId }: { teamId: string }) {
  const [data, setData] = React.useState<AnalyticsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!teamId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const { data: authData } = await supabase.auth.getSession();
        const token = authData?.session?.access_token;
        if (!token) throw new Error("Not authenticated");

        const res = await fetch(`/api/coach/drill-analytics?team_id=${teamId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const json = await res.json();
        if (!cancelled) {
          if (json.ok) {
            setData(json);
          } else {
            setError(json.error ?? "Failed to load analytics");
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [teamId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-zinc-400">Hleð drill analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data || data.drills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-3xl mb-2">📊</div>
        <div className="text-sm text-zinc-500">Engar vistaðar æfingar enn.</div>
        <div className="text-xs text-zinc-400 mt-1">
          Þegar þú vistar sessions mun analytics birtast hér.
        </div>
      </div>
    );
  }

  const maxUsed = data.drills[0]?.times_used ?? 1;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center">
          <div className="text-2xl font-bold text-zinc-900 tabular-nums">{data.total_sessions}</div>
          <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mt-0.5">
            Vistaðar sessions
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center">
          <div className="text-2xl font-bold text-zinc-900 tabular-nums">{data.total_unique_drills}</div>
          <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mt-0.5">
            Mismunandi drills
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-center">
          <div className="text-2xl font-bold text-zinc-900 tabular-nums">
            {data.drills.reduce((sum, d) => sum + d.total_sets, 0)}
          </div>
          <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wide mt-0.5">
            Heildar sets
          </div>
        </div>
      </div>

      {/* Top drills table */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-700 mb-3">
          Mest notaðar drillæfingar
        </h3>
        <div className="space-y-2">
          {data.drills.slice(0, 20).map((drill, i) => {
            const barWidth = Math.max(4, (drill.times_used / maxUsed) * 100);
            const isTop3 = i < 3;
            return (
              <div
                key={drill.drill_id}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-3 transition hover:border-zinc-300"
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={[
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                        isTop3
                          ? "bg-amber-100 text-amber-700"
                          : "bg-zinc-100 text-zinc-500",
                      ].join(" ")}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-zinc-900 truncate">
                      {drill.drill_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-zinc-500">
                      {drill.times_used}x
                    </span>
                    <span className="text-xs text-zinc-400">
                      {drill.total_sets} sets
                    </span>
                  </div>
                </div>
                {/* Usage bar */}
                <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className={[
                      "h-full rounded-full transition-all duration-300",
                      isTop3 ? "bg-amber-400" : "bg-zinc-300",
                    ].join(" ")}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                {/* Last used + sessions */}
                <div className="flex items-center justify-between mt-1.5">
                  <div className="text-[10px] text-zinc-400">
                    Síðast:{" "}
                    {new Date(drill.last_used).toLocaleDateString("is-IS", {
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                  {drill.sessions.length > 0 ? (
                    <div className="flex items-center gap-1">
                      {drill.sessions.slice(0, 3).map((s, j) => (
                        <span
                          key={j}
                          className="inline-flex rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] text-zinc-500 max-w-[80px] truncate"
                        >
                          {s || "Unnamed"}
                        </span>
                      ))}
                      {drill.sessions.length > 3 ? (
                        <span className="text-[9px] text-zinc-400">
                          +{drill.sessions.length - 3}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
