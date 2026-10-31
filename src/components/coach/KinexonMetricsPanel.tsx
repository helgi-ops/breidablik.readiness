"use client";

/**
 * Full Kinexon metrics panel — catalog-driven.
 *
 * Kinexon is an indoor local-positioning system that captures a full external
 * variable set (~200 columns in a Perform export). This renders every family in
 * KINEXON_CATALOG from the players' load history: squad-average today vs the 7-
 * and 28-day baselines, with an acute:chronic ratio on accumulation metrics only.
 * Each metric reads its typed column first, else the original Kinexon header out
 * of raw_payload_json — so nothing in the export is lost, and no family needs a
 * dedicated DB column. Families with no data at all auto-hide (feed honesty).
 *
 * Descriptive external load (Kinexon indoor LPS) — never a readiness verdict.
 * Shared by Load Intelligence and the coach External/IMA tab.
 */

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KINEXON_CATALOG, readKinexonMetric, type KinexonMetric } from "@/lib/integrations/kinexon/metricCatalog";

export type KinexonPlayerInput = {
  id: string;
  name: string;
  position: string;
  history: Array<Record<string, unknown>>;
};

function dateMinusDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function mean(vals: number[]): number | null {
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
}

function acwrTone(v: number | null): string {
  if (v == null) return "text-slate-400";
  if (v > 1.5 || v < 0.5) return "text-rose-600";
  if (v > 1.3 || v < 0.8) return "text-amber-600";
  return "text-emerald-600";
}

export default function KinexonMetricsPanel({
  players,
  date,
  lang,
}: {
  players: KinexonPlayerInput[];
  date: string;
  lang: "EN" | "IS";
}) {
  // Pool every player's window history into one squad series per metric.
  const pooled = React.useMemo(() => players.flatMap((p) => p.history), [players]);

  const acuteStart = dateMinusDays(date, 6);
  const chronicStart = dateMinusDays(date, 27);

  function snapshot(m: KinexonMetric) {
    const today: number[] = [];
    const acute: number[] = [];
    const chronic: number[] = [];
    for (const row of pooled) {
      const d = String(row.date ?? "").slice(0, 10);
      if (!d) continue;
      const v = readKinexonMetric(row, m);
      if (v == null) continue;
      if (d === date) today.push(v);
      if (d >= acuteStart && d <= date) acute.push(v);
      if (d >= chronicStart && d <= date) chronic.push(v);
    }
    const a7 = mean(acute);
    const c28 = mean(chronic);
    const acwr = m.kind === "volume" && a7 != null && c28 != null && c28 > 0 ? a7 / c28 : null;
    return { today: mean(today), a7, c28, acwr, has: chronic.length > 0 || today.length > 0 };
  }

  // Compute once; drop metrics with no data and families left empty.
  const groups = KINEXON_CATALOG.map((g) => {
    const rows = g.metrics
      .map((m) => ({ m, snap: snapshot(m) }))
      .filter((r) => r.snap.has);
    return { g, rows };
  }).filter((grp) => grp.rows.length > 0);

  if (groups.length === 0) return null;

  const fmt = (n: number | null, digits: number) => (n == null ? "—" : n.toFixed(digits));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold uppercase tracking-widest text-slate-900">
          {lang === "EN" ? "Full Kinexon metrics" : "Allir Kinexon mælikvarðar"}
        </CardTitle>
        <CardDescription className="mt-1 text-sm text-slate-500">
          {lang === "EN"
            ? "Everything Kinexon captures indoors — squad average today vs the 7- and 28-day baselines. ACWR is shown for accumulation metrics only; empty families are hidden."
            : "Allt sem Kinexon mælir innandyra — meðaltal sveitar í dag á móti 7- og 28-daga grunnlínum. ACWR aðeins fyrir uppsöfnunarmælikvarða; tómar fjölskyldur faldar."}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 space-y-5">
        {groups.map(({ g, rows }) => (
          <div key={g.key}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {lang === "EN" ? g.titleEN : g.titleIS}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-1.5 text-left font-semibold">{lang === "EN" ? "Metric" : "Mælikvarði"}</th>
                    <th className="px-3 py-1.5 text-right font-semibold">{lang === "EN" ? "Today" : "Í dag"}</th>
                    <th className="px-3 py-1.5 text-right font-semibold">7d</th>
                    <th className="px-3 py-1.5 text-right font-semibold">28d</th>
                    <th className="px-3 py-1.5 text-right font-semibold">ACWR</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ m, snap }) => (
                    <tr key={m.key} className="border-b border-slate-100">
                      <td className="px-3 py-1.5 text-slate-700">
                        {lang === "EN" ? m.labelEN : m.labelIS}
                        {m.unit ? <span className="text-slate-400"> ({m.unit})</span> : null}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium text-slate-900">{fmt(snap.today, m.digits)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmt(snap.a7, m.digits)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{fmt(snap.c28, m.digits)}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${m.kind === "volume" ? acwrTone(snap.acwr) : "text-slate-300"}`}>
                        {m.kind === "volume" ? (snap.acwr == null ? "—" : snap.acwr.toFixed(2)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        <p className="text-[11px] text-slate-400">
          {lang === "EN"
            ? "Descriptive external load (Kinexon indoor LPS) — never a readiness verdict. ACWR = 7-day ÷ 28-day squad mean (Gabbett 2016). Every export column is preserved; per-minute and per-zone variants live in the raw record."
            : "Lýsandi ytra álag (Kinexon innistaðsetning) — aldrei readiness-dómur. ACWR = 7-daga ÷ 28-daga meðaltal sveitar (Gabbett 2016). Allir dálkar útflutnings varðveittir; á-mínútu og svæða-afbrigði eru í hráu færslunni."}
        </p>
      </CardContent>
    </Card>
  );
}
