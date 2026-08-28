"use client";

/**
 * Submaximal HR (HRex) — record a fixed-load submaximal run per player and read the
 * aerobic-fitness TREND (Buchheit: lower HRex at the same run = fitter; SWC ≈1% HRex /
 * ≈7% HRR). Descriptive conditioning context — read alongside phase + wellness, never
 * the readiness colour. Bilingual.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { computeHrExTrend, type HrExTest, type HrExTrend } from "@/lib/micropulse/hrEx";
import CoachTutorialButton from "@/components/coach/tutorials/CoachTutorialButton";

type ApiRow = { id: string; test_date: string; speed_kmh: number | null; duration_s: number | null; hrex_bpm: number | null; hrr_bpm: number | null; notes: string | null };

const TREND_STYLE: Record<HrExTrend, { dot: string; text: string }> = {
  improving: { dot: "#1c7a4a", text: "text-emerald-700" },
  declining: { dot: "#a83e28", text: "text-rose-700" },
  mixed: { dot: "#de9328", text: "text-amber-700" },
  stable: { dot: "#8a8f8c", text: "text-slate-600" },
  insufficient: { dot: "#c8c8c8", text: "text-slate-500" },
};

export default function HrExCard({ players, playerId }: { players: Array<{ id: string; name: string }>; playerId?: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [selInternal, setSelInternal] = React.useState("");
  const sel = playerId ?? selInternal;
  const [rows, setRows] = React.useState<ApiRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [hrex, setHrex] = React.useState("");
  const [hrr, setHrr] = React.useState("");
  const [speed, setSpeed] = React.useState("9");
  const [date, setDate] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? null, []);
  React.useEffect(() => { if (!playerId && !selInternal && players.length) setSelInternal(players[0].id); }, [players, selInternal, playerId]);

  const load = React.useCallback(async () => {
    if (!sel) { setRows(null); return; }
    setLoading(true);
    try {
      const tok = await token(); if (!tok) return;
      const r = await fetch(`/api/coach/hr-ex-test?player=${sel}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" }).then((x) => x.json()).catch(() => null);
      setRows(r && r.ok ? (r.tests ?? []) : null);
    } finally { setLoading(false); }
  }, [sel, token]);
  React.useEffect(() => { setMsg(null); setHrex(""); setHrr(""); setDate(""); void load(); }, [load]);

  async function save() {
    const hrexBpm = Number(hrex);
    if (!Number.isFinite(hrexBpm) || hrexBpm < 60 || hrexBpm > 230) { setMsg(is ? "Sláðu inn gildan HRex (60-230)." : "Enter a valid HRex (60-230)."); return; }
    setBusy(true); setMsg(null);
    try {
      const tok = await token(); if (!tok) return;
      const res = await fetch(`/api/coach/hr-ex-test`, {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ playerId: sel, hrexBpm, hrrBpm: hrr ? Number(hrr) : undefined, speedKmh: speed ? Number(speed) : undefined, testDate: date || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setMsg(j.error ?? "Error"); return; }
      setHrex(""); setHrr(""); setDate(""); await load();
    } finally { setBusy(false); }
  }

  const read = React.useMemo(() => {
    const tests: HrExTest[] = (rows ?? []).map((r) => ({ date: r.test_date, hrexBpm: r.hrex_bpm ?? 0, hrrBpm: r.hrr_bpm, speedKmh: r.speed_kmh })).filter((t) => t.hrexBpm > 0);
    return computeHrExTrend(tests);
  }, [rows]);
  const ts = TREND_STYLE[read.trend];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{is ? "Undirhámarks-HR (HRex)" : "Submaximal HR (HRex)"}</span>
        <span className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]"
          title={is ? "Fast undirhámarks-hlaup (t.d. 9 km/klst). Lægra HRex = betra þrek (Buchheit). Lýsandi — snertir aldrei readiness." : "Fixed submaximal run (e.g. 9 km/h). Lower HRex = fitter (Buchheit). Descriptive — never touches readiness."}>
          Aerobic trend ⓘ
        </span>
        <CoachTutorialButton slug="hr-ex-protocol" label={{ en: "How to run this test", is: "Hvernig á að keyra prófið" }} />
        {!playerId ? (
          <select value={sel} onChange={(e) => setSelInternal(e.target.value)} className="ml-auto rounded-lg border border-slate-300 px-2 py-1 text-[13px]">
            {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : null}
      </div>

      {/* Trend read */}
      {read.trend !== "insufficient" && (
        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ts.dot }} />
            <span className={`text-[13px] font-medium ${ts.text}`}>{is ? read.verdict.is : read.verdict.en}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
            {read.latest ? <span>HRex <b className="tabular-nums text-slate-700">{read.latest.hrexBpm}</b> {is ? "sl/mín" : "bpm"}</span> : null}
            {read.hrexDeltaPct != null ? <span>{is ? "vs viðmið" : "vs baseline"} <b className={`tabular-nums ${read.hrexDeltaPct < 0 ? "text-emerald-600" : read.hrexDeltaPct > 0 ? "text-rose-600" : "text-slate-600"}`}>{read.hrexDeltaPct > 0 ? "+" : ""}{read.hrexDeltaPct}%</b></span> : null}
            {read.hrrDeltaPct != null ? <span>HRR <b className={`tabular-nums ${read.hrrDeltaPct > 0 ? "text-emerald-600" : "text-rose-600"}`}>{read.hrrDeltaPct > 0 ? "+" : ""}{read.hrrDeltaPct}%</b></span> : null}
            <span className="text-slate-400">{read.nTests} {is ? "próf" : "tests"} · {read.confidence}</span>
          </div>
        </div>
      )}

      {/* Entry form */}
      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-slate-500">HRex ({is ? "sl/mín" : "bpm"})
            <input value={hrex} onChange={(e) => setHrex(e.target.value)} inputMode="numeric" placeholder="158" className="mt-0.5 block w-24 rounded border border-slate-300 px-2 py-1 text-[13px] tabular-nums" />
          </label>
          <label className="text-[11px] text-slate-500">HRR ({is ? "valfrj." : "opt."})
            <input value={hrr} onChange={(e) => setHrr(e.target.value)} inputMode="numeric" placeholder="32" className="mt-0.5 block w-20 rounded border border-slate-300 px-2 py-1 text-[13px] tabular-nums" />
          </label>
          <label className="text-[11px] text-slate-500">{is ? "Hraði km/klst" : "Speed km/h"}
            <input value={speed} onChange={(e) => setSpeed(e.target.value)} inputMode="decimal" placeholder="9" className="mt-0.5 block w-20 rounded border border-slate-300 px-2 py-1 text-[13px] tabular-nums" />
          </label>
          <label className="text-[11px] text-slate-500">{is ? "Dags. (valfrj.)" : "Date (opt.)"}
            <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="mt-0.5 block rounded border border-slate-300 px-2 py-1 text-[13px]" />
          </label>
          <button onClick={() => void save()} disabled={busy || !hrex} className="rounded-lg bg-[#2740e6] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40">{busy ? "…" : (is ? "Skrá" : "Save")}</button>
          {msg ? <span className="text-[11px] font-medium text-red-700">{msg}</span> : null}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          {is ? "HRex = meðal-HR síðustu 30-60 s af föstu hlaupi. HRR = HR-fall fyrstu 60 s í hvíld. Endurtaktu sama próf reglulega." : "HRex = mean HR over the last 30-60 s of a fixed run. HRR = HR drop over the first 60 s of recovery. Repeat the same protocol regularly."}
        </p>
      </div>

      {/* History */}
      {loading ? <p className="mt-3 text-[13px] text-slate-400">…</p> : null}
      {!loading && (rows?.length ?? 0) === 0 ? (
        <p className="mt-3 text-[13px] text-slate-500">{is ? "Engin HRex próf skráð enn." : "No HRex tests recorded yet."}</p>
      ) : null}
      {!loading && (rows?.length ?? 0) > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
              <th className="py-1 pr-3">{is ? "Dags." : "Date"}</th><th className="py-1 pr-3">HRex</th><th className="py-1 pr-3">HRR</th><th className="py-1">{is ? "Hraði" : "Speed"}</th>
            </tr></thead>
            <tbody>
              {(rows ?? []).map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-1 pr-3 text-slate-500">{r.test_date}</td>
                  <td className="py-1 pr-3 font-semibold tabular-nums text-slate-800">{r.hrex_bpm}</td>
                  <td className="py-1 pr-3 tabular-nums text-slate-600">{r.hrr_bpm ?? "—"}</td>
                  <td className="py-1 tabular-nums text-slate-500">{r.speed_kmh != null ? `${r.speed_kmh} km/h` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="mt-3 text-[11px] text-slate-400">{is ? read.caveat.is : read.caveat.en}</p>
    </div>
  );
}
