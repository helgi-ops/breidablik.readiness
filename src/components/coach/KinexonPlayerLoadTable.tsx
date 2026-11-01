"use client";

/**
 * Per-player Kinexon load — the squad panel's drill-down.
 *
 * KinexonMetricsPanel pools every player into one squad series; this breaks the
 * same Kinexon variables out PER PLAYER: each player's 7-day load with an
 * acute:chronic ratio on Player Load (the load-status flag), plus Changes of
 * Direction / Orientation, Exertions and Mechanical Load. Reads each metric via
 * the Kinexon catalog (typed column first, else the raw header). Descriptive
 * external load (indoor LPS) — never a readiness verdict.
 */

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KINEXON_CATALOG, readKinexonMetric, type KinexonMetric } from "@/lib/integrations/kinexon/metricCatalog";
import type { KinexonPlayerInput } from "./KinexonMetricsPanel";

const metric = (key: string): KinexonMetric => KINEXON_CATALOG.flatMap((g) => g.metrics).find((m) => m.key === key)!;
const M_PL = metric("player_load");
const COLS: Array<{ key: string; m: KinexonMetric; enHead: string; isHead: string }> = [
  { key: "cod", m: metric("cod"), enHead: "CoD", isHead: "Stefnubr." },
  { key: "coo", m: metric("coo"), enHead: "CoO", isHead: "Snún." },
  { key: "exertions", m: metric("exertions"), enHead: "Exert", isHead: "Átök" },
  { key: "mech_load", m: metric("mech_load"), enHead: "Mech", isHead: "Vélr." },
];

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
const fmt = (v: number | null, digits = 0): string => (v == null ? "–" : v.toLocaleString(undefined, { maximumFractionDigits: digits }));

export default function KinexonPlayerLoadTable({
  players,
  date,
  lang,
}: {
  players: KinexonPlayerInput[];
  date: string;
  lang: "EN" | "IS";
}) {
  const isEN = lang === "EN";
  const acuteStart = dateMinusDays(date, 6);
  const chronicStart = dateMinusDays(date, 27);

  const snap = (history: Array<Record<string, unknown>>, m: KinexonMetric) => {
    const acute: number[] = [];
    const chronic: number[] = [];
    for (const row of history) {
      const d = String(row.date ?? "").slice(0, 10);
      if (!d) continue;
      const v = readKinexonMetric(row, m);
      if (v == null) continue;
      if (d >= acuteStart && d <= date) acute.push(v);
      if (d >= chronicStart && d <= date) chronic.push(v);
    }
    const a7 = mean(acute);
    const c28 = mean(chronic);
    const acwr = m.kind === "volume" && a7 != null && c28 != null && c28 > 0 ? a7 / c28 : null;
    return { a7, c28, acwr };
  };

  const rows = players
    .map((p) => ({
      name: p.name || "—",
      pl: snap(p.history, M_PL),
      cells: COLS.map((c) => ({ ...c, v: snap(p.history, c.m).a7 })),
    }))
    .filter((r) => r.pl.a7 != null || r.cells.some((c) => c.v != null))
    .sort((a, b) => (b.pl.a7 ?? -1) - (a.pl.a7 ?? -1));

  if (rows.length === 0) return null;
  const nSpike = rows.filter((r) => r.pl.acwr != null && (r.pl.acwr > 1.3 || r.pl.acwr < 0.8)).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{isEN ? "Per-player Kinexon load" : "Kinexon álag per leikmann"}</CardTitle>
        <CardDescription>
          {isEN
            ? "Each player's 7-day Kinexon load — Player Load with its acute:chronic ratio, plus changes of direction/orientation, exertions and mechanical load. Descriptive — never the readiness verdict."
            : "7-daga Kinexon álag hvers leikmanns — Player Load með bráða:langvinnu hlutfalli, ásamt stefnubreytingum/snúningum, átökum og vélrænu álagi. Lýsandi — aldrei readiness-dómur."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-sm font-semibold text-slate-700">
          {nSpike > 0
            ? isEN ? `${nSpike} player${nSpike === 1 ? "" : "s"} outside the normal acute:chronic band on Player Load.` : `${nSpike} leikm${nSpike === 1 ? "aður" : "enn"} utan eðlilegs bráða:langvinnu bands á Player Load.`
            : isEN ? "Every player's Player Load sits within his normal acute:chronic band." : "Player Load allra leikmanna innan eðlilegs bráða:langvinnu bands."}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-1.5 pr-2 font-medium">{isEN ? "Player" : "Leikmaður"}</th>
                <th className="py-1.5 px-2 text-right font-medium">{isEN ? "PL (7d)" : "PL (7d)"}</th>
                <th className="py-1.5 px-2 text-right font-medium">ACWR</th>
                {COLS.map((c) => (
                  <th key={c.key} className="py-1.5 px-2 text-right font-medium">{isEN ? c.enHead : c.isHead}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 font-medium text-slate-800">{r.name}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-700">{fmt(r.pl.a7, 1)}</td>
                  <td className={`py-1.5 px-2 text-right font-semibold tabular-nums ${acwrTone(r.pl.acwr)}`}>{r.pl.acwr == null ? "–" : r.pl.acwr.toFixed(2)}</td>
                  {r.cells.map((c) => (
                    <td key={c.key} className="py-1.5 px-2 text-right tabular-nums text-slate-600">{fmt(c.v, 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
