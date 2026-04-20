"use client";

import React, { useMemo, useState } from "react";
import {
  computeCatapultExternalLoadBaseline,
  computeCatapultExternalLoadSignals,
  computeHidTrend,
  computeResidualDecel,
  normalizeCatapultDailyLoadRow,
  type CatapultDailyLoadRow,
} from "@/lib/micropulse/externalLoad";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

// ── Types ──────────────────────────────────────────────────────────────────────

type GpsPlayerInput = {
  id: string;
  name: string;
  position: string;
  history: Array<Record<string, unknown>>;
};

type PlayerSignalRow = {
  id: string;
  name: string;
  position: string;
  nbs: number | null;
  loadState: "normal" | "elevated" | "high" | "unknown";
  decelBurden: number | null;
  decelBurdenBand: string | null;
  accelDecelRatio: number | null;
  loadProfile: string | null;
  hidPct: number | null;
  hidDeclinePct: number | null;
  hidFatigueFlag: boolean;
  residualDecel: number | null;
  residualDecelBand: string | null;
  plSpike: number | null;
};

type SortKey = "name" | "decelBurden" | "accelDecelRatio" | "hidPct" | "residualDecel" | "plSpike" | "loadState";

// ── Helpers ────────────────────────────────────────────────────────────────────

function computePlayerSignals(player: GpsPlayerInput, date: string): PlayerSignalRow | null {
  const normalized = player.history
    .map((r) => normalizeCatapultDailyLoadRow(r))
    .filter((r): r is CatapultDailyLoadRow => r != null);

  if (!normalized.length) return null;

  const { today, baseline } = computeCatapultExternalLoadBaseline({ rows: normalized, date });
  const signals = computeCatapultExternalLoadSignals({ today, baseline });

  // Residual decel (3-day)
  const dayMinus = (d: string, n: number) => {
    const dt = new Date(`${d}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() - n);
    return dt.toISOString().slice(0, 10);
  };
  const ydayCtx = computeCatapultExternalLoadSignals({
    ...computeCatapultExternalLoadBaseline({ rows: normalized, date: dayMinus(date, 1) }),
  });
  const twoDayCtx = computeCatapultExternalLoadSignals({
    ...computeCatapultExternalLoadBaseline({ rows: normalized, date: dayMinus(date, 2) }),
  });
  const residual = computeResidualDecel(
    signals.decelBurdenScore,
    ydayCtx.decelBurdenScore,
    twoDayCtx.decelBurdenScore,
  );

  // HID% trend
  const recentRows = normalized.filter((r) => r.date < date).slice(-7);
  const hidTrend = computeHidTrend(recentRows, today);

  return {
    id: player.id,
    name: player.name,
    position: player.position,
    nbs: signals.neuromuscularBurdenScore,
    loadState: signals.externalLoadState,
    decelBurden: signals.decelBurdenScore,
    decelBurdenBand: signals.decelBurdenBand,
    accelDecelRatio: signals.accelDecelRatio,
    loadProfile: signals.loadProfile,
    hidPct: signals.hidPercentage,
    hidDeclinePct: hidTrend.hidDeclinePct,
    hidFatigueFlag: hidTrend.hidFatigueFlag,
    residualDecel: residual.residualDecel,
    residualDecelBand: residual.residualDecelBand,
    plSpike: signals.playerLoadSpike,
  };
}

// ── Color helpers ──────────────────────────────────────────────────────────────

function loadStateCls(state: string): string {
  if (state === "high") return "bg-rose-100 text-rose-700 border-rose-200";
  if (state === "elevated") return "bg-amber-100 text-amber-700 border-amber-200";
  if (state === "normal") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  return "bg-slate-100 text-slate-500 border-slate-200";
}

function decelBandCls(band: string | null): string {
  if (band === "high") return "text-rose-700 bg-rose-50";
  if (band === "elevated") return "text-amber-700 bg-amber-50";
  if (band === "moderate") return "text-slate-600 bg-slate-50";
  return "text-emerald-700 bg-emerald-50";
}

function profileCls(profile: string | null): string {
  if (profile === "eccentric_dominant") return "text-orange-700 bg-orange-50";
  if (profile === "concentric_dominant") return "text-blue-700 bg-blue-50";
  return "text-slate-600";
}

function residualBandCls(band: string | null): string {
  if (band === "HIGH") return "text-rose-700 bg-rose-50";
  if (band === "CAUTION") return "text-amber-700 bg-amber-50";
  if (band === "ELEVATED") return "text-slate-600 bg-slate-50";
  return "text-emerald-700";
}

function hidTrendArrow(decline: number | null): { arrow: string; cls: string } | null {
  if (decline == null) return null;
  if (decline >= 0.20) return { arrow: "↓↓", cls: "text-rose-600" };
  if (decline >= 0.10) return { arrow: "↓", cls: "text-amber-600" };
  if (decline <= -0.10) return { arrow: "↑", cls: "text-emerald-600" };
  return { arrow: "→", cls: "text-slate-400" };
}

// ── Sort helper ────────────────────────────────────────────────────────────────

function sortRows(rows: PlayerSignalRow[], key: SortKey, asc: boolean): PlayerSignalRow[] {
  const stateOrder: Record<string, number> = { high: 3, elevated: 2, normal: 1, unknown: 0 };
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (key === "name") cmp = a.name.localeCompare(b.name);
    else if (key === "loadState") cmp = (stateOrder[a.loadState] ?? 0) - (stateOrder[b.loadState] ?? 0);
    else cmp = ((a[key] as number | null) ?? -999) - ((b[key] as number | null) ?? -999);
    return asc ? cmp : -cmp;
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function GpsLoadIntelligence({
  players,
  date,
  lang = "IS",
}: {
  players: GpsPlayerInput[];
  date: string;
  lang?: "IS" | "EN";
}) {
  const [sortKey, setSortKey] = useState<SortKey>("loadState");
  const [sortAsc, setSortAsc] = useState(false);

  const rows = useMemo(() => {
    return players
      .map((p) => computePlayerSignals(p, date))
      .filter((r): r is PlayerSignalRow => r != null);
  }, [players, date]);

  const sorted = useMemo(() => sortRows(rows, sortKey, sortAsc), [rows, sortKey, sortAsc]);

  // ── Team summary KPIs ──
  const totalPlayers = rows.length;
  const highCount = rows.filter((r) => r.loadState === "high").length;
  const elevatedCount = rows.filter((r) => r.loadState === "elevated").length;
  const normalCount = rows.filter((r) => r.loadState === "normal").length;

  const decelElevatedCount = rows.filter((r) =>
    r.decelBurdenBand === "elevated" || r.decelBurdenBand === "high"
  ).length;
  const eccentricCount = rows.filter((r) => r.loadProfile === "eccentric_dominant").length;
  const hidFatigueCount = rows.filter((r) => r.hidFatigueFlag).length;

  const residualCautionCount = rows.filter((r) =>
    r.residualDecelBand === "CAUTION" || r.residualDecelBand === "HIGH"
  ).length;

  if (!rows.length) return null;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  // ── Metric info definitions ──
  const metricInfo: Partial<Record<SortKey, { title: string; body: string }>> = lang === "IS" ? {
    loadState: {
      title: "Álagsstaða (Load State)",
      body: "Heildarálagsmat dagsins miðað við 28 daga baseline. Reiknað úr 5 GPS-merkjum (HIR, deceleration, density, max velocity, band6). Normal = undir viðmiði, Elevated = yfir viðmiði, High = langt yfir viðmiði.",
    },
    decelBurden: {
      title: "Decel Burden",
      body: "Hversu mikið deceleration-álag lendir á vöðvum. 65% há-ákefðar decelerations + 35% heildar decelerations vs 28d baseline. Flokkað: low / moderate / elevated / high.",
    },
    accelDecelRatio: {
      title: "Acc:Dec hlutfall",
      body: "Hlutfall há-ákefðar accelerations vs decelerations. ECC (<0.7) = mikil deceleration, hamstring/calf áhætta. BAL (0.7–1.3) = jafnvægi. CON (>1.3) = mikil acceleration, glute/quad álag.",
    },
    hidPct: {
      title: "HID% (High-Intensity Distance)",
      body: "Háhraðavegalengd ÷ heildarvegalengd. HID% = (Band5 + Band6) ÷ total distance. Band5 ≈ 19.8–25.2 km/klst, Band6 > 25.2 km/klst. Trend ör sýnir breytingu vs 7 daga meðaltal — lækkun getur bent til taugavöðvaþreytu.",
    },
    residualDecel: {
      title: "Residual Decel (3 dagar)",
      body: "Uppsafnað deceleration-álag síðustu 3 daga. Vegið: í dag 50%, gær 30%, fyrri dagur 20%. Sýnir hvort leikmaður fær nægan bata á milli æfinga.",
    },
    plSpike: {
      title: "PL Spike (Player Load)",
      body: "Player Load dagsins deilt með 28 daga meðaltali. ≥1.15× = hækkað, ≥1.5× = hátt. Sýnir hvort heildarmagn hreyfingar er óvenjuhátt miðað við venjulegt álag.",
    },
  } : {
    loadState: {
      title: "Load State",
      body: "Overall load assessment for the day vs 28-day baseline. Computed from 5 GPS signals (HIR, deceleration, density, max velocity, band6). Normal / Elevated / High.",
    },
    decelBurden: {
      title: "Decel Burden",
      body: "How much deceleration load hits the muscles. 65% high-intensity decelerations + 35% total decelerations vs 28d baseline. Bands: low / moderate / elevated / high.",
    },
    accelDecelRatio: {
      title: "Acc:Dec Ratio",
      body: "Ratio of high-intensity accelerations vs decelerations. ECC (<0.7) = heavy braking, hamstring/calf risk. BAL (0.7–1.3) = balanced. CON (>1.3) = heavy acceleration, glute/quad load.",
    },
    hidPct: {
      title: "HID% (High-Intensity Distance)",
      body: "High-speed distance ÷ total distance. HID% = (Band5 + Band6) ÷ total. Band5 ≈ 19.8–25.2 km/h, Band6 > 25.2 km/h. Trend arrow shows change vs 7-day average — decline may indicate neuromuscular fatigue.",
    },
    residualDecel: {
      title: "Residual Decel (3 days)",
      body: "Accumulated deceleration load over 3 days. Weighted: today 50%, yesterday 30%, day before 20%. Shows whether a player is getting enough recovery between sessions.",
    },
    plSpike: {
      title: "PL Spike (Player Load)",
      body: "Today's Player Load divided by 28-day average. ≥1.15× = elevated, ≥1.5× = high. Shows whether total movement volume is unusually high compared to normal load.",
    },
  };

  const InfoIcon = ({ sortKey: sk }: { sortKey: SortKey }) => {
    const info = metricInfo[sk];
    if (!info) return null;
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors shrink-0"
            aria-label={`Info: ${info.title}`}
          >
            i
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="center" className="w-72">
          <p className="text-xs font-semibold text-slate-900 mb-1">{info.title}</p>
          <p className="text-xs text-slate-600 leading-relaxed">{info.body}</p>
        </PopoverContent>
      </Popover>
    );
  };

  const SortHeader = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th
      className={`px-3 py-2.5 text-xs font-semibold text-slate-600 whitespace-nowrap cursor-pointer select-none hover:text-slate-900 transition-colors ${className}`}
      onClick={() => handleSort(k)}
    >
      <div className="flex items-center gap-1 justify-end">
        {children}
        <InfoIcon sortKey={k} />
        {sortKey === k ? (
          <span className="text-[10px] text-slate-400">{sortAsc ? "▲" : "▼"}</span>
        ) : null}
      </div>
    </th>
  );

  const fmtN = (v: number | null, d = 2) => v == null ? "—" : v.toFixed(d);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold uppercase tracking-widest text-slate-900">
              {lang === "IS" ? "Álagsgreining" : "Load Intelligence"}
            </CardTitle>
            <CardDescription className="mt-1 text-sm text-slate-500">
              {lang === "IS"
                ? "Decel burden · Accel:Decel · HID% trend · Residual Decel — reiknað úr Catapult gögnum"
                : "Decel burden · Accel:Decel · HID% trend · Residual Decel — computed from Catapult data"}
            </CardDescription>
          </div>
          <div className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-600">
            {totalPlayers} {lang === "IS" ? "leikmenn" : "players"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">

        {/* ── Team Status Summary ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <KpiTile
            label={lang === "IS" ? "High álag" : "High load"}
            value={highCount}
            total={totalPlayers}
            tone={highCount > 0 ? "rose" : "slate"}
          />
          <KpiTile
            label={lang === "IS" ? "Elevated álag" : "Elevated load"}
            value={elevatedCount}
            total={totalPlayers}
            tone={elevatedCount > 0 ? "amber" : "slate"}
          />
          <KpiTile
            label={lang === "IS" ? "Decel burden ↑" : "Decel burden ↑"}
            value={decelElevatedCount}
            total={totalPlayers}
            tone={decelElevatedCount > 0 ? "amber" : "slate"}
          />
          <KpiTile
            label="Eccentric dom."
            value={eccentricCount}
            total={totalPlayers}
            tone={eccentricCount > 0 ? "orange" : "slate"}
          />
          <KpiTile
            label={lang === "IS" ? "HID% þreyta" : "HID% fatigue"}
            value={hidFatigueCount}
            total={totalPlayers}
            tone={hidFatigueCount > 0 ? "rose" : "slate"}
          />
          <KpiTile
            label="Residual Decel ⚠"
            value={residualCautionCount}
            total={totalPlayers}
            tone={residualCautionCount > 0 ? "amber" : "slate"}
          />
        </div>

        {/* ── Player Signal Table ── */}
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full text-sm border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <SortHeader k="name" className="text-left !justify-start">
                  {lang === "IS" ? "Leikmaður" : "Player"}
                </SortHeader>
                <SortHeader k="loadState">
                  {lang === "IS" ? "Álag" : "Load"}
                </SortHeader>
                <SortHeader k="decelBurden">Decel Burden</SortHeader>
                <SortHeader k="accelDecelRatio">Acc:Dec</SortHeader>
                <SortHeader k="hidPct">HID%</SortHeader>
                <SortHeader k="residualDecel">Res. Decel</SortHeader>
                <SortHeader k="plSpike">PL Spike</SortHeader>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p, i) => {
                const trend = hidTrendArrow(p.hidDeclinePct);
                const profileShort = p.loadProfile === "eccentric_dominant" ? "ECC"
                  : p.loadProfile === "concentric_dominant" ? "CON"
                  : p.loadProfile === "balanced" ? "BAL" : null;

                return (
                  <tr
                    key={p.id}
                    className={`border-b border-slate-100 ${i % 2 === 0 ? "" : "bg-slate-50/40"} hover:bg-slate-100/60 transition-colors`}
                  >
                    {/* Name */}
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-medium text-slate-900">{p.name}</div>
                      <div className="text-[11px] text-slate-400">{p.position}</div>
                    </td>

                    {/* Load State */}
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${loadStateCls(p.loadState)}`}>
                        {p.loadState === "unknown" ? "—" : p.loadState}
                      </span>
                    </td>

                    {/* Decel Burden */}
                    <td className="px-3 py-2.5 text-right">
                      {p.decelBurden != null ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="tabular-nums text-slate-800">{fmtN(p.decelBurden)}</span>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${decelBandCls(p.decelBurdenBand)}`}>
                            {p.decelBurdenBand ?? "—"}
                          </span>
                        </div>
                      ) : <span className="text-slate-400">—</span>}
                    </td>

                    {/* Accel:Decel */}
                    <td className="px-3 py-2.5 text-right">
                      {p.accelDecelRatio != null ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="tabular-nums text-slate-800">{p.accelDecelRatio.toFixed(2)}</span>
                          {profileShort ? (
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${profileCls(p.loadProfile)}`}>
                              {profileShort}
                            </span>
                          ) : null}
                        </div>
                      ) : <span className="text-slate-400">—</span>}
                    </td>

                    {/* HID% + trend */}
                    <td className="px-3 py-2.5 text-right">
                      {p.hidPct != null ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className={`tabular-nums ${p.hidFatigueFlag ? "text-amber-700 font-semibold" : "text-slate-800"}`}>
                            {(p.hidPct * 100).toFixed(1)}%
                          </span>
                          {trend ? (
                            <span className={`text-xs font-bold ${trend.cls}`} title={`${((p.hidDeclinePct ?? 0) * 100).toFixed(0)}% vs 7d avg`}>
                              {trend.arrow}
                            </span>
                          ) : null}
                        </div>
                      ) : <span className="text-slate-400">—</span>}
                    </td>

                    {/* Residual Decel */}
                    <td className="px-3 py-2.5 text-right">
                      {p.residualDecel != null ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="tabular-nums text-slate-800">{p.residualDecel.toFixed(0)}</span>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${residualBandCls(p.residualDecelBand)}`}>
                            {p.residualDecelBand ?? "—"}
                          </span>
                        </div>
                      ) : <span className="text-slate-400">—</span>}
                    </td>

                    {/* PL Spike */}
                    <td className={`px-3 py-2.5 text-right tabular-nums ${
                      p.plSpike != null && p.plSpike >= 1.5 ? "text-rose-700 font-semibold"
                      : p.plSpike != null && p.plSpike >= 1.15 ? "text-amber-700"
                      : "text-slate-700"
                    }`}>
                      {p.plSpike != null ? `${p.plSpike.toFixed(2)}×` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Cohort Alerts ── */}
        <CohortAlerts rows={rows} lang={lang} />

      </CardContent>
    </Card>
  );
}

// ── KPI Tile ───────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "rose" | "amber" | "orange" | "slate";
}) {
  const toneMap = {
    rose: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", num: "text-rose-800" },
    amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", num: "text-amber-800" },
    orange: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", num: "text-orange-800" },
    slate: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-500", num: "text-slate-700" },
  };
  const t = toneMap[tone];
  return (
    <div className={`rounded-xl border ${t.border} ${t.bg} px-4 py-3`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wide ${t.text}`}>{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`text-2xl font-bold tabular-nums ${t.num}`}>{value}</span>
        <span className="text-xs text-slate-400">/ {total}</span>
      </div>
    </div>
  );
}

// ── Cohort Alerts ──────────────────────────────────────────────────────────────

function CohortAlerts({ rows, lang }: { rows: PlayerSignalRow[]; lang: "IS" | "EN" }) {
  const alerts: Array<{ severity: "high" | "moderate" | "info"; title: string; names: string[] }> = [];

  // High decel burden
  const highDecel = rows.filter((r) => r.decelBurdenBand === "high");
  if (highDecel.length > 0) {
    alerts.push({
      severity: "high",
      title: lang === "IS" ? "Hátt decel burden — forðast COD-þungar æfingar" : "High decel burden — avoid COD-heavy drills",
      names: highDecel.map((r) => r.name),
    });
  }

  // HID% fatigue
  const fatigued = rows.filter((r) => r.hidFatigueFlag);
  if (fatigued.length > 0) {
    alerts.push({
      severity: "moderate",
      title: lang === "IS" ? "HID% þreytutrend — lægri háhraðavinna þrátt fyrir stöðuga vegalengd" : "HID% fatigue trend — lower high-speed work despite stable distance",
      names: fatigued.map((r) => r.name),
    });
  }

  // Eccentric dominant + elevated decel
  const eccentricRisk = rows.filter((r) => r.loadProfile === "eccentric_dominant" && (r.decelBurdenBand === "elevated" || r.decelBurdenBand === "high"));
  if (eccentricRisk.length > 0) {
    alerts.push({
      severity: "high",
      title: lang === "IS" ? "Eccentric-ríkt + hátt decel burden — hamstring/calf áhætta" : "Eccentric-dominant + elevated decel burden — hamstring/calf risk",
      names: eccentricRisk.map((r) => r.name),
    });
  }

  // Residual decel caution/high
  const residualRisk = rows.filter((r) => r.residualDecelBand === "CAUTION" || r.residualDecelBand === "HIGH");
  if (residualRisk.length > 0) {
    alerts.push({
      severity: "moderate",
      title: lang === "IS" ? "Uppsafnað decel álag (3 dagar) — endurbati í forgangi" : "Accumulated decel load (3 days) — recovery priority",
      names: residualRisk.map((r) => r.name),
    });
  }

  if (!alerts.length) return null;

  const sevCls = {
    high: "border-l-rose-500 bg-rose-50/50",
    moderate: "border-l-amber-500 bg-amber-50/50",
    info: "border-l-blue-500 bg-blue-50/50",
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
        {lang === "IS" ? "Hópviðvaranir" : "Cohort Alerts"}
      </p>
      {alerts.map((alert, i) => (
        <div key={i} className={`rounded-lg border-l-4 border border-slate-200 px-4 py-3 ${sevCls[alert.severity]}`}>
          <div className="text-sm font-semibold text-slate-800">{alert.title}</div>
          <div className="mt-1 text-xs text-slate-600">
            {alert.names.join(", ")}
          </div>
        </div>
      ))}
    </div>
  );
}
