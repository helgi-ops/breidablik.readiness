"use client";

/**
 * Coach view — Load Intelligence v2: McBurnie 2022 Deceleration Module.
 *
 * Surfaces 4 dimensions per player from the McBurnie framework:
 *   1. Overload exposure (cumulative 28-day vs personal baseline)
 *   2. Underload risk (recent 7-day vs match-day demand)
 *   3. Decel:Sprint coupling (must brake after sprinting)
 *   4. Exposure concentration (single-day spike vs distributed volume)
 *
 * Reference: McBurnie, Harper, Jones & Dos'Santos 2022. Sports Medicine.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Flag = "green" | "yellow" | "red" | "unknown";

type McBurnieStatus = {
  overall_flag: Flag;
  explanation: string;
  overload: { flag: Flag; cumulative_28d_count: number; baseline_daily_mean: number };
  underload: { flag: Flag; cumulative_7d_count: number; match_day_demand: number; match_days_observed: number };
  accel_coupling: { flag: Flag; recent_ratio: number; metric_name: string; healthy_range: string };
  sprint_coupling: { flag: Flag; recent_ratio: number; metric_name: string; healthy_range: string; requires_field?: string };
  concentration: { flag: Flag; peak_day_pct_of_28d: number; distinct_high_intensity_days: number };
  computed_at: string;
};

type Row = {
  player_id: string;
  full_name: string;
  status: McBurnieStatus | null;
};

export default function CoachDecelIntelligencePage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const sb = getSupabaseClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setError("Ekki innskráður"); return; }
      const { data: profile } = await sb.from("profiles").select("team_id").eq("id", user.id).maybeSingle();
      const tid = profile?.team_id as string | undefined;
      if (!tid) { setError("Ekki tengdur við lið"); return; }

      const { data: roster } = await sb.from("players")
        .select("id, full_name").eq("team_id", tid).order("full_name");
      const players = (roster ?? []) as Array<{ id: string; full_name: string }>;
      if (players.length === 0) { setRows([]); return; }

      // Fetch McBurnie status for each player in parallel
      const results = await Promise.all(
        players.map(async (p) => {
          const { data, error: rpcErr } = await sb.rpc("get_mcburnie_decel_status", {
            p_player_id: p.id,
          });
          if (rpcErr) console.warn(`McBurnie status failed for ${p.full_name}:`, rpcErr);
          return {
            player_id: p.id,
            full_name: (p.full_name ?? "—").trim(),
            status: (data as McBurnieStatus | null) ?? null,
          };
        }),
      );
      // Sort: red flags first, then yellow, then green, then no data
      const sorted = results.sort((a, b) => {
        const order = { red: 0, yellow: 1, green: 2, unknown: 3 };
        const a_o = order[a.status?.overall_flag ?? "unknown"];
        const b_o = order[b.status?.overall_flag ?? "unknown"];
        if (a_o !== b_o) return a_o - b_o;
        return a.full_name.localeCompare(b.full_name);
      });
      setRows(sorted);
    } catch (e: any) {
      setError(e?.message ?? "Villa");
    } finally {
      setLoading(false);
    }
  }

  async function refreshBaselines() {
    setRefreshing(true);
    try {
      const sb = getSupabaseClient();
      await sb.rpc("refresh_mcburnie_decel_baselines");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Refresh villa");
    } finally {
      setRefreshing(false);
    }
  }

  const counts = React.useMemo(() => {
    let red = 0, yellow = 0, green = 0, unknown = 0;
    for (const r of rows) {
      const f = r.status?.overall_flag ?? "unknown";
      if (f === "red") red++;
      else if (f === "yellow") yellow++;
      else if (f === "green") green++;
      else unknown++;
    }
    return { red, yellow, green, unknown };
  }, [rows]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">Decel Intelligence</h1>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
              McBurnie 2022 · Load Intelligence v2
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Eccentric deceleration risk profile per player — implementation of the
            McBurnie, Harper, Jones &amp; Dos'Santos 2022 framework (Sports Medicine).
            4 dimensions: overload, underload, decel:sprint coupling, exposure concentration.
          </p>
        </div>
        <button
          onClick={refreshBaselines}
          disabled={refreshing}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? "Reikna…" : "↻ Endur-reikna baselines"}
        </button>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountCard tone="red"     label="Red" n={counts.red} />
        <CountCard tone="yellow"  label="Yellow" n={counts.yellow} />
        <CountCard tone="green"   label="Green" n={counts.green} />
        <CountCard tone="gray"    label="Insufficient data" n={counts.unknown} />
      </div>

      {/* Player list */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {loading && <div className="py-8 text-center text-sm text-muted-foreground">Hleð…</div>}
        {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {!loading && !error && rows.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Engin GPS gögn fyrir liðið. Hladdu upp Catapult exports fyrst í Integrations Center.
          </div>
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r) => <PlayerRow key={r.player_id} row={r} />)}
          </div>
        )}
      </div>

      {/* Methodology footer */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
        <p className="font-semibold text-slate-900">Methodology — McBurnie 2022 framework</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>
            <strong>Overload:</strong> 28-day cumulative high-intensity decel count (band 2-3, &gt;2 m/s²)
            vs personal daily baseline. Red if &gt;1.5× expected total. (Eccentric overload risk.)
          </li>
          <li>
            <strong>Underload:</strong> 7-day cumulative count vs personal match-day demand baseline.
            Red if &lt;50% of match demand. (Underprepared for match decel exposure → injury risk per
            McBurnie; the body has lost adaptation.)
          </li>
          <li>
            <strong>Decel:Accel coupling (high-intensity counts):</strong> Eccentric decel events
            divided by concentric accel events from Catapult bands 2-3 (≥2 m/s²). Healthy range
            0.8–1.2. Red if &lt;0.7 (accelerating without proportional braking) or &gt;2.0
            (defensive scrambling pattern). Foundation balance metric.
          </li>
          <li>
            <strong>Decel:Sprint coupling (Vel B6+ Total # Efforts, Gen 2):</strong> McBurnie's
            primary risk metric. Decel events divided by actual Catapult sprint event count
            (vb6+ Gen 2 effort count, not distance proxy). Healthy ≥0.8 (every sprint followed
            by at least one high-intensity brake). Red if &lt;0.5 (sprinting without proportional
            braking — classic McBurnie injury pattern). Requires the
            <em> Velocity B6+ Total # Efforts (Gen 2) </em> Catapult Reporting Parameter to be enabled.
          </li>
          <li>
            <strong>Exposure concentration:</strong> What % of 28-day cumulative volume happened in
            the single peak day. Red if &gt;30% (McBurnie's "tall-thin force-time" pattern; concentrated
            mechanical loading more dangerous than distributed).
          </li>
        </ul>
        <p className="mt-2 text-slate-600">
          <strong>Reference:</strong> McBurnie AJ, Harper DJ, Jones PA, Dos'Santos T. (2022).
          Deceleration training in team sports: another potential 'vaccine' for sports-related injury?
          <em> Sports Medicine</em>, 52(1), 1–12. doi:10.1007/s40279-021-01583-x
        </p>
      </div>

      <div className="text-sm">
        <Link href="/coach" className="text-emerald-700 hover:underline">← Til baka á dashboard</Link>
      </div>
    </div>
  );
}

// ─── Player row ──────────────────────────────────────────────────────────

function PlayerRow({ row }: { row: Row }) {
  const [expanded, setExpanded] = React.useState(false);
  const s = row.status;
  const overall = s?.overall_flag ?? "unknown";

  const overallClass = {
    red: "border-red-300 bg-red-50",
    yellow: "border-amber-300 bg-amber-50",
    green: "border-emerald-200 bg-emerald-50",
    unknown: "border-slate-200 bg-slate-50",
  }[overall];

  return (
    <div className={`rounded-lg border ${overallClass}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-white/30"
      >
        <div>
          <div className="text-sm font-semibold text-slate-900">{row.full_name}</div>
          {s && (
            <div className="text-xs text-slate-700">{s.explanation}</div>
          )}
          {!s && (
            <div className="text-xs text-slate-500 italic">No GPS data available</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <FlagBadge flag={s?.overload?.flag ?? "unknown"} label="Overload" />
          <FlagBadge flag={s?.underload?.flag ?? "unknown"} label="Underload" />
          <FlagBadge flag={s?.accel_coupling?.flag ?? "unknown"} label="A:D" />
          <FlagBadge flag={s?.sprint_coupling?.flag ?? "unknown"} label="D:Sprint" />
          <FlagBadge flag={s?.concentration?.flag ?? "unknown"} label="Concentration" />
          <span className="text-slate-400">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>

      {expanded && s && (
        <div className="border-t border-slate-200/50 bg-white/50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Detail
              title="Overload"
              flag={s.overload.flag}
              big={`${s.overload.cumulative_28d_count.toFixed(0)} decels`}
              caption={`28-day cumulative · baseline daily ≈ ${s.overload.baseline_daily_mean.toFixed(1)}`}
              hint="Red if cumulative > 1.5× expected total."
            />
            <Detail
              title="Underload"
              flag={s.underload.flag}
              big={`${s.underload.cumulative_7d_count.toFixed(0)} / ${s.underload.match_day_demand.toFixed(1)}`}
              caption={`7-day exposure / match-day demand · ${s.underload.match_days_observed} match days observed`}
              hint="Red if 7-day < 50% of match demand."
            />
            <Detail
              title="Decel : Accel Coupling"
              flag={s.accel_coupling.flag}
              big={s.accel_coupling.recent_ratio.toFixed(2)}
              caption={`${s.accel_coupling.metric_name} · healthy ${s.accel_coupling.healthy_range}`}
              hint="Eccentric:concentric balance. Red if <0.7 or >2.0."
            />
            <Detail
              title="Decel : Sprint Coupling"
              flag={s.sprint_coupling.flag}
              big={s.sprint_coupling.recent_ratio > 0 ? s.sprint_coupling.recent_ratio.toFixed(2) : "—"}
              caption={
                s.sprint_coupling.recent_ratio > 0
                  ? `${s.sprint_coupling.metric_name} · healthy ${s.sprint_coupling.healthy_range}`
                  : `Awaiting Catapult Vel B6+ Total # Efforts (Gen 2) field. Will populate after next sync.`
              }
              hint="McBurnie's primary risk metric. Red if <0.5 (sprinting without proper braking)."
            />
            <Detail
              title="Exposure Concentration"
              flag={s.concentration.flag}
              big={`${s.concentration.peak_day_pct_of_28d.toFixed(1)}%`}
              caption={`Peak day's share of 28-day total · ${s.concentration.distinct_high_intensity_days} active days`}
              hint="Red if peak-day > 30% of monthly volume."
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ title, flag, big, caption, hint }: {
  title: string;
  flag: Flag;
  big: string;
  caption: string;
  hint: string;
}) {
  const dot = {
    red: "bg-red-500",
    yellow: "bg-amber-500",
    green: "bg-emerald-500",
    unknown: "bg-slate-400",
  }[flag];
  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          {title}
        </span>
      </div>
      <div className="mt-1 text-xl font-bold text-slate-900">{big}</div>
      <div className="text-[11px] text-slate-600">{caption}</div>
      <div className="mt-1 text-[10px] italic text-slate-500">{hint}</div>
    </div>
  );
}

function FlagBadge({ flag, label }: { flag: Flag; label: string }) {
  const cls = {
    red: "bg-red-500 text-white",
    yellow: "bg-amber-500 text-white",
    green: "bg-emerald-500 text-white",
    unknown: "bg-slate-300 text-slate-700",
  }[flag];
  return (
    <span className={`hidden rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase sm:inline ${cls}`}>
      {label}
    </span>
  );
}

function CountCard({ tone, label, n }: { tone: "red" | "yellow" | "green" | "gray"; label: string; n: number }) {
  const palette = {
    red:    { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-700",     num: "text-red-600" },
    yellow: { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   num: "text-amber-600" },
    green:  { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", num: "text-emerald-600" },
    gray:   { bg: "bg-slate-50",   border: "border-slate-200",   text: "text-slate-600",   num: "text-slate-500" },
  }[tone];
  return (
    <div className={`rounded-xl border ${palette.border} ${palette.bg} px-4 py-3`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wide ${palette.text}`}>{label}</div>
      <div className={`text-2xl font-bold ${palette.num}`}>{n}</div>
    </div>
  );
}
