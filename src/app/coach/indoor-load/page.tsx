"use client";

/**
 * Coach view — Indoor Load Intelligence (höll-mode).
 *
 * FMP-driven indoor load monitoring for sessions in indoor halls.
 * Auto-detects indoor sessions: low velocity_band6_distance + meaningful FMP duration.
 *
 * Surfaces per player:
 *   - Latest indoor session vs personal 28-day baseline
 *   - Indoor McBurnie proxy: decel events / minute of FMP Dynamic High
 *   - Recent 7-day cumulative indoor load
 *
 * Reference: McBurnie 2022 indoor adaptation. FMP framework (Catapult OpenField).
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Flag = "green" | "yellow" | "red";

type IndoorStatus = {
  computed_at: string;
  indoor_sessions_28d: number;
  indoor_sessions_7d: number;
  total_sessions_28d: number;
  baseline_indoor: {
    avg_player_load: number;
    avg_dyn_high_pct: number;
    avg_duration_min: number;
    avg_ima_total: number;
    avg_decel_b23: number;
    avg_hmld_m: number;
  };
  recent_7d: {
    sessions: number;
    sum_player_load: number;
    sum_dyn_high_s: number;
    sum_decel_b23: number;
  };
  latest_session: {
    date: string;
    player_load: number | null;
    dyn_high_pct: number | null;
    duration_min: number;
    ima_total: number | null;
    decel_b23: number | null;
    hmld_m: number | null;
    avg_hr: number | null;
  } | null;
  indoor_mcburnie: {
    decel_per_dyn_high_min: number;
    healthy_range: string;
    flag: Flag;
    interpretation?: string;
  } | null;
};

type Row = {
  player_id: string;
  full_name: string;
  status: IndoorStatus | null;
};

const FLAG_COLORS: Record<Flag | "none", string> = {
  green: "bg-emerald-50 border-emerald-300 text-emerald-900",
  yellow: "bg-amber-50 border-amber-300 text-amber-900",
  red: "bg-rose-50 border-rose-300 text-rose-900",
  none: "bg-slate-50 border-slate-200 text-slate-500",
};

const FLAG_DOT: Record<Flag | "none", string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-rose-500",
  none: "bg-slate-300",
};

export default function CoachIndoorLoadPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        setError("Ekki innskráður");
        return;
      }
      const { data: profile } = await sb
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();
      const tid = (profile as { team_id?: string } | null)?.team_id;
      if (!tid) {
        setError("Ekki tengdur við lið");
        return;
      }

      const { data: roster } = await sb
        .from("players")
        .select("id, full_name")
        .eq("team_id", tid)
        .order("full_name");
      const players = (roster ?? []) as Array<{ id: string; full_name: string }>;
      if (players.length === 0) {
        setRows([]);
        return;
      }

      const results = await Promise.all(
        players.map(async (p) => {
          const { data, error: rpcErr } = await sb.rpc("get_indoor_load_status", {
            p_player_id: p.id,
          });
          if (rpcErr) console.warn(`Indoor status failed for ${p.full_name}:`, rpcErr);
          return {
            player_id: p.id,
            full_name: (p.full_name ?? "—").trim(),
            status: (data as IndoorStatus | null) ?? null,
          };
        }),
      );

      // Sort: red flags first, then yellow, then green, then no indoor data
      const sorted = results.sort((a, b) => {
        const order: Record<Flag | "none", number> = { red: 0, yellow: 1, green: 2, none: 3 };
        const a_o = order[a.status?.indoor_mcburnie?.flag ?? "none"];
        const b_o = order[b.status?.indoor_mcburnie?.flag ?? "none"];
        if (a_o !== b_o) return a_o - b_o;
        return a.full_name.localeCompare(b.full_name);
      });
      setRows(sorted);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Villa";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Team-level summary stats
  const teamStats = React.useMemo(() => {
    const withIndoor = rows.filter((r) => (r.status?.indoor_sessions_28d ?? 0) > 0);
    const greens = rows.filter((r) => r.status?.indoor_mcburnie?.flag === "green").length;
    const yellows = rows.filter((r) => r.status?.indoor_mcburnie?.flag === "yellow").length;
    const reds = rows.filter((r) => r.status?.indoor_mcburnie?.flag === "red").length;
    const totalIndoorSessions7d = withIndoor.reduce(
      (sum, r) => sum + (r.status?.indoor_sessions_7d ?? 0),
      0,
    );
    return { withIndoor: withIndoor.length, greens, yellows, reds, totalIndoorSessions7d };
  }, [rows]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            <Link href="/coach" className="hover:text-slate-700">
              Coach
            </Link>
            <span>›</span>
            <span>Indoor Load</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Indoor Load Intelligence</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Höll-mode álagsgreining byggð á Football Movement Profile (FMP). Auto-greinir
            innan-húss sessions út frá lágu velocity-band 6 og marktækri FMP-virkni.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Sæki…" : "Endurnýja"}
        </button>
      </div>

      {/* Team summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="Leikmenn með indoor data" value={String(teamStats.withIndoor)} />
        <SummaryCard
          label="🟢 Healthy"
          value={String(teamStats.greens)}
          accent="text-emerald-700"
        />
        <SummaryCard label="🟡 Caution" value={String(teamStats.yellows)} accent="text-amber-700" />
        <SummaryCard label="🔴 At-risk" value={String(teamStats.reds)} accent="text-rose-700" />
        <SummaryCard
          label="Indoor sessions sl. 7d"
          value={String(teamStats.totalIndoorSessions7d)}
        />
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading && rows.length === 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Sæki indoor load gögn…
        </div>
      )}

      {/* Player rows */}
      <div className="space-y-2">
        {rows.map((row) => {
          const flag: Flag | "none" = row.status?.indoor_mcburnie?.flag ?? "none";
          const noData = (row.status?.indoor_sessions_28d ?? 0) === 0;
          const isExpanded = expanded.has(row.player_id);
          const colorClass = noData ? FLAG_COLORS.none : FLAG_COLORS[flag];

          return (
            <div
              key={row.player_id}
              className={`overflow-hidden rounded-lg border ${colorClass}`}
            >
              {/* Row header — clickable */}
              <button
                onClick={() => toggleExpand(row.player_id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${noData ? FLAG_DOT.none : FLAG_DOT[flag]}`}
                  />
                  <span className="font-medium text-slate-900">{row.full_name}</span>
                  {noData ? (
                    <span className="text-xs text-slate-500">— engin indoor session sl. 28d</span>
                  ) : (
                    <span className="text-xs text-slate-600">
                      {row.status!.indoor_sessions_28d}/{row.status!.total_sessions_28d} sessions
                      indoor (28d)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {!noData && row.status?.indoor_mcburnie && (
                    <span className="text-sm font-semibold tabular-nums">
                      {row.status.indoor_mcburnie.decel_per_dyn_high_min.toFixed(2)} d/min
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{isExpanded ? "▴" : "▾"}</span>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && row.status && !noData && (
                <div className="border-t border-current border-opacity-20 bg-white/60 px-4 py-4 text-sm text-slate-800">
                  <div className="grid gap-4 md:grid-cols-3">
                    {/* Latest session */}
                    {row.status.latest_session && (
                      <div>
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Síðasta indoor session ({row.status.latest_session.date})
                        </div>
                        <dl className="space-y-1 tabular-nums">
                          <Stat label="Player Load" value={row.status.latest_session.player_load} />
                          <Stat
                            label="Lengd"
                            value={`${row.status.latest_session.duration_min} mín`}
                          />
                          <Stat
                            label="Dynamic High %"
                            value={
                              row.status.latest_session.dyn_high_pct != null
                                ? `${row.status.latest_session.dyn_high_pct.toFixed(2)}%`
                                : null
                            }
                          />
                          <Stat label="HMLD (m)" value={row.status.latest_session.hmld_m} />
                          <Stat label="IMA total" value={row.status.latest_session.ima_total} />
                          <Stat label="Decel B2-3" value={row.status.latest_session.decel_b23} />
                        </dl>
                      </div>
                    )}

                    {/* Baseline 28d */}
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Personal baseline (28d indoor)
                      </div>
                      <dl className="space-y-1 tabular-nums">
                        <Stat
                          label="Avg Player Load"
                          value={row.status.baseline_indoor.avg_player_load}
                        />
                        <Stat
                          label="Avg lengd"
                          value={`${row.status.baseline_indoor.avg_duration_min} mín`}
                        />
                        <Stat
                          label="Avg Dyn High %"
                          value={`${row.status.baseline_indoor.avg_dyn_high_pct.toFixed(2)}%`}
                        />
                        <Stat
                          label="Avg HMLD (m)"
                          value={row.status.baseline_indoor.avg_hmld_m}
                        />
                        <Stat
                          label="Avg IMA total"
                          value={row.status.baseline_indoor.avg_ima_total}
                        />
                        <Stat
                          label="Avg Decel B2-3"
                          value={row.status.baseline_indoor.avg_decel_b23}
                        />
                      </dl>
                    </div>

                    {/* 7-day cumulative + McBurnie */}
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Sl. 7 dagar (cumulative)
                      </div>
                      <dl className="space-y-1 tabular-nums">
                        <Stat label="Indoor sessions" value={row.status.recent_7d.sessions} />
                        <Stat
                          label="Player Load samtals"
                          value={row.status.recent_7d.sum_player_load}
                        />
                        <Stat
                          label="Dyn High (sek)"
                          value={row.status.recent_7d.sum_dyn_high_s}
                        />
                        <Stat label="Decel B2-3" value={row.status.recent_7d.sum_decel_b23} />
                      </dl>

                      {row.status.indoor_mcburnie && (
                        <div className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Indoor McBurnie proxy
                          </div>
                          <div className="mt-1 flex items-baseline justify-between">
                            <span className="text-lg font-bold tabular-nums">
                              {row.status.indoor_mcburnie.decel_per_dyn_high_min.toFixed(2)}
                            </span>
                            <span className="text-xs text-slate-500">
                              decels / mín Dyn High (heilbrigt {row.status.indoor_mcburnie.healthy_range})
                            </span>
                          </div>
                          {row.status.indoor_mcburnie.interpretation && (
                            <div className="mt-2 text-xs leading-relaxed text-slate-600">
                              {row.status.indoor_mcburnie.interpretation}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Methodology footer */}
      <details className="mt-8 rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
        <summary className="cursor-pointer font-semibold text-slate-800">Aðferðafræði</summary>
        <div className="mt-3 space-y-2">
          <p>
            <strong>Auto-greining á indoor session:</strong> Session telst innan-húss ef
            velocity_band6_total_distance &lt; 50m og fmp_total_duration_s &gt; 600s (10 mín).
            Þetta útilokar útiæfingar sem mæla raunverulega max-hraða og fangar æfingar í höllum
            þar sem GPS-háðir mælar segja lítið.
          </p>
          <p>
            <strong>Indoor McBurnie proxy:</strong> decel_b23_count / (FMP duration × Dynamic High
            %). Mælir hversu margar high-intensity bremsanir leikmaður gerir per mínútu af
            high-intensity hreyfingu.
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>1-10:</strong> 🟢 Healthy — eðlilegt indoor decel:intensity coupling
            </li>
            <li>
              <strong>0.5-1 eða 10-15:</strong> 🟡 Caution — annað hvort underload
              (lítið brake-work) eða decel-heavy training
            </li>
            <li>
              <strong>&lt; 0.5 eða &gt; 15:</strong> 🔴 At-risk — verulegt mismunur milli
              bremsuvinnu og hreyfingar (overload eða undirvinnsla)
            </li>
          </ul>
          <p>
            <strong>Source:</strong> Football Movement Profile (Catapult OpenField, IMU-only,
            engin GPS-þörf), accelerometry IMA Accel/Decel/CoD, Player Load.
          </p>
          <p className="italic text-slate-500">
            Reference: McBurnie, Harper, Jones &amp; Dos&apos;Santos 2022 — Deceleration Training
            in Team Sports. Sports Medicine.
          </p>
        </div>
      </details>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${accent ?? "text-slate-900"}`}>{value}</div>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: number | string | null | undefined;
}) {
  const display =
    value == null
      ? "—"
      : typeof value === "number"
        ? Number.isInteger(value)
          ? String(value)
          : value.toFixed(1)
        : value;
  return (
    <div className="flex items-center justify-between text-xs">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{display}</dd>
    </div>
  );
}
