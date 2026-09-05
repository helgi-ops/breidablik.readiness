"use client";

/**
 * Presentational view of a build-up adherence read — shared by the coach
 * Periodization Hub card and the player app's read-only "my build-up" card, so
 * both surfaces render the identical layered story: one-sentence verdict → 2–3
 * plain facts → per-week strip → per-KPI table + ACWR + IMA drivers behind
 * "Show details". Descriptive — never the readiness colour.
 *
 * Pure presentational: it takes an already-computed `BuildUpAdherence` and never
 * fetches or computes. The caller (coach or player) supplies the adherence.
 */
import React from "react";
import {
  KPI_LABEL,
  DRIVER_LABEL,
  DRIVER_UNIT,
  type BuildUpAdherence,
  type AdherenceStatus,
} from "@/lib/micropulse/buildUpTracking";

export const STATUS_HEX: Record<AdherenceStatus, string> = {
  on: "#1c7a4a",
  behind: "#de9328",
  ahead: "#2740e6",
  no_data: "#64748b",
};

function pctText(pct: number | null): string {
  return pct == null ? "—" : `${Math.round(pct * 100)}%`;
}
function fmt(v: number | null): string {
  if (v == null) return "—";
  return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(Math.round(v));
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

type Props = {
  adh: BuildUpAdherence;
  isEN: boolean;
  title: string;
  subtitle?: string;
};

export default function BuildUpAdherenceView({ adh, isEN, title, subtitle }: Props) {
  const [showDetails, setShowDetails] = React.useState(false);
  const T = (en: string, is: string) => (isEN ? en : is);

  const verdictHex = adh.latestWeekIndex == null ? "#64748b" : STATUS_HEX[adh.weeks[adh.latestWeekIndex]?.status ?? "no_data"];
  const elapsed = adh.weeks.filter((w) => w.elapsed);
  const latest = adh.latestWeekIndex != null ? adh.weeks[adh.latestWeekIndex] : null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{subtitle}</span>}
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-slate-500">
          <span className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 font-semibold text-[#2740e6]">
            {isEN ? PHASE_LABEL[adh.phase].en : PHASE_LABEL[adh.phase].is}
          </span>
          <span>{isEN ? CONF_LABEL[adh.confidence].en : CONF_LABEL[adh.confidence].is}</span>
        </span>
      </div>

      {/* (0) Verdict */}
      <p className="mt-2 text-[14px] font-bold" style={{ color: verdictHex }}>
        {isEN ? adh.verdict.en : adh.verdict.is}
      </p>

      {/* (1) Plain facts */}
      <ul className="mt-1.5 space-y-0.5">
        {adh.facts.map((f, i) => (
          <li key={i} className="text-[12px] text-slate-700">· {isEN ? f.en : f.is}</li>
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
                  <span title={`${spikeLabels.join(", ")} — ${T("faster than safe +10%/wk", "hraðar en örugg +10%/viku")}`}>⚠</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* (2) Details toggle */}
      <button onClick={() => setShowDetails(!showDetails)} className="mt-2.5 text-[11px] font-medium text-[#2740e6] hover:underline">
        {showDetails ? T("Hide details", "Fela smáatriði") : T("Show details", "Sýna smáatriði")}
      </button>

      {showDetails && (
        <div className="mt-2 space-y-3">
          {adh.acwr && adh.acwr.ratio != null && (
            <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
              <span className="font-semibold">ACWR 7:28</span> {adh.acwr.ratio.toFixed(2)}{" "}
              <span className="text-slate-400">
                ({adh.acwr.band.replace(/_/g, " ").toLowerCase()} · {adh.acwr.daysObserved}/28 {T("load-days", "álagsdagar")})
              </span>
            </div>
          )}

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
                      <td className="py-0.5 text-right font-semibold tabular-nums" style={{ color: STATUS_HEX[k.status] }}>
                        {pctText(k.pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

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
                      >
                        {d.trend === "up" ? "▲" : d.trend === "down" ? "▼" : "▬"}
                        {d.deltaPct != null ? ` ${d.deltaPct > 0 ? "+" : ""}${Math.round(d.deltaPct * 100)}%` : ""}
                      </span>
                    )}
                    {d.spike && <span className="text-amber-600" title={T("faster than safe +10%/wk", "hraðar en örugg +10%/viku")}>⚠</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="space-y-0.5 text-[9px] text-slate-400">
            {adh.provenance.map((p, i) => (
              <li key={i}>· {p}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[9px] text-slate-400">
        {T(
          "Descriptive — planned build-up ramp vs actual accrued training load (GPS/IMA). Match days excluded. Not the readiness verdict.",
          "Lýsandi — planaður uppbyggingar-rampi vs raun-uppsafnað æfingaálag (GPS/IMA). Leikdagar undanskildir. Ekki readiness-liturinn.",
        )}
      </p>
    </div>
  );
}
