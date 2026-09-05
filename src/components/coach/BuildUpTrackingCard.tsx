"use client";

/**
 * Build-up tracking card — actual accrued weekly training load vs the planned
 * periodization ramp, for the selected player, on the Periodization Hub's
 * Players tab. Layered read (explainability-first): one-sentence verdict →
 * 2–3 plain facts → per-KPI table + ACWR behind "Show details".
 *
 * The plan (CalendarBlock) is computed client-side by the hub; this card fetches
 * the actuals + chronic maturity from /api/coach/build-up-tracking and runs the
 * pure `computeBuildUpAdherence`. Descriptive — never the readiness colour.
 */
import React from "react";
import type { CalendarBlock } from "@/lib/micropulse/periodization";
import {
  computeBuildUpAdherence,
  KPI_LABEL,
  DRIVER_LABEL,
  DRIVER_UNIT,
  type BuildUpAdherence,
  type WeekActual,
  type BuildUpAcwr,
  type AdherenceStatus,
} from "@/lib/micropulse/buildUpTracking";

type Props = {
  playerId: string;
  playerName: string;
  block: CalendarBlock;
  planConfidence: "high" | "medium" | "low";
  authHeader: () => Promise<string>;
  isEN: boolean;
};

const STATUS_HEX: Record<AdherenceStatus, string> = {
  on: "#1c7a4a",
  behind: "#de9328",
  ahead: "#2740e6",
  no_data: "#64748b",
};

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The block's planned match dates (day.type === "match"), reconstructed from
 *  each week's Monday + day index — the hub's CalDay has no date field. */
function blockMatchDates(block: CalendarBlock): string[] {
  const out: string[] = [];
  for (const wk of block.weeks) {
    wk.days.forEach((d, i) => {
      if (d.type === "match") out.push(addDaysIso(wk.weekStart, i));
    });
  }
  return out;
}

function pctText(pct: number | null): string {
  return pct == null ? "—" : `${Math.round(pct * 100)}%`;
}

const PHASE_LABEL: Record<BuildUpAdherence["phase"], { en: string; is: string }> = {
  plan_relative: { en: "vs plan · baseline building", is: "vs plan · grunnlína að byggjast" },
  blended: { en: "vs plan + rolling", is: "vs plan + rúllandi" },
  rolling: { en: "rolling / ACWR trusted", is: "rúllandi / ACWR áreiðanlegt" },
};

const CONF_LABEL: Record<"high" | "moderate" | "low", { en: string; is: string }> = {
  high: { en: "high confidence", is: "mikil vissa" },
  moderate: { en: "moderate confidence", is: "meðal vissa" },
  low: { en: "low confidence", is: "lítil vissa" },
};

export default function BuildUpTrackingCard({ playerId, playerName, block, planConfidence, authHeader, isEN }: Props) {
  const [state, setState] = React.useState<{ loading: boolean; error: string | null; adh: BuildUpAdherence | null }>({
    loading: true,
    error: null,
    adh: null,
  });
  const [showDetails, setShowDetails] = React.useState(false);

  const startDate = block.startDate;
  const numWeeks = block.numWeeks;

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setState({ loading: true, error: null, adh: null });
      try {
        const asOf = new Date().toISOString().slice(0, 10);
        const from = startDate;
        const to = asOf < from ? from : asOf;
        const matchDates = blockMatchDates(block);
        const qs = new URLSearchParams({ playerId, from, to, matchDates: matchDates.join(",") });
        const res = await fetch(`/api/coach/build-up-tracking?${qs.toString()}`, {
          headers: { Authorization: await authHeader() },
        });
        const json = (await res.json()) as {
          ok: boolean;
          error?: string;
          weeks?: WeekActual[];
          daysObserved?: number;
          acwr?: BuildUpAcwr;
        };
        if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        const adh = computeBuildUpAdherence({
          block,
          actualWeeks: json.weeks ?? [],
          asOf,
          daysObserved: json.daysObserved ?? 0,
          planConfidence,
          acwr: json.acwr ?? null,
        });
        if (!cancelled) setState({ loading: false, error: null, adh });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : "Error", adh: null });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-fetch when the player or the plan window changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, startDate, numWeeks]);

  const T = (en: string, is: string) => (isEN ? en : is);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{T("Build-up tracking", "Uppbyggingar-eftirlit")}</h2>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
          {playerName}
        </span>
        {state.adh && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 font-semibold text-[#2740e6]">
              {isEN ? PHASE_LABEL[state.adh.phase].en : PHASE_LABEL[state.adh.phase].is}
            </span>
            <span>{isEN ? CONF_LABEL[state.adh.confidence].en : CONF_LABEL[state.adh.confidence].is}</span>
          </span>
        )}
      </div>

      {state.loading && <p className="mt-2 text-[12px] text-slate-400">{T("Loading actuals…", "Sæki raungögn…")}</p>}
      {state.error && (
        <p className="mt-2 text-[12px] text-amber-700">
          {T("Could not load actuals", "Náði ekki í raungögn")}: {state.error}
        </p>
      )}

      {state.adh && (
        <BuildUpBody adh={state.adh} isEN={isEN} showDetails={showDetails} setShowDetails={setShowDetails} T={T} />
      )}

      <p className="mt-3 text-[9px] text-slate-400">
        {T(
          "Descriptive — planned build-up ramp vs actual accrued training load (GPS/IMA). Match days excluded. Not the readiness verdict.",
          "Lýsandi — planaður uppbyggingar-rampi vs raun-uppsafnað æfingaálag (GPS/IMA). Leikdagar undanskildir. Ekki readiness-liturinn.",
        )}
      </p>
    </section>
  );
}

function BuildUpBody({
  adh,
  isEN,
  showDetails,
  setShowDetails,
  T,
}: {
  adh: BuildUpAdherence;
  isEN: boolean;
  showDetails: boolean;
  setShowDetails: (v: boolean) => void;
  T: (en: string, is: string) => string;
}) {
  const verdictHex =
    adh.latestWeekIndex == null
      ? "#64748b"
      : STATUS_HEX[adh.weeks[adh.latestWeekIndex]?.status ?? "no_data"];
  const elapsed = adh.weeks.filter((w) => w.elapsed);
  const latest = adh.latestWeekIndex != null ? adh.weeks[adh.latestWeekIndex] : null;

  return (
    <>
      {/* (0) Verdict */}
      <p className="mt-2 text-[14px] font-bold" style={{ color: verdictHex }}>
        {isEN ? adh.verdict.en : adh.verdict.is}
      </p>

      {/* (1) Plain facts */}
      <ul className="mt-1.5 space-y-0.5">
        {adh.facts.map((f, i) => (
          <li key={i} className="text-[12px] text-slate-700">
            · {isEN ? f.en : f.is}
          </li>
        ))}
      </ul>

      {/* (1) Per-week strip — ⚠ on a plan-KPI OR a driver (CoD) climbing faster than the safe +10%/wk */}
      {elapsed.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {elapsed.map((w) => {
            const spikeLabels = [
              ...w.kpis.filter((k) => k.spike).map((k) => (isEN ? KPI_LABEL[k.kpi].en : KPI_LABEL[k.kpi].is)),
              ...w.drivers.filter((d) => d.spike).map((d) => (isEN ? DRIVER_LABEL[d.kpi].en : DRIVER_LABEL[d.kpi].is)),
            ];
            return (
              <span
                key={w.index}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ backgroundColor: `${STATUS_HEX[w.status]}14`, color: STATUS_HEX[w.status] }}
                title={w.weekStart}
              >
                {T("Wk", "V")}
                {w.index + 1} · {pctText(w.pctOverall)}
                {spikeLabels.length > 0 && (
                  <span
                    title={`${spikeLabels.join(", ")} — ${T("faster than safe +10%/wk", "hraðar en örugg +10%/viku")}`}
                  >
                    ⚠
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* (2) Details toggle */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="mt-2.5 text-[11px] font-medium text-[#2740e6] hover:underline"
      >
        {showDetails ? T("Hide details", "Fela smáatriði") : T("Show details", "Sýna smáatriði")}
      </button>

      {showDetails && (
        <div className="mt-2 space-y-3">
          {/* ACWR echo (phase 2+) */}
          {adh.acwr && adh.acwr.ratio != null && (
            <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
              <span className="font-semibold">ACWR 7:28</span> {adh.acwr.ratio.toFixed(2)}{" "}
              <span className="text-slate-400">
                ({adh.acwr.band.replace(/_/g, " ").toLowerCase()} · {adh.acwr.daysObserved}/28{" "}
                {T("load-days", "álagsdagar")})
              </span>
            </div>
          )}

          {/* Latest elapsed week per-KPI table */}
          {latest && (
            <div className="overflow-x-auto">
              <p className="mb-1 text-[11px] font-semibold text-slate-500">
                {T(`Week ${latest.index + 1} — planned vs actual`, `Vika ${latest.index + 1} — plan vs raun`)}
              </p>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-slate-400">
                    <th className="py-0.5 text-left font-medium">KPI</th>
                    <th className="py-0.5 text-right font-medium">{T("Planned", "Plan")}</th>
                    <th className="py-0.5 text-right font-medium">{T("Actual", "Raun")}</th>
                    <th className="py-0.5 text-right font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.kpis.map((k) => (
                    <tr key={k.kpi} className="border-t border-slate-100">
                      <td className="py-0.5 text-slate-700">
                        {isEN ? KPI_LABEL[k.kpi].en : KPI_LABEL[k.kpi].is}
                        {k.spike && <span className="ml-1 text-amber-600">⚠</span>}
                      </td>
                      <td className="py-0.5 text-right tabular-nums text-slate-500">{fmt(k.planned)}</td>
                      <td className="py-0.5 text-right tabular-nums text-slate-700">{fmt(k.actual)}</td>
                      <td
                        className="py-0.5 text-right font-semibold tabular-nums"
                        style={{ color: STATUS_HEX[k.status] }}
                      >
                        {pctText(k.pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* IMA drivers — context, no plan target */}
          {latest && latest.drivers.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-slate-500">
                {T("Drivers — context (no plan target)", "Driverar — samhengi (ekkert plan-markmið)")}
              </p>
              <ul className="space-y-0.5">
                {latest.drivers.map((d) => (
                  <li key={d.kpi} className="flex items-center gap-1.5 text-[11px] text-slate-700">
                    <span>{isEN ? DRIVER_LABEL[d.kpi].en : DRIVER_LABEL[d.kpi].is}</span>
                    <span className="tabular-nums font-semibold">{fmt(d.value)}</span>
                    <span className="text-[10px] text-slate-400">{isEN ? DRIVER_UNIT[d.kpi].en : DRIVER_UNIT[d.kpi].is}</span>
                    {d.trend && (
                      <span
                        className="text-[10px]"
                        style={{ color: d.trend === "up" ? "#1c7a4a" : d.trend === "down" ? "#a83e28" : "#64748b" }}
                        title={d.deltaPct != null ? `${d.deltaPct > 0 ? "+" : ""}${Math.round(d.deltaPct * 100)}%` : ""}
                      >
                        {d.trend === "up" ? "▲" : d.trend === "down" ? "▼" : "▬"}
                        {d.deltaPct != null ? ` ${d.deltaPct > 0 ? "+" : ""}${Math.round(d.deltaPct * 100)}%` : ""}
                      </span>
                    )}
                    {d.spike && (
                      <span className="text-amber-600" title={T("faster than safe +10%/wk", "hraðar en örugg +10%/viku")}>⚠</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Provenance */}
          <ul className="space-y-0.5 text-[9px] text-slate-400">
            {adh.provenance.map((p, i) => (
              <li key={i}>· {p}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function fmt(v: number | null): string {
  if (v == null) return "—";
  return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(Math.round(v));
}
