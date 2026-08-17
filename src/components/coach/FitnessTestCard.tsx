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
