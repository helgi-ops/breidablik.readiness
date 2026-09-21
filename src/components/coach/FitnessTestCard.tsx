"use client";

/**
 * Fitness tests — record standardized endurance tests (Yo-Yo, 30-15 IFT, beep, VAMEVAL, 4-min MAS
 * run, line drill, 17s, max sprint) per player and see the history + honest derived MAS/VO₂max.
 * Descriptive — feeds MAS/VIFT prescription + CS/D′ + ASR, never the readiness colour. Bilingual.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { FITNESS_TESTS, FITNESS_TEST_TYPES, type FitnessTestType } from "@/lib/micropulse/load/fitnessTests";
import { buildFitnessTrends, type FitnessTrendRead } from "@/lib/micropulse/load/fitnessTrend";
import ShowDetails from "@/components/common/ShowDetails";

// Colour-NEUTRAL trend glyph (monitoring, not a verdict): a rise/drop is marked, never "good/bad".
const DIR_GLYPH: Record<string, string> = { up: "▲", down: "▼", stable: "■", insufficient: "·" };

function TrendSpark({ vals }: { vals: number[] }) {
  if (vals.length < 2) return null;
  const W = 110, H = 26, min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - 2 - ((v - min) / span) * (H - 4)}`).join(" ");
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-6 w-[110px]" role="img" aria-label="trend"><polyline points={pts} fill="none" stroke="#64748b" strokeWidth={1.4} /></svg>;
}

type Bi = { en: string; is: string };
type TestRow = {
  id: string; test_date: string; test_type: string; result_value: number | null; result_unit: string | null;
  mas_kmh: number | null; vo2max_est: number | null; label: Bi;
};
type Resp = { ok: boolean; tests?: TestRow[] };

export default function FitnessTestCard({ players, playerId }: { players: Array<{ id: string; name: string }>; playerId?: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [selInternal, setSelInternal] = React.useState("");
  const sel = playerId ?? selInternal; // controlled by the page when playerId is passed
  const [tests, setTests] = React.useState<TestRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [type, setType] = React.useState<FitnessTestType>("yo_yo_ir1");
  const [val, setVal] = React.useState("");
  const [date, setDate] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);
  React.useEffect(() => { if (!playerId && !selInternal && players.length) setSelInternal(players[0].id); }, [players, selInternal, playerId]);

  const load = React.useCallback(async () => {
    if (!sel) { setTests(null); return; }
    setLoading(true);
    try {
      const tok = await token(); if (!tok) return;
      const r: Resp | null = await fetch(`/api/coach/fitness-test?player=${sel}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" }).then((x) => x.json()).catch(() => null);
      setTests(r && r.ok ? (r.tests ?? []) : null);
    } finally { setLoading(false); }
  }, [sel, token]);
  React.useEffect(() => { setMsg(null); setVal(""); setDate(""); void load(); }, [load]);

  async function save() {
    const resultValue = Number(val);
    if (!Number.isFinite(resultValue) || resultValue <= 0) { setMsg(is ? "Sláðu inn gilt gildi." : "Enter a valid value."); return; }
    setBusy(true); setMsg(null);
    try {
      const tok = await token(); if (!tok) return;
      const res = await fetch(`/api/coach/fitness-test`, {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ playerId: sel, testType: type, resultValue, testDate: date || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setMsg(j.error ?? "Error"); return; }
      setVal(""); setDate(""); await load();
    } finally { setBusy(false); }
  }

  const def = FITNESS_TESTS[type];
  // History grouped by test_type (newest first, already sorted by date desc from the API).
  const groups = React.useMemo(() => {
    const m = new Map<string, TestRow[]>();
    for (const t of tests ?? []) { const arr = m.get(t.test_type) ?? []; arr.push(t); m.set(t.test_type, arr); }
    return [...m.entries()];
  }, [tests]);
  const trends = React.useMemo(() => buildFitnessTrends((tests ?? []).map((t) => ({
    test_date: t.test_date, test_type: t.test_type,
    result_value: t.result_value == null ? null : Number(t.result_value),
    result_unit: t.result_unit, mas_kmh: t.mas_kmh, vo2max_est: t.vo2max_est,
  }))), [tests]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{is ? "Þolpróf" : "Fitness tests"}</span>
        <span className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]"
          title={is ? "Stöðluð þolpróf → MAS/VIFT álagsmörk + CS/D′ + ASR. Lýsandi — snertir aldrei readiness." : "Standardized endurance tests → MAS/VIFT load targets + CS/D′ + ASR. Descriptive — never touches readiness."}>
          MAS · VIFT · VO₂ ⓘ
        </span>
        {!playerId ? (
          <select value={sel} onChange={(e) => setSelInternal(e.target.value)} className="ml-auto rounded-lg border border-slate-300 px-2 py-1 text-[13px]">
            {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : null}
      </div>

      {/* Entry form */}
      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-slate-500">{is ? "Próf" : "Test"}
            <select value={type} onChange={(e) => setType(e.target.value as FitnessTestType)} className="mt-0.5 block rounded border border-slate-300 px-2 py-1 text-[13px]">
              {FITNESS_TEST_TYPES.map((t) => <option key={t} value={t}>{is ? FITNESS_TESTS[t].label.is : FITNESS_TESTS[t].label.en}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-slate-500">{is ? def.resultLabel.is : def.resultLabel.en}
            <input value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" placeholder={def.unit} className="mt-0.5 block w-28 rounded border border-slate-300 px-2 py-1 text-[13px] tabular-nums" />
          </label>
          <label className="text-[11px] text-slate-500">{is ? "Dags. (valfrjálst)" : "Date (optional)"}
            <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="mt-0.5 block rounded border border-slate-300 px-2 py-1 text-[13px]" />
          </label>
          <button onClick={() => void save()} disabled={busy || !val} className="rounded-lg bg-[#2740e6] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40">{busy ? "…" : (is ? "Skrá" : "Save")}</button>
          {msg ? <span className="text-[11px] font-medium text-red-700">{msg}</span> : null}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{is ? def.hint.is : def.hint.en}</p>
      </div>

      {/* Trend strip — is his engine rising or falling across retests? Descriptive, colour-neutral. */}
      {(() => {
        const primary = trends.byTestType.find((r) => r.dir !== "insufficient") ?? null;
        if (!primary && !trends.masAcross) return null;
        const head = primary ?? trends.masAcross!;
        const rows: FitnessTrendRead[] = [...trends.byTestType, ...(trends.masAcross ? [trends.masAcross] : [])];
        return (
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Þróun" : "Trend"}</span>
              <span className="text-[12px] text-slate-400">{DIR_GLYPH[head.dir]}</span>
              {head.points.length >= 2 ? <TrendSpark vals={head.points.map((p) => p.value)} /> : null}
            </div>
            <p className="mt-0.5 text-[13px] font-semibold text-slate-900">{is ? head.verdict.is : head.verdict.en}</p>
            <ShowDetails label={{ EN: "Per-test detail & how change is judged", IS: "Sundurliðun og hvernig breyting er metin" }}>
              <div className="space-y-2 text-[12px]">
                <table className="w-full tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="py-1 font-medium">{is ? "Próf" : "Test"}</th>
                      <th className="py-1 text-right font-medium">{is ? "Nýjast" : "Latest"}</th>
                      <th className="py-1 text-right font-medium">{is ? "Frá byrjun" : "Season"}</th>
                      <th className="py-1 text-right font-medium">{is ? "Staða" : "Dir"}</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
                    {rows.filter((r) => r.points.length).map((r, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-1 text-slate-600">{(is ? r.metricLabel.is : r.metricLabel.en)}{r.indicative ? <span className="ml-1 text-[10px] text-amber-700">{is ? "(viðmið)" : "(indicative)"}</span> : null}</td>
                        <td className="py-1 text-right">{r.latest ?? "–"}</td>
                        <td className="py-1 text-right">{r.seasonDeltaPct == null ? "–" : `${r.seasonDeltaPct > 0 ? "+" : ""}${r.seasonDeltaPct}%`}</td>
                        <td className="py-1 text-right text-slate-500">{DIR_GLYPH[r.dir]} {r.dir === "insufficient" ? (is ? "grunn" : "base") : r.dir}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] leading-relaxed text-slate-500">{is ? head.caveat.is : head.caveat.en}</p>
                <p className="text-[11px] text-slate-500">{is ? "Aðeins breyting umfram dæmigerða skekkju prófsins" : "Only a change beyond the test's typical error"} (SWC ±{head.swcPct}%) {is ? "telst upp/niður." : "counts as up/down."}</p>
                <p className="mt-1 text-[10px] text-slate-400">Buchheit 2014 · Bangsbo 2008 (field-test reliability / SWC)</p>
              </div>
            </ShowDetails>
          </div>
        );
      })()}

      {/* History */}
      {loading ? <p className="mt-3 text-[13px] text-slate-400">…</p> : null}
      {!loading && groups.length === 0 ? (
        <p className="mt-3 text-[13px] text-slate-500">{is ? "Engin þolpróf skráð enn." : "No fitness tests recorded yet."}</p>
      ) : null}
      {!loading && groups.length ? (
        <div className="mt-3 space-y-2">
          {groups.map(([tt, rows]) => {
            const latest = rows[0];
            const prev = rows[1] ?? null;
            const delta = prev && latest.result_value != null && prev.result_value != null ? latest.result_value - prev.result_value : null;
            return (
              <div key={tt} className="rounded-xl border border-slate-100 px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-semibold text-slate-800">{is ? latest.label.is : latest.label.en}</span>
                  <span className="text-[15px] font-bold tabular-nums text-slate-900">{latest.result_value}</span>
                  <span className="text-[12px] text-slate-400">{latest.result_unit}</span>
                  {delta != null && delta !== 0 ? (
                    <span className={`text-[11px] font-semibold ${delta > 0 ? "text-emerald-600" : "text-amber-700"}`}>{delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 10) / 10)}</span>
                  ) : null}
                  <span className="ml-auto text-[11px] text-slate-400">{latest.test_date}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                  {latest.mas_kmh != null ? <span>MAS <b className="tabular-nums text-slate-700">{latest.mas_kmh} km/h</b></span> : null}
                  {latest.vo2max_est != null ? <span>VO₂max <b className="tabular-nums text-slate-700">{latest.vo2max_est}</b></span> : null}
                  {rows.length > 1 ? <span className="text-slate-400">{rows.length} {is ? "mælingar" : "tests"}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <p className="mt-3 text-[11px] text-slate-400">{is ? "Reglur reikna — ekki AI. Lýsandi — snertir aldrei readiness." : "Rules compute — not AI. Descriptive — never touches readiness."}</p>
    </div>
  );
}
