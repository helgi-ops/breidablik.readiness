"use client";

/**
 * Coach quadrant view (Gabbett 2017 / Vanrenterghem 2017).
 *
 * Shows every athlete on a 2x2 chart of external load (X = avg distance)
 * vs internal cost (Y = avg sRPE). Quadrants identify:
 *
 *   - INJURY RISK (high external + high internal)
 *   - DECOUPLED   (low external + high internal — early-warning fatigue)
 *   - PEAK FITNESS (high external + low internal)
 *   - UNDER-STIMULATED (low external + low internal)
 *
 * Time window is selectable (7 / 14 / 28 days). Default 7 days = current
 * micro-cycle, the most actionable view for week planning.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { QuadrantChart, type QuadrantPoint } from "@/components/coach/QuadrantChart";

type Window = 7 | 14 | 28;

type RawPlayer = {
  id: string;
  full_name: string | null;
  team_id: string | null;
};

type Aggregate = {
  player_id: string;
  external_load: number;     // avg total_distance over window (m / day)
  internal_cost: number;     // avg RPE × duration over window (AU / day)
  ext_days: number;          // days with external data
  rpe_days: number;          // days with RPE data
  acute_int: number;         // 7-day avg internal
  chronic_int: number;       // 28-day avg internal
};

export default function CoachQuadrantPage() {
  const [loading, setLoading]   = React.useState(true);
  const [error, setError]       = React.useState<string | null>(null);
  const [windowDays, setWindow] = React.useState<Window>(7);
  const [points, setPoints]     = React.useState<QuadrantPoint[]>([]);
  const [teamLabel, setTeamLabel] = React.useState<string>("");
  const [computedAt, setComputedAt] = React.useState<string>("");

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowDays]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setError("Ekki innskráður"); return; }

      // Resolve coach's team
      const { data: profile } = await sb
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();
      const teamId = profile?.team_id as string | undefined;
      if (!teamId) { setError("Ekki tengdur við lið"); return; }

      const { data: team } = await sb
        .from("teams")
        .select("name, club_short_name")
        .eq("id", teamId)
        .maybeSingle();
      setTeamLabel((team?.club_short_name || team?.name) ?? "");

      // Roster
      const { data: roster, error: rosterErr } = await sb
        .from("players")
        .select("id, full_name, team_id")
        .eq("team_id", teamId);
      if (rosterErr) throw rosterErr;
      const players = (roster ?? []) as RawPlayer[];
      if (players.length === 0) { setPoints([]); return; }
      const playerIds = players.map(p => p.id);

      // Date window — UTC midnight
      const today = new Date();
      const winStart = new Date(today);
      winStart.setUTCDate(today.getUTCDate() - windowDays);
      const chronicStart = new Date(today);
      chronicStart.setUTCDate(today.getUTCDate() - 28);
      const winStartIso = winStart.toISOString().slice(0, 10);
      const chronicStartIso = chronicStart.toISOString().slice(0, 10);

      // External load — last `windowDays`
      const { data: extRows, error: extErr } = await sb
        .from("player_external_load_daily")
        .select("player_id, date, total_distance")
        .in("player_id", playerIds)
        .gte("date", winStartIso);
      if (extErr) throw extErr;

      // RPE — last 28 days (need both window window and chronic for ACWR)
      const { data: rpeRows, error: rpeErr } = await sb
        .from("session_rpe_entries")
        .select("player_id, session_date, rpe, duration_minutes, session_load")
        .in("player_id", playerIds)
        .gte("session_date", chronicStartIso);
      if (rpeErr) throw rpeErr;

      // Aggregate
      const agg = new Map<string, Aggregate>();
      for (const p of players) {
        agg.set(p.id, {
          player_id: p.id,
          external_load: 0, internal_cost: 0,
          ext_days: 0, rpe_days: 0,
          acute_int: 0, chronic_int: 0,
        });
      }

      // External — sum then divide by # days
      for (const r of (extRows ?? [])) {
        const a = agg.get((r as any).player_id);
        if (!a) continue;
        const v = Number((r as any).total_distance);
        if (Number.isFinite(v) && v > 0) {
          a.external_load += v;
          a.ext_days += 1;
        }
      }

      // RPE — split between window (acute) and full 28d (chronic)
      const winStartTime = new Date(winStartIso).getTime();
      const acuteSum = new Map<string, { sum: number; n: number }>();
      const chronicSum = new Map<string, { sum: number; n: number }>();
      for (const r of (rpeRows ?? [])) {
        const pid = (r as any).player_id as string;
        const d = (r as any).session_date as string;
        const rpe = Number((r as any).rpe);
        const dur = Number((r as any).duration_minutes ?? 60);
        const sLoad = Number.isFinite((r as any).session_load) ? Number((r as any).session_load) : (rpe * dur);
        if (!Number.isFinite(sLoad) || sLoad <= 0) continue;

        // chronic always
        const c = chronicSum.get(pid) ?? { sum: 0, n: 0 };
        c.sum += sLoad; c.n += 1;
        chronicSum.set(pid, c);

        // acute if in window
        if (new Date(d).getTime() >= winStartTime) {
          const ac = acuteSum.get(pid) ?? { sum: 0, n: 0 };
          ac.sum += sLoad; ac.n += 1;
          acuteSum.set(pid, ac);
        }
      }

      // Convert to averages
      for (const [pid, a] of agg) {
        a.external_load = a.ext_days > 0 ? a.external_load / a.ext_days : 0;
        const ac = acuteSum.get(pid);
        const ch = chronicSum.get(pid);
        a.internal_cost = ac && ac.n > 0 ? ac.sum / ac.n : 0;
        a.rpe_days = ac?.n ?? 0;
        a.acute_int = a.internal_cost;
        a.chronic_int = ch && ch.n > 0 ? ch.sum / ch.n : 0;
      }

      // Build chart points (skip athletes with no data at all)
      const out: QuadrantPoint[] = [];
      for (const p of players) {
        const a = agg.get(p.id);
        if (!a) continue;
        if (a.external_load === 0 && a.internal_cost === 0) continue;
        const acwr = a.chronic_int > 0 ? a.acute_int / a.chronic_int : null;
        let flag: QuadrantPoint["flag"] = "green";
        if (acwr != null) {
          if (acwr >= 1.5) flag = "red";
          else if (acwr >= 1.3) flag = "yellow";
        }
        out.push({
          playerId: p.id,
          name: (p.full_name ?? "—").trim(),
          externalLoad: a.external_load,
          internalCost: a.internal_cost,
          acwr,
          flag,
        });
      }

      setPoints(out);
      setComputedAt(new Date().toLocaleTimeString("is-IS", {
        hour: "2-digit", minute: "2-digit",
      }));
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Villa við að sækja gögn");
    } finally {
      setLoading(false);
    }
  }

  // Quadrant counts for the summary bar
  const counts = React.useMemo(() => {
    if (points.length === 0) return { risk: 0, decoupled: 0, peak: 0, low: 0 };
    const xs = points.map(p => p.externalLoad).sort((a, b) => a - b);
    const ys = points.map(p => p.internalCost).sort((a, b) => a - b);
    const xMed = xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
    const yMed = ys.length % 2 ? ys[(ys.length - 1) / 2] : (ys[ys.length / 2 - 1] + ys[ys.length / 2]) / 2;
    let risk = 0, decoupled = 0, peak = 0, low = 0;
    for (const p of points) {
      const hi_x = p.externalLoad >= xMed;
      const hi_y = p.internalCost >= yMed;
      if (hi_x && hi_y) risk++;
      else if (!hi_x && hi_y) decoupled++;
      else if (hi_x && !hi_y) peak++;
      else low++;
    }
    return { risk, decoupled, peak, low };
  }, [points]);

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">Quadrant view</h1>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
              Gabbett 2017
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            External load (avg distance) × internal cost (avg sRPE). Quadrant lines at team median.
            {teamLabel && <> · {teamLabel}</>}
            {computedAt && <> · uppfært {computedAt}</>}
          </p>
        </div>
        <div className="flex gap-1">
          {([7, 14, 28] as Window[]).map((d) => (
            <button
              key={d}
              onClick={() => setWindow(d)}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                windowDays === d
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {d} d
            </button>
          ))}
        </div>
      </div>

      {/* Quadrant counts */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountCard label="Injury risk"      n={counts.risk}      tone="red" />
        <CountCard label="Decoupled"        n={counts.decoupled} tone="yellow" />
        <CountCard label="Peak fitness"     n={counts.peak}      tone="green" />
        <CountCard label="Under-stimulated" n={counts.low}       tone="gray" />
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {loading && (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Hleð gögn…
          </div>
        )}
        {!loading && error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {!loading && !error && points.length === 0 && (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Engin gögn fyrir þessa glugga. Hladdu upp GPS / RPE fyrst.
          </div>
        )}
        {!loading && !error && points.length > 0 && (
          <QuadrantChart
            points={points}
            xLabel={`External load — avg distance (m / day, last ${windowDays}d)`}
            yLabel={`Internal cost — avg sRPE (AU / day, last ${windowDays}d)`}
          />
        )}
      </div>

      {/* Helper text below chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="mb-2 font-semibold text-slate-900">Hvernig á að lesa þetta:</p>
        <ul className="list-inside list-disc space-y-1.5">
          <li>
            <strong>Injury risk</strong> (efst-hægri): leikmenn sem bæði keyra mikið og borga mikið innra.
            Mest meiðslaáhætta — íhuga reduced load í næstu session.
          </li>
          <li>
            <strong>Decoupled</strong> (efst-vinstri): leikmenn sem keyra lítið en borga mikið.
            Klassískt early-warning fatigue eða illness merki — Halson 2014.
          </li>
          <li>
            <strong>Peak fitness</strong> (neðst-hægri): mikið work, lítill cost.
            Vel þjálfaðir — komnir á topp form.
          </li>
          <li>
            <strong>Under-stimulated</strong> (neðst-vinstri): minimal load.
            Ekki meiðslaáhætta — en kannski ekki að fá nóg álag heldur.
          </li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Punktastærð endurspeglar ACWR — stærri punktur = ratio hærri en 1.3 (acute work outpaces chronic).
        </p>
      </div>

      {/* Quick navigation back */}
      <div className="flex justify-between text-sm">
        <Link href="/coach" className="text-emerald-700 hover:underline">
          ← Til baka á dashboard
        </Link>
        <Link href="/coach/integrations" className="text-slate-500 hover:underline">
          Bæta við GPS / RPE gögnum →
        </Link>
      </div>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────

function CountCard({ label, n, tone }: { label: string; n: number; tone: "red" | "yellow" | "green" | "gray" }) {
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
