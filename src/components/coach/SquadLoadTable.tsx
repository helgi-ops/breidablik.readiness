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

type Snapshot = { a7: string; c28: string; acwr: number | null };
type Row = { name: string; position: string; snapshots: Snapshot[] };

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
  { key: "velocityBand5TotalDistance", label: "Vel Band 5 Dist (m)",    shortLabel: "Vel B5 Dist", aliases: ["velocityBand5TotalDistance", "velocity_band5_total_distance"],                                   digits: 0 },
  // On Lite the separate "sprint_distance" field is usually 0 (no sprint
  // threshold configured); the V6 top-speed band IS the sprint distance, so we
  // surface it under the familiar "Sprint Distance" label and drop the empty one.
  { key: "velocityBand6TotalDistance", label: "Sprint Distance (m)",    shortLabel: "Sprint Dist", aliases: ["velocityBand6TotalDistance", "velocity_band6_total_distance"],                                   digits: 0 },
  { key: "sprintEfforts",              label: "Sprint Efforts (#)",     shortLabel: "Sprint Eff",  aliases: ["velocity_band6_total_efforts_gen2", "velocityBand6TotalEffortsGen2", "sprintEfforts"],            digits: 0 },
  // Player Load — the classic acute:chronic workload metric (Gabbett); a far
  // better fit for the 7d/28d/ACWR view than a peak like max velocity.
  { key: "totalPlayerLoad",            label: "Player Load",            shortLabel: "Player Load", aliases: ["totalPlayerLoad", "total_player_load"],                                                         digits: 0 },
  // High Metabolic Load Distance — the high-intensity-running signal Core/Lite
  // plans DO expose (di Prampero-derived); the Lite stand-in for metabolic power.
  { key: "hmld",                       label: "High Metabolic Load Dist (m)", shortLabel: "HML",   aliases: ["high_metabolic_load_distance_m", "highMetabolicLoadDistanceM", "hmld"],                          digits: 0 },
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
  const IS = lang === "IS";
  const [openIdx, setOpenIdx] = React.useState<number | null>(null);

  const allMetrics = sport === "basketball"
    ? BASKETBALL_METRICS
    : (catapultDataTier === "lite" ? FOOTBALL_METRICS_LITE : FOOTBALL_METRICS_FULL);
  const allRows: Row[] = players.map((p) => ({
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
  const rows: Row[] = anyKept ? allRows.map((r) => ({ ...r, snapshots: r.snapshots.filter((_, i) => keep[i]) })) : allRows;
  const noData = rows.length === 0;

  // Layer 0/1 — surface the sharp jumps so a non-S&C coach gets the verdict
  // without reading the grid. ACWR = this week's load vs his own recent norm;
  // >1.5 = sharp jump (unfamiliar load), 1.3–1.5 = elevated. Framed as spike
  // size vs his usual — never an injury-risk score (Impellizzeri 2020).
  const spikes = rows
    .flatMap((r, ri) => r.snapshots.map((s, si) => ({ ri, name: r.name, position: r.position, metric: metrics[si]?.shortLabel ?? "", acwr: s.acwr })))
    .filter((x): x is { ri: number; name: string; position: string; metric: string; acwr: number } => x.acwr != null && x.acwr > 1.3)
    .sort((a, b) => b.acwr - a.acwr);
  const highCount = spikes.filter((s) => s.acwr > 1.5).length;
  const SPIKE_CAP = 6;
  const shownSpikes = spikes.slice(0, SPIKE_CAP);
  const spikePlayers = new Set(spikes.map((s) => s.ri)).size;

  // Escape closes the modal.
  React.useEffect(() => {
    if (openIdx == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenIdx(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIdx]);

  const active = openIdx != null ? rows[openIdx] : null;

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
          <>
          {/* Layer 0/1 — plain spike summary above the raw matrix. */}
          <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
            {spikes.length === 0 ? (
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-emerald-700">{IS ? "Engin snörp stökk þessa viku." : "No sharp jumps this week."}</span>{" "}
                {IS ? "Álag hvers leikmanns er innan hans venjulega bils." : "Every player's load is within his own usual range."}
              </p>
            ) : (
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {IS
                    ? `${spikePlayers} ${spikePlayers === 1 ? "leikmaður" : "leikmenn"} með snörpt álags-stökk þessa viku`
                    : `${spikePlayers} ${spikePlayers === 1 ? "player has" : "players have"} a sharp load jump this week`}
                  {highCount > 0 && (
                    <span className="ml-1 font-normal text-slate-500">
                      · {highCount} {IS ? "yfir 1.5×" : `over 1.5×`}
                    </span>
                  )}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {shownSpikes.map((s) => (
                    <button
                      key={`${s.ri}-${s.metric}`}
                      type="button"
                      onClick={() => setOpenIdx(s.ri)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition hover:shadow-sm ${s.acwr > 1.5 ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}
                      title={IS ? "Opna leikmanninn" : "Open player"}
                    >
                      <span className="font-semibold">{s.name.split(" ")[0]}</span>
                      <span className="opacity-70">{s.metric}</span>
                      <span className="font-mono font-semibold">{s.acwr.toFixed(2)}×</span>
                    </button>
                  ))}
                  {spikes.length > SPIKE_CAP && (
                    <span className="inline-flex items-center px-1.5 py-1 text-xs text-slate-400">
                      +{spikes.length - SPIKE_CAP} {IS ? "til viðbótar í töflunni" : "more in the table"}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {IS
                    ? "„×“ = álag vikunnar á móti hans eigin 28-daga venju — stærð stökksins, ekki áhættueinkunn. Smelltu á leikmann fyrir öll gildi."
                    : "“×” = this week's load vs his own 28-day norm — the size of the jump, not a risk score. Tap a player for all his numbers."}
                </p>
              </div>
            )}
          </div>
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
                      <button type="button" onClick={() => setOpenIdx(i)} className="text-left transition hover:text-blue-600" title={IS ? "Opna leikmanninn" : "Open player"}>
                        <div className="underline decoration-slate-200 decoration-dotted underline-offset-4 hover:decoration-blue-400">{player.name}</div>
                        <div className="text-[11px] text-slate-400">{player.position}</div>
                      </button>
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
          </>
        )}
      </CardContent>

      {/* Per-player pop-up card — all metrics for one player, readable. */}
      {active && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
          onClick={() => setOpenIdx(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <div className="text-base font-semibold text-slate-900">{active.name}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {active.position} · {IS ? "7d álag á móti hans 28d venju" : "7d load vs his 28d norm"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenIdx(null)}
                className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label={IS ? "Loka" : "Close"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {(() => {
                const jumps = active.snapshots
                  .map((s, si) => ({ label: metrics[si]?.shortLabel ?? "", acwr: s.acwr }))
                  .filter((x) => x.acwr != null && x.acwr > 1.3);
                return (
                  <p className="mb-2.5 text-[12px] text-slate-600">
                    {jumps.length === 0 ? (
                      <span><span className="font-semibold text-emerald-700">{IS ? "Innan venjulegs bils." : "Within his usual range."}</span> {IS ? "Engin snörp stökk þessa viku." : "No sharp jumps this week."}</span>
                    ) : (
                      <span><span className="font-semibold text-slate-800">{IS ? "Snörp stökk:" : "Sharp jump in:"}</span> {jumps.map((j) => j.label).join(", ")}.</span>
                    )}
                  </p>
                );
              })()}
              <div className="divide-y divide-slate-100">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <span>{IS ? "Mæligildi" : "Metric"}</span>
                  <span className="text-right">7D</span>
                  <span className="text-right">28D</span>
                  <span className="text-right">ACWR</span>
                </div>
                {active.snapshots.map((s, si) => (
                  <div key={si} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 py-1.5 text-[12px]">
                    <span className="text-slate-700">{metrics[si]?.shortLabel}</span>
                    <span className="text-right tabular-nums text-slate-700">{s.a7}</span>
                    <span className="text-right tabular-nums text-slate-400">{s.c28}</span>
                    <span className={`rounded px-1.5 py-0.5 text-right tabular-nums ${acwrColor(s.acwr)} ${acwrBg(s.acwr)}`}>
                      {s.acwr == null ? "—" : `${s.acwr.toFixed(2)}×`}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                <span><span className="font-semibold text-blue-600">&lt;0.8</span> {IS ? "lágt" : "low"}</span>
                <span><span className="font-semibold text-emerald-700">0.8–1.3</span> {IS ? "í lagi" : "ok"}</span>
                <span><span className="font-semibold text-amber-600">1.3–1.5</span> {IS ? "hækkað" : "elevated"}</span>
                <span><span className="font-semibold text-red-600">&gt;1.5</span> {IS ? "snarpt stökk" : "sharp jump"}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
