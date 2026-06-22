"use client";

/**
 * SquadLoadTable — per-player 7-day acute / 28-day chronic / ACWR
 * snapshot across each external-load metric.
 *
 * Extracted from the GPS Data tab where it was crammed alongside the
 * raw daily numbers + Load Intelligence. Now lives on the Quadrant
 * view (Quadrant IS the acute/chronic story, so this is the natural
 * companion to the 2x2 chart).
 *
 * Football and basketball use different metric sets — passed in via
 * the `sport` prop so the component doesn't need to know the team's
 * sport itself.
 */

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export type SquadLoadPlayer = {
  id: string;
  name: string;
  position: string;
  history: Array<Record<string, unknown>>;
};

type Metric = {
  key: string;
  label: string;
  shortLabel: string;
  aliases: string[];
  digits: number;
};

// Football metric set for FULL Catapult plans (Gabbett 2017 — includes
// B2-3 explosive-effort columns + Tot Accels/Decels for high-fidelity
// load discrimination).
const FOOTBALL_METRICS_FULL: Metric[] = [
  { key: "totalDistance",              label: "Total Distance (m)",         shortLabel: "Total Dist",  aliases: ["totalDistance", "total_distance"],                                                                    digits: 0 },
  { key: "velocityBand5TotalDistance", label: "Vel Band 5 Dist (m)",        shortLabel: "Vel B5 Dist", aliases: ["velocityBand5TotalDistance", "velocity_band5_total_distance"],                                         digits: 0 },
  { key: "velocityBand6TotalDistance", label: "Vel Band 6 Dist (m)",        shortLabel: "Vel B6 Dist", aliases: ["velocityBand6TotalDistance", "velocity_band6_total_distance"],                                         digits: 0 },
  { key: "accelBand2to3Efforts",       label: "Accel B2-3 Efforts (Gen 2)", shortLabel: "Accel B2-3",  aliases: ["accelBand2to3Efforts", "accel_band2to3_efforts", "accel_b2_3_tot_effs_gen2", "accelB23TotEffsGen2"],  digits: 0 },
  { key: "totalAccelerations",         label: "Tot Accels (#)",             shortLabel: "Tot Accels",  aliases: ["totalAccelerations", "total_accelerations", "tot_as", "totAs"],                                       digits: 0 },
  { key: "decelBand2to3Efforts",       label: "Decel B2-3 Efforts (Gen 2)", shortLabel: "Decel B2-3",  aliases: ["decelBand2to3Efforts", "decel_band2to3_efforts", "decel_b2_3_tot_effs_gen2", "decelB23TotEffsGen2"],  digits: 0 },
  { key: "totalDecelerations",         label: "Tot Decels (#)",             shortLabel: "Tot Decels",  aliases: ["totalDecelerations", "total_decelerations", "tot_ds", "totDs"],                                       digits: 0 },
];

// Football metric set for LITE Catapult plans — drops B2-3 efforts and
// Tot Accels/Decels (those columns aren't exposed on Lite plans). Adds
// HSR Distance, Sprint Distance, Sprint Efforts and Max Velocity instead
// — the highest-evidence injury proxies in the Malone 2017 / Buchheit
// 2019 hamstring-injury literature when accel/decel data isn't available.
const FOOTBALL_METRICS_LITE: Metric[] = [
  { key: "totalDistance",              label: "Total Distance (m)",     shortLabel: "Total Dist",  aliases: ["totalDistance", "total_distance"],                                                              digits: 0 },
  { key: "highSpeedDistance",          label: "HSR Distance (m)",       shortLabel: "HSR Dist",    aliases: ["highSpeedDistance", "high_speed_distance", "hir_dist"],                                          digits: 0 },
  { key: "sprintDistance",             label: "Sprint Distance (m)",    shortLabel: "Sprint Dist", aliases: ["sprintDistance", "sprint_distance"],                                                            digits: 0 },
  { key: "velocityBand5TotalDistance", label: "Vel Band 5 Dist (m)",    shortLabel: "Vel B5 Dist", aliases: ["velocityBand5TotalDistance", "velocity_band5_total_distance"],                                   digits: 0 },
  { key: "velocityBand6TotalDistance", label: "Vel Band 6 Dist (m)",    shortLabel: "Vel B6 Dist", aliases: ["velocityBand6TotalDistance", "velocity_band6_total_distance"],                                   digits: 0 },
  { key: "sprintEfforts",              label: "Sprint Efforts (#)",     shortLabel: "Sprint Eff",  aliases: ["velocity_band6_total_efforts_gen2", "velocityBand6TotalEffortsGen2", "sprintEfforts"],            digits: 0 },
  // Player Load — the classic acute:chronic workload metric (Gabbett); a far
  // better fit for the 7d/28d/ACWR view than a peak like max velocity.
  { key: "totalPlayerLoad",            label: "Player Load",            shortLabel: "Player Load", aliases: ["totalPlayerLoad", "total_player_load"],                                                         digits: 0 },
];

const BASKETBALL_METRICS: Metric[] = [
  { key: "totalPlayerLoad",     label: "Player Load",          shortLabel: "Player Load", aliases: ["totalPlayerLoad", "total_player_load"],                          digits: 1 },
  { key: "playerLoadPerMinute", label: "Player Load / min",    shortLabel: "PL/min",      aliases: ["playerLoadPerMinute", "player_load_per_minute"],                 digits: 2 },
  { key: "imaCod",              label: "Changes of Direction", shortLabel: "IMA COD",     aliases: ["imaCod", "ima_cod", "cod_events"],                               digits: 0 },
  { key: "imaAccel",            label: "IMA Accelerations",    shortLabel: "IMA Accels",  aliases: ["imaAccel", "ima_accel"],                                         digits: 0 },
  { key: "imaDecel",            label: "IMA Decelerations",    shortLabel: "IMA Decels",  aliases: ["imaDecel", "ima_decel"],                                         digits: 0 },
  { key: "totalDistance",       label: "Total Distance (m)",   shortLabel: "Total Dist",  aliases: ["totalDistance", "total_distance"],                               digits: 0 },
  { key: "maxVel",              label: "Max Velocity (km/h)",  shortLabel: "Max Vel",     aliases: ["maxVel", "max_vel", "max_velocity"],                             digits: 1 },
];

function getVal(row: Record<string, unknown>, aliases: string[]): number | null {
  for (const alias of aliases) {
    const v = row[alias];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function avg(vals: number[]): number | null {
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function dateMinusDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function computeSnapshot(history: Array<Record<string, unknown>>, refDate: string, aliases: string[], digits: number) {
  const acuteStart = dateMinusDays(refDate, 6);
  const chronicStart = dateMinusDays(refDate, 27);
  const dated = history.filter((r) => typeof r.date === "string");
  const acuteVals = dated
    .filter((r) => String(r.date) >= acuteStart && String(r.date) <= refDate)
    .map((r) => getVal(r, aliases))
    .filter((v): v is number => v != null);
  const chronicVals = dated
    .filter((r) => String(r.date) >= chronicStart && String(r.date) <= refDate)
    .map((r) => getVal(r, aliases))
    .filter((v): v is number => v != null);
  const a7 = avg(acuteVals);
  const c28 = avg(chronicVals);
  const acwr = a7 != null && c28 != null && c28 > 0 ? a7 / c28 : null;
  const fmt = (n: number | null) => n == null ? "—" : n.toFixed(digits);
  return { a7: fmt(a7), c28: fmt(c28), acwr };
}

function acwrColor(v: number | null): string {
  if (v == null) return "text-slate-400";
  if (v > 1.5) return "text-red-600 font-semibold";
  if (v > 1.3) return "text-amber-600 font-semibold";
  if (v >= 0.8) return "text-emerald-700";
  return "text-blue-600 font-semibold";
}

function acwrBg(v: number | null): string {
  if (v == null) return "";
  if (v > 1.5) return "bg-red-50";
  if (v > 1.3) return "bg-amber-50";
  if (v >= 0.8) return "bg-emerald-50";
  return "bg-blue-50";
}

export default function SquadLoadTable({
  players,
  date,
  sport = "football",
  lang = "EN",
  catapultDataTier = "full",
}: {
  players: SquadLoadPlayer[];
  date: string;
  sport?: "football" | "basketball" | string | null;
  lang?: "EN" | "IS";
  /** When 'lite' the table swaps the B2-3 / Tot Accels columns out for
   *  HSR / Sprint Distance / Sprint Efforts / Max Velocity — metrics
   *  the lower-tier Catapult plans actually expose. Default 'full'
   *  preserves backwards-compatible behavior for unaware callers. */
  catapultDataTier?: "full" | "lite";
}) {
  const allMetrics = sport === "basketball"
    ? BASKETBALL_METRICS
    : (catapultDataTier === "lite" ? FOOTBALL_METRICS_LITE : FOOTBALL_METRICS_FULL);
  const allRows = players.map((p) => ({
    name: p.name,
    position: p.position,
    snapshots: allMetrics.map((m) => computeSnapshot(p.history, date, m.aliases, m.digits)),
  }));
  // Capability-aware: drop columns the club has no data for anywhere (every
  // player reads "—"), so Lite/Core teams don't see a wall of empty columns —
  // they just see the metrics they actually have. Falls back to the full set
  // only if literally nothing has data (so the table still renders its shape).
  const keep = allMetrics.map((_, i) => allRows.some((r) => r.snapshots[i].a7 !== "—" || r.snapshots[i].c28 !== "—"));
  const anyKept = keep.some(Boolean);
  const metrics = anyKept ? allMetrics.filter((_, i) => keep[i]) : allMetrics;
  const rows = anyKept ? allRows.map((r) => ({ ...r, snapshots: r.snapshots.filter((_, i) => keep[i]) })) : allRows;
  const noData = rows.length === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold uppercase tracking-widest text-slate-900">
              {lang === "IS" ? "Liðsálag — 7d / 28d / ACWR" : "Squad Load — 7d / 28d / ACWR"}
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-slate-500">
              {lang === "IS"
                ? "7 daga acute · 28 daga chronic · ACWR per leikmaður · Catapult"
                : "7-day acute · 28-day chronic · ACWR per player · Catapult"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" />&lt;0.8 Low</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />0.8–1.3 OK</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />1.3–1.5 Elevated</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" />&gt;1.5 High</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {noData ? (
          <div className="px-6 py-10 text-center text-sm text-slate-400">
            {lang === "IS"
              ? "Engin Catapult GPS gögn fundust. Tengdu Catapult til að hlaða inn leikmannagögnum."
              : "No Catapult GPS data available. Sync Catapult to load player data."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap border-r border-slate-200">
                    {lang === "IS" ? "Leikmaður" : "Player"}
                  </th>
                  {metrics.map((m) => (
                    <th key={m.key} colSpan={3} className="px-2 py-2.5 text-center text-xs font-semibold text-slate-600 border-l border-slate-200 whitespace-nowrap">
                      {m.shortLabel}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-slate-200 bg-slate-50/60">
                  <th className="sticky left-0 z-10 bg-slate-50/60 px-4 py-1.5 border-r border-slate-200" />
                  {metrics.map((m) => (
                    <React.Fragment key={m.key}>
                      <th className="px-3 py-1.5 text-center text-[11px] font-medium text-slate-500 border-l border-slate-200">7D</th>
                      <th className="px-3 py-1.5 text-center text-[11px] font-medium text-slate-500">28D</th>
                      <th className="px-3 py-1.5 text-center text-[11px] font-medium text-slate-500">ACWR</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((player, i) => (
                  <tr key={player.name} className={`border-b border-slate-100 ${i % 2 === 0 ? "" : "bg-slate-50/40"} hover:bg-slate-100/60`}>
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 font-medium text-slate-900 whitespace-nowrap border-r border-slate-200" style={{ background: i % 2 === 0 ? "white" : "rgb(248 250 252 / 0.4)" }}>
                      <div>{player.name}</div>
                      <div className="text-[11px] text-slate-400">{player.position}</div>
                    </td>
                    {player.snapshots.map((snap, si) => (
                      <React.Fragment key={si}>
                        <td className="px-3 py-2 text-center text-slate-700 border-l border-slate-100 tabular-nums">{snap.a7}</td>
                        <td className="px-3 py-2 text-center text-slate-500 tabular-nums">{snap.c28}</td>
                        <td className={`px-3 py-2 text-center tabular-nums ${acwrColor(snap.acwr)} ${acwrBg(snap.acwr)}`}>
                          {snap.acwr == null ? "—" : snap.acwr.toFixed(2)}
                        </td>
                      </React.Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
