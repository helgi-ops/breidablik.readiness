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
  /**
   * Which decel field the SQL function actually used (priority order):
   *   - "ima_band3_decel_count"      → IMU-based high-intensity (preferred —
   *     Catapult exposes this in the base payload, works indoor and outdoor)
   *   - "decel_b3_plus_tot_effs_gen2" → GPS Gen-2 high-intensity (fallback,
   *     not currently populated because Catapult API V6 silently drops the
   *     parameter request)
   *   - "decel_b2_3_tot_effs_gen2"   → combined moderate+high GPS (last-ditch
   *     fallback for historical data with no IMA Band 3 capture)
   */
  decel_source?:
    | "ima_band3_decel_count"
    | "decel_b3_plus_tot_effs_gen2"
    | "decel_b2_3_tot_effs_gen2";
  overload: { flag: Flag; cumulative_28d_count: number; baseline_daily_mean: number };
  underload: { flag: Flag; cumulative_7d_count: number; match_day_demand: number; match_days_observed: number };
  accel_coupling: { flag: Flag; recent_ratio: number; metric_name: string; healthy_range: string };
  sprint_coupling: { flag: Flag; recent_ratio: number; metric_name: string; healthy_range: string; requires_field?: string };
  concentration: { flag: Flag; peak_day_pct_of_28d: number; distinct_high_intensity_days: number };
  // Neuromuscular capacity dims — load × capacity = compounded risk picture.
  // Each shows last-test freshness so coach can spot stale data; flag falls
  // back to "unknown" (gray) when no test of that type has been run.
  nordbord?: { flag: Flag; freshness: string; score: number; last_test_at: string | null; metric_name: string; reference: string };
  forceframe?: { flag: Flag; freshness: string; score: number; last_test_at: string | null; metric_name: string; reference: string };
  cmj?: { flag: Flag; freshness: string; score: number; last_test_at: string | null; metric_name: string; reference: string };
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
  // Backfill state — separate from baseline-refresh because backfill calls
  // the live Catapult API for each day in the window and can take several
  // minutes. Track per-day progress so the coach knows it's still working.
  const [backfilling, setBackfilling] = React.useState(false);
  const [backfillStatus, setBackfillStatus] = React.useState<string | null>(null);
  // Decel B3 diagnostic — calls /api/integrations/catapult/debug-fields and
  // surfaces only the decel-relevant subset so we can see exactly which
  // parameter name Catapult is accepting and what raw key it returns. Used
  // when the b3 column refuses to populate after a re-sync.
  const [diagnosing, setDiagnosing] = React.useState(false);
  const [diagnosis, setDiagnosis] = React.useState<unknown>(null);

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

  /**
   * Diagnostic — calls /api/integrations/catapult/debug-fields with the user's
   * JWT and pulls out only the decel-relevant subset. Helps us see WHY the b3
   * column is still null after a re-sync: did Catapult reject our parameter
   * names, or is it returning the data under a key our normalize.ts aliases
   * don't recognise?
   */
  async function diagnoseDecelB3() {
    setDiagnosing(true);
    setError(null);
    setDiagnosis(null);
    try {
      const sb = getSupabaseClient();
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setError("Engin gilda session — endurinn­skráðu þig");
        return;
      }
      // Use a recent high-volume training day so any b3 events that exist
      // would show up. Apr 22 had 41 b2_3 + 15 sprints for Jónatan.
      const probeDate = "2026-04-22";
      const res = await fetch(
        `/api/integrations/catapult/debug-fields?date=${probeDate}`,
        { method: "GET", headers: { Authorization: `Bearer ${token}` } },
      );
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setError(`Diagnostic villa: ${json?.error ?? `HTTP ${res.status}`}`);
        return;
      }
      // Pick out only the b3-decel diagnostic fields so coach UI doesn't
      // drown in the full debug payload (which has 80+ keys for FMP, IMA, etc.)
      //
      // Normalize fields are on the SessionMetric directly (NOT under
      // .externalLoad — that's a different type used elsewhere). Look at
      // normalizedFirst.imaBand3DecelCount, etc.
      const normalizedExternal = (json.normalizedFirst as Record<string, unknown> | null) ?? {};
      const norm = (k: string) => (normalizedExternal[k] === undefined ? "<undefined>" : normalizedExternal[k]);
      setDiagnosis({
        date: json.date,
        activity: json.activity,
        athleteCount: json.athleteCount,
        decelB3PlusParameters: json.decelB3PlusParameters,
        decelB3PlusAcceptedParameters: json.decelB3PlusAcceptedParameters,
        decelB3PlusRejectedParameters: json.decelB3PlusRejectedParameters,
        decelB3PlusRevealedKeys: json.decelB3PlusRevealedKeys,
        decelKeys: json.decelKeys,
        decelKeysWithSamples: json.decelKeysWithSamples,
        // Normalized output — proves whether normalize.ts is doing its job.
        // "<undefined>" string sentinel makes missing keys visible (otherwise
        // JSON.stringify silently drops them).
        normalize_has_normalizedFirst: json.normalizedFirst != null,
        normalize_externalLoad_keys: Object.keys(normalizedExternal).sort(),
        normalize_decelB23TotEffsGen2: norm("decelB23TotEffsGen2"),
        normalize_decelB3PlusTotEffsGen2: norm("decelB3PlusTotEffsGen2"),
        normalize_imaBand1DecelCount: norm("imaBand1DecelCount"),
        normalize_imaBand2DecelCount: norm("imaBand2DecelCount"),
        normalize_imaBand3DecelCount: norm("imaBand3DecelCount"),
      });
    } catch (e: any) {
      setError(e?.message ?? "Diagnostic villa");
    } finally {
      setDiagnosing(false);
    }
  }

  /**
   * Re-fetch the last 7 days from Catapult so any newly-enabled Reporting
   * Parameters (e.g. "Deceleration B3 Efforts (Gen 2)") populate retroactively.
   *
   * Catapult does NOT backfill historical data when you enable a new
   * Reporting Parameter — it only starts capturing it for activities synced
   * from that point forward. So the only way to upgrade existing rows is to
   * re-run the per-day sync against the API with the new param active.
   *
   * Backfill is rate-limited to 7 days per click (≈ 3-5 min wall time) to
   * stay well inside Vercel's 300s function timeout. Click again for older
   * days if the 28-day window also needs upgrading.
   */
  async function backfillLastWeek() {
    setBackfilling(true);
    setError(null);
    setBackfillStatus("Sæki JWT token…");
    try {
      const sb = getSupabaseClient();
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setError("Engin gilda session — endurinn­skráðu þig");
        return;
      }

      // 7-day window ending yesterday (today's data isn't fully in yet)
      const today = new Date();
      const dateTo = new Date(today);
      dateTo.setUTCDate(dateTo.getUTCDate() - 1);
      const dateFrom = new Date(today);
      dateFrom.setUTCDate(dateFrom.getUTCDate() - 7);
      const fromStr = dateFrom.toISOString().slice(0, 10);
      const toStr = dateTo.toISOString().slice(0, 10);

      setBackfillStatus(`Endurnýja Catapult gögn ${fromStr} – ${toStr} (3-5 mín)…`);
      const res = await fetch(
        `/api/integrations/catapult/backfill?dateFrom=${fromStr}&dateTo=${toStr}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        const msg =
          json?.error ||
          (Array.isArray(json?.results)
            ? json.results.find((r: any) => r.status === "error")?.warning
            : undefined) ||
          `HTTP ${res.status}`;
        setError(`Backfill villa: ${msg}`);
        return;
      }

      setBackfillStatus("Endur-reikna baselines með nýjum gögnum…");
      await sb.rpc("refresh_mcburnie_decel_baselines");
      await load();
      setBackfillStatus(`Klárt — ${json.datesProcessed} dagar uppfærðir`);
      // Clear status banner after 6s
      setTimeout(() => setBackfillStatus(null), 6000);
    } catch (e: any) {
      setError(e?.message ?? "Backfill villa");
    } finally {
      setBackfilling(false);
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

  // Which decel source is the team on? Aggregate across all players that
  // have a status. Three meaningful states: ima (IMU-based, McBurnie-aligned),
  // mixed (transition), b2_3 (combined-intensity fallback).
  const decelSource = React.useMemo(() => {
    const sources = new Set(
      rows.map((r) => r.status?.decel_source).filter((s) => !!s) as string[],
    );
    if (sources.size === 0) return "unknown";
    const hasIma = sources.has("ima_band3_decel_count");
    const hasB3 = sources.has("decel_b3_plus_tot_effs_gen2");
    const hasB2_3 = sources.has("decel_b2_3_tot_effs_gen2");
    // Any high-intensity coverage + any fallback coverage = mixed
    if ((hasIma || hasB3) && hasB2_3) return "mixed";
    if (hasIma) return "ima";
    if (hasB3) return "b3plus";
    return "b2_3";
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
            Load × capacity injury-risk profile. McBurnie 2022 deceleration framework
            (5 external-load dims) combined with VALD neuromuscular capacity tests
            (Nordbord, ForceFrame, CMJ — 3 internal-capacity dims). Coupling load and
            capacity is the strongest single injury predictor per Hägglund 2013 / Opar 2015.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={backfillLastWeek}
            disabled={backfilling || refreshing || diagnosing}
            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            title="Re-fetch the last 7 days from Catapult so newly-enabled Reporting Parameters (e.g. Decel B3) start filling historic rows."
          >
            {backfilling ? "Sæki…" : "↻ Re-sync síðustu 7 daga"}
          </button>
          <button
            onClick={refreshBaselines}
            disabled={refreshing || backfilling || diagnosing}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {refreshing ? "Reikna…" : "↻ Endur-reikna baselines"}
          </button>
          <button
            onClick={diagnoseDecelB3}
            disabled={diagnosing || backfilling || refreshing}
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            title="Probe Catapult API to see exactly which Decel B3 parameter names it accepts and what raw key it returns the data under."
          >
            {diagnosing ? "Greini…" : "🔍 Greina Decel B3"}
          </button>
        </div>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CountCard tone="red"     label="Red" n={counts.red} />
        <CountCard tone="yellow"  label="Yellow" n={counts.yellow} />
        <CountCard tone="green"   label="Green" n={counts.green} />
        <CountCard tone="gray"    label="Insufficient data" n={counts.unknown} />
      </div>

      {/* Backfill progress banner — only visible while a re-sync is running.
          Runs ~30-60s per day so 7 days = ~3-5 min wall time. Coach can leave
          the page; backfill keeps running server-side until the route returns. */}
      {backfillStatus && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900">
          <strong>Catapult re-sync</strong>: {backfillStatus}
        </div>
      )}

      {/* Decel B3 diagnostic panel — only visible after the coach clicks
          "🔍 Greina Decel B3". Renders the raw probe results so we can see
          which Catapult parameter name was accepted and what raw key the
          data came back under. Pre-formatted JSON for easy copy-paste. */}
      {diagnosis != null && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <div className="mb-2 flex items-center justify-between">
            <strong>Decel B3 diagnostic</strong>
            <button
              onClick={() => setDiagnosis(null)}
              className="text-amber-700 hover:text-amber-900"
              title="Hide diagnostic"
            >
              ✕
            </button>
          </div>
          <pre className="overflow-x-auto rounded bg-white p-2 font-mono text-[10px] text-slate-800">
            {JSON.stringify(diagnosis, null, 2)}
          </pre>
          <p className="mt-2 text-[10px] italic text-amber-800">
            Look at <code>decelB3PlusAcceptedParameters</code> — if empty, Catapult
            rejected ALL our parameter name variants. If populated, look at
            <code> returnedKeys</code> for the raw key Catapult uses; that key needs
            to be added to <code>normalize.ts</code> aliases. Also scan
            <code> decelKeys</code> for any decel-named field already in the merged payload.
          </p>
        </div>
      )}

      {/* Decel-source banner — tells the coach which Catapult field is feeding
          the McBurnie engine right now. b3+ = biomechanically aligned with the
          paper. b2_3 = combined fallback that inflates ratios; risk thresholds
          rarely trigger. The banner doubles as a setup nudge for OpenField. */}
      {decelSource === "b2_3" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <div className="font-semibold">Using fallback decel source (Decel B2-3 combined)</div>
          <p className="mt-1">
            McBurnie's framework calls for high-intensity-only decels (band 3+, &gt;3 m/s²).
            Currently this team's data uses the combined b2-3 metric (&gt;2 m/s²), which
            includes moderate-intensity decels. Result: decel:sprint ratios are inflated
            (typical 5-15) and the 0.5/0.8 risk thresholds rarely trigger.
          </p>
          <p className="mt-1 italic">
            <strong>To switch to high-intensity-only:</strong> in Catapult OpenField →
            Settings → Reporting Parameters → add
            <em> "Deceleration B3 Efforts (Gen 2)"</em> to your Reporting_Parameters group,
            then re-run the next session sync. Once the column populates, this engine
            auto-upgrades on a per-player basis.
          </p>
        </div>
      )}
      {decelSource === "mixed" && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900">
          <strong>Decel source: mixed.</strong> Some players already have
          high-intensity-only data (b3+) populating; others are still on the
          combined fallback (b2-3) until their next sync arrives. Per-player
          status shown below — each row uses whichever source it has data for.
        </div>
      )}
      {decelSource === "b3plus" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
          <strong>Decel source: GPS Gen-2 high-intensity (b3+).</strong> Fully
          aligned with McBurnie 2022 — decel:sprint ratios should now compress to
          a clinically meaningful range (typically 0.5-3.0) where the risk
          thresholds actually trigger.
        </div>
      )}
      {decelSource === "ima" && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
          <strong>Decel source: IMA Band 3 (IMU-based high-intensity).</strong>
          {" "}Fully aligned with McBurnie 2022 — decel events measured directly
          by the pod's accelerometer (works indoor and outdoor, no GPS dependency).
          Ratios should now sit in the clinically meaningful 0.5-3.0 range where
          the risk thresholds match the paper's intent.
        </div>
      )}

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
            <strong>Decel:Sprint coupling (McBurnie's primary risk metric):</strong> Decel
            events divided by Catapult sprint event count (Vel B6+ Total # Efforts Gen 2,
            not distance proxy). Healthy ≥0.8 (every sprint followed by at least one
            high-intensity brake). Red if &lt;0.5 (sprinting without proportional braking).
            <strong> Decel input prefers Decel B3+ Total # Efforts (Gen 2)</strong> when
            populated — high-intensity-only events that match the eccentric demand of
            sprint braking. Falls back to Decel B2-3 (combined) for historical data, but
            note that the combined input inflates ratios (typical 5-15) so the McBurnie
            thresholds rarely trigger. The per-team banner above shows which source is
            currently in use.
          </li>
          <li>
            <strong>Exposure concentration:</strong> What % of 28-day cumulative volume happened in
            the single peak day. Red if &gt;30% (McBurnie's "tall-thin force-time" pattern; concentrated
            mechanical loading more dangerous than distributed).
          </li>
          <li>
            <strong>Nordbord (eccentric hamstring):</strong> Bilateral eccentric peak force from
            VALD Nordbord nordic-curl test, plus L/R asymmetry %. Red if asymmetry &gt; 15% or
            absolute force drops &gt; 15% from baseline. Loaded high + weak hamstring = the single
            strongest hamstring-strain predictor (Opar 2015).
          </li>
          <li>
            <strong>ForceFrame (hip/groin isometric):</strong> Adductor squeeze + abductor isometric
            peak force from VALD ForceFrame, with L/R asymmetry. Red if adductor force drop &gt; 10%
            from baseline or asymmetry &gt; 15%. Loaded high + weak adductor = groin-injury risk
            multiplier (Hägglund 2013).
          </li>
          <li>
            <strong>CMJ (countermovement jump):</strong> Jump height, RSI-modified, and peak power
            from VALD ForceDecks dual-plate CMJ test, vs personal rolling baseline. Red if drop
            ≥ 5% from baseline = neuromuscular fatigue marker (Buchheit 2010, Claudino 2017).
          </li>
        </ul>
        <p className="mt-2 text-slate-600">
          <strong>References:</strong> McBurnie 2022 (decel framework), Hägglund 2013 (adductor strength),
          Opar 2015 (Nordic hamstring), Buchheit 2010 (CMJ fatigue), Claudino 2017 (CMJ monitoring).
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
          {/* Neuromuscular capacity chips. Render only if SQL returns the dim
              (graceful degradation if the function pre-dates this version). */}
          {s?.nordbord && <FlagBadge flag={s.nordbord.flag} label="Nordbord" />}
          {s?.forceframe && <FlagBadge flag={s.forceframe.flag} label="ForceFrame" />}
          {s?.cmj && <FlagBadge flag={s.cmj.flag} label="CMJ" />}
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
            {/* Neuromuscular capacity row — load × capacity = real risk picture.
                Each card shows last-test date when present so coach can see
                data freshness; "Engin gögn" when test type isn't being used. */}
            {s.nordbord && (
              <Detail
                title="Nordbord — Hamstring"
                flag={s.nordbord.flag}
                big={s.nordbord.flag === "unknown" ? "Engin gögn" : `${s.nordbord.score.toFixed(1)}`}
                caption={
                  s.nordbord.last_test_at
                    ? `Síðasta próf ${new Date(s.nordbord.last_test_at).toLocaleDateString("is-IS")} · ${s.nordbord.metric_name}`
                    : `Engin Nordbord-próf gerð ennþá · ${s.nordbord.metric_name}`
                }
                hint={s.nordbord.reference}
              />
            )}
            {s.forceframe && (
              <Detail
                title="ForceFrame — Groin/Hip"
                flag={s.forceframe.flag}
                big={s.forceframe.flag === "unknown" ? "Engin gögn" : `${s.forceframe.score.toFixed(1)}`}
                caption={
                  s.forceframe.last_test_at
                    ? `Síðasta próf ${new Date(s.forceframe.last_test_at).toLocaleDateString("is-IS")} · ${s.forceframe.metric_name}`
                    : `Engin ForceFrame-próf gerð ennþá · ${s.forceframe.metric_name}`
                }
                hint={s.forceframe.reference}
              />
            )}
            {s.cmj && (
              <Detail
                title="CMJ — Neuromuscular"
                flag={s.cmj.flag}
                big={s.cmj.flag === "unknown" ? "Engin gögn" : `${s.cmj.score.toFixed(1)}`}
                caption={
                  s.cmj.last_test_at
                    ? `Síðasta próf ${new Date(s.cmj.last_test_at).toLocaleDateString("is-IS")} · ${s.cmj.metric_name}`
                    : `Engin CMJ-próf gerð ennþá · ${s.cmj.metric_name}`
                }
                hint={s.cmj.reference}
              />
            )}
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
