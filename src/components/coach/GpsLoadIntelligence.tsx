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
import CoachTutorialButton from "@/components/coach/tutorials/CoachTutorialButton";

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

  const { today, baseline, daysSinceData } = computeCatapultExternalLoadBaseline({ rows: normalized, date });
  const signals = computeCatapultExternalLoadSignals({ today, baseline, daysSinceData });

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

  // Every metric here (decel burden, A:D, HID%, residual decel) is McBurnie
  // B2-3 / decel-derived — columns Core/Lite Catapult plans don't expose. If no
  // player has any REAL value there's nothing to show, so self-hide rather than
  // render a card full of "—" for lower-tier clubs. Note hidPct computes to a
  // literal 0.0% for Lite (HID numerator is Pro-only), so 0 must NOT count as a
  // signal — only a positive HID% does.
  const hasAnySignal = rows.some(
    (r) => r.decelBurden != null || r.accelDecelRatio != null || r.residualDecel != null
      || (r.hidPct != null && r.hidPct > 0),
  );
  if (!rows.length || !hasAnySignal) return null;

  // Answer-first headline above the cohort alerts: the overall GPS load state in
  // one sentence, naming who is in the high band. Cohort alerts below cluster the
  // specific issues (decel, HID fatigue, eccentric, residual).
  const highRows = rows.filter((r) => r.loadState === "high");
  const gpsNames = highRows.slice(0, 3).map((r) => r.name.split(" ")[0]).join(", ") + (highRows.length > 3 ? ` +${highRows.length - 3}` : "");
  const gpsVerdict =
    highCount > 0
      ? lang === "IS"
        ? `${highCount} í háu GPS-álagi í dag${elevatedCount > 0 ? `, ${elevatedCount} yfir viðmiði` : ""} — ${gpsNames}.`
        : `${highCount} at high GPS load today${elevatedCount > 0 ? `, ${elevatedCount} elevated` : ""} — ${gpsNames}.`
      : elevatedCount > 0
        ? lang === "IS"
          ? `${elevatedCount} yfir sínu venjulega GPS-álagi í dag, enginn í háu bili.`
          : `${elevatedCount} above their usual GPS load today, none in the high band.`
        : lang === "IS"
          ? "GPS-álag er í eðlilegu bili hjá öllum í dag."
          : "GPS load is in a normal range across the squad today.";

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  // ── Metric info definitions ──
  const metricInfo: Partial<Record<SortKey, { title: string; body: string }>> = lang === "IS" ? {
    loadState: {
      title: "Álagsstaða (Load State)",
      body: "Heildar ytra álag dagsins vs HANS EIGIN 28-daga baseline — vegin blanda 5 GPS-merkja (HIR 0.34, deceleration 0.26, density 0.20, max velocity 0.14, sprett/band6 0.06). NORMAL = á/undir venju, ELEVATED = yfir, HIGH = vel yfir. „—“ = enginn pod í dag (aldrei skorað 0). Bráð vs langvinnt álag — Gabbett 2016.",
    },
    decelBurden: {
      title: "Decel Burden",
      body: "Hemlunar-álag á vöðva: 65% há-ákefðar decelerations (Band 2–3, < −3 m/s²) + 35% heildar, vs 28-daga baseline. Bönd: low < 0.20, moderate 0.20–0.45, elevated 0.45–0.70, high ≥ 0.70. Hemlun er eccentric, vefja-skaðandi hlið álags — high lækkar aftur í elevated þegar há-ákefðar hemlun færist að venju. Þarf Band 2–3 gögnin (lægri Catapult-pakkar → „—“, ekki 0). Harper & Kiely 2018; McBurnie 2022.",
    },
    accelDecelRatio: {
      title: "Acc:Dec hlutfall",
      body: "Hlutfall há-ákefðar accelerations vs decelerations. ECC (< 0.7) = mikil hemlun, ACL + framanlæri (quadriceps) + patellar tendon áhætta (peak quad activation 161% MVC í hemlun — McBurnie 2022). BAL (0.7–1.3) = jafnvægi. CON (> 1.3) = mikil hröðun, hamstring + glute áhætta (late-swing sprint). Sama „high load“ er ólíkt meiðsla-samtal eftir stefnu; mjög fáar efforts eru aðeins vísbending um stefnu (nefnari í lágmark 0.5).",
    },
    hidPct: {
      title: "HID% (High-Intensity Distance)",
      body: "Háhraða-hlutfall: (Band5 + Band6) ÷ heildar (Band5 ≈ 19.8–25.2, Band6 > 25.2 km/klst). Ör vs 7-daga meðaltal: ↑ ≥ 10% upp, → ±10%, ↓ ≥ 10% niður, ↓↓ ≥ 20% niður. Þreytuflagg kviknar AÐEINS þegar HID% fellur ≥ 20% OG heildar-vegalengd er stöðug — sama vegalengd, toppahraði næst ekki. Harper 2019.",
    },
    residualDecel: {
      title: "Residual Decel (3 dagar)",
      body: "Uppsafnað hemlunar-álag síðustu 3 daga, vegið í dag ×1.0, gær ×0.6, fyrir tveimur dögum ×0.3 (0–100+ vísitala). NORMAL < 60, ELEVATED 60–100, CAUTION 100–135, HIGH ≥ 135. Grípur „þriðja harða daginn í röð“ sem eins-dags sýn missir; lækkar eftir raunverulega létt-hemlunar dag. Harper & Kiely 2018.",
    },
    plSpike: {
      title: "PL Spike (Player Load)",
      body: "Heildar Player Load dagsins ÷ HANS EIGIN 28-daga meðaltal. grátt < 1.15×, gult 1.15–1.5×, rautt ≥ 1.5×. Einfalda magn-mælingin á bak við sértæku dálkana — lestu hana MEÐ þeim (1.6× + ECC + high decel ≠ 1.6× í jafnvægi/lág-decel). Snemma á tímabili er nefnarinn óstöðugur → bráðabirgða. Gabbett 2016.",
    },
  } : {
    loadState: {
      title: "Load State",
      body: "The day's overall external load vs his OWN 28-day baseline — a weighted blend of 5 GPS signals (HIR 0.34, deceleration 0.26, density 0.20, max-velocity 0.14, sprint/band6 0.06). NORMAL = at/below his usual, ELEVATED = above, HIGH = well above. “—” = no pod today (never scored 0). Acute-vs-chronic load — Gabbett 2016.",
    },
    decelBurden: {
      title: "Decel Burden",
      body: "Braking load on the muscles: 65% high-intensity decel efforts (Band 2–3, < −3 m/s²) + 35% total, vs his 28-day baseline. Bands: low < 0.20, moderate 0.20–0.45, elevated 0.45–0.70, high ≥ 0.70. Deceleration is the eccentric, tissue-damaging side of load — high eases back to elevated as his high-intensity braking returns to norm. Needs the Band 2–3 feed (lower Catapult tiers → “—”, not 0). Harper & Kiely 2018; McBurnie 2022.",
    },
    accelDecelRatio: {
      title: "Acc:Dec Ratio",
      body: "Ratio of high-intensity accelerations vs decelerations. ECC (< 0.7) = heavy braking, ACL + quadriceps + patellar tendon risk (peak quad activation reaches 161% MVC during deceleration — McBurnie 2022). BAL (0.7–1.3) = balanced. CON (> 1.3) = heavy acceleration, hamstring + glute risk (late-swing sprint phase). The same “high load” is a different injury conversation by direction; very low effort counts are a directional hint only (denominator floored at 0.5).",
    },
    hidPct: {
      title: "HID% (High-Intensity Distance)",
      body: "High-speed share: (Band5 + Band6) ÷ total (Band5 ≈ 19.8–25.2, Band6 > 25.2 km/h). Arrow vs his 7-day average: ↑ ≥ 10% up, → ±10%, ↓ ≥ 10% down, ↓↓ ≥ 20% down. The fatigue flag fires ONLY when HID% drops ≥ 20% AND total distance is stable — same ground covered, top speeds not reached. Harper 2019.",
    },
    residualDecel: {
      title: "Residual Decel (3 days)",
      body: "Braking load accumulated over 3 days, weighted today ×1.0, yesterday ×0.6, two days ago ×0.3 (a 0–100+ index). NORMAL < 60, ELEVATED 60–100, CAUTION 100–135, HIGH ≥ 135. Catches the “third hard day in a row” a single-day view misses; eases after a genuinely low-braking day. Harper & Kiely 2018.",
    },
    plSpike: {
      title: "PL Spike (Player Load)",
      body: "Today's total Player Load ÷ his OWN 28-day average. grey < 1.15×, amber 1.15–1.5×, red ≥ 1.5×. The blunt volume check behind the specific columns — read it WITH them (1.6× + ECC + high decel ≠ 1.6× balanced/low-decel). Early season the denominator is unstable → provisional. Gabbett 2016.",
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
        <PopoverContent side="bottom" align="center" className="w-80">
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
          <div className="flex shrink-0 items-center gap-2">
            <CoachTutorialButton slug="gps-load-signals" />
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-600">
              {totalPlayers} {lang === "IS" ? "leikmenn" : "players"}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">

        {/* Answer-first: a one-line load-state headline, then the plain-language
            cohort alerts; the KPI tiles + signal table below are the drill-down. */}
        <p className="text-sm font-medium text-slate-800">{gpsVerdict}</p>
        <CohortAlerts rows={rows} lang={lang} />

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
      title: lang === "IS" ? "Eccentric-ríkt + hátt decel burden — ACL / framanlæri / patellar tendon áhætta" : "Eccentric-dominant + elevated decel burden — ACL / quadriceps / patellar tendon risk",
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
