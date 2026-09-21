"use client";

/**
 * Player-facing fitness retest trend — READ-ONLY. The athlete's own engine (MAS / Yo-Yo / VO₂)
 * across retests: rising, falling, or stable within test error. Uses the same pure `buildFitnessTrends`
 * lib as the coach card, so the read is identical to what staff see.
 *
 * Descriptive conditioning monitoring — never a verdict, never touches readiness. Colour-neutral: a
 * drop is "worth a retest", not "bad". Self-hides until at least one test exists. The player can't
 * enter tests here (a coach records them).
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { buildFitnessTrends, type FitnessTrendRead } from "@/lib/micropulse/load/fitnessTrend";

type Row = { test_date: string; test_type: string; result_value: number | null; result_unit: string | null; mas_kmh: number | null; vo2max_est: number | null };

const DIR_GLYPH: Record<string, string> = { up: "▲", down: "▼", stable: "■", insufficient: "·" };

function TrendSpark({ vals }: { vals: number[] }) {
  if (vals.length < 2) return null;
  const W = 110, H = 26, min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - 2 - ((v - min) / span) * (H - 4)}`).join(" ");
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-6 w-[110px]" role="img" aria-label="trend"><polyline points={pts} fill="none" stroke="#64748b" strokeWidth={1.4} /></svg>;
}

export default function PlayerFitnessTrendCard() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [tests, setTests] = React.useState<Row[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const tok = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null;
      if (!tok) return;
      const res = await fetch("/api/player/fitness-test", { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (alive) setTests(j && j.ok ? (j.tests ?? []) : []);
    })();
    return () => { alive = false; };
  }, []);

  const trends = React.useMemo(() => buildFitnessTrends((tests ?? []).map((t) => ({
    test_date: t.test_date, test_type: t.test_type,
    result_value: t.result_value == null ? null : Number(t.result_value),
    result_unit: t.result_unit, mas_kmh: t.mas_kmh, vo2max_est: t.vo2max_est,
  }))), [tests]);

  if (!tests || tests.length === 0) return null; // self-hide until a coach records a test

  const rows: FitnessTrendRead[] = [...trends.byTestType, ...(trends.masAcross ? [trends.masAcross] : [])];
  const head = trends.byTestType.find((r) => r.dir !== "insufficient") ?? trends.masAcross ?? trends.byTestType[0] ?? null;
  if (!head) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Þolpróf — þróun" : "Fitness — trend"}</span>
        <span className="text-[12px] text-slate-400">{DIR_GLYPH[head.dir]}</span>
        {head.points.length >= 2 ? <TrendSpark vals={head.points.map((p) => p.value)} /> : null}
      </div>
      <p className="mt-0.5 text-[14px] font-semibold text-slate-900">{is ? head.verdict.is : head.verdict.en}</p>

      {rows.filter((r) => r.points.length >= 2).length > 1 ? (
        <ul className="mt-1.5 space-y-0.5">
          {rows.filter((r) => r.points.length >= 2 && r !== head).map((r, i) => (
            <li key={i} className="text-[12px] text-slate-500">
              {DIR_GLYPH[r.dir]} {(is ? r.metricLabel.is : r.metricLabel.en)}
              {r.indicative ? <span className="ml-1 text-[10px] text-amber-700">{is ? "(viðmið)" : "(indicative)"}</span> : null}
              {r.seasonDeltaPct != null ? <span className="ml-1 tabular-nums text-slate-400">{r.seasonDeltaPct > 0 ? "+" : ""}{r.seasonDeltaPct}%</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
        {is
          ? `Aðeins breyting umfram dæmigerða prófskekkju (±${head.swcPct}%) telst upp/niður. Lækkun getur verið afþjálfun, endurheimt, þreyta EÐA mæliskekkja — verð endurprófs, ekki dómur.`
          : `Only a change beyond the test's typical error (±${head.swcPct}%) counts as up/down. A drop can be detraining, recovery, fatigue OR measurement error — worth a retest, not a verdict.`}
      </p>
    </div>
  );
}
