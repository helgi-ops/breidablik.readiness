"use client";

export const dynamic = "force-dynamic";

/**
 * KSÍ report — GPS + IMA external-load summary over a chosen window (default
 * 2 weeks) for selected players (national-team / youth call-ups). Renders an
 * on-screen report plus a print-to-PDF the coach emails to KSÍ.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Day = {
  date: string; duration_min: number; total_distance: number; hsr: number; sprint: number;
  player_load: number; accels: number; decels: number; max_vel_kmh: number;
  ima_hsr: number; band5: number; band6: number; band7: number; band8: number;
  ima_acc: number; ima_dec: number; cod: number; jumps: number;
};
type Agg = Omit<Day, "date" | "duration_min" | "cod"> & { cod: number };
type Player = { player_id: string; full_name: string; sessions: number; agg: Agg; days: Day[] };

function todayIso() { return new Date().toISOString().slice(0, 10); }
function isoDaysAgo(n: number) { return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10); }
const km = (m: number) => (m / 1000).toFixed(1);
const n0 = (v: number) => Math.round(v).toLocaleString();

export default function KsiReportPage() {
  const [lang] = useLang();
  const IS = lang === "IS";
  const [from, setFrom] = useState(isoDaysAgo(13));
  const [to, setTo] = useState(todayIso());
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) { setErr(IS ? "Ekki innskráð(ur)" : "Not signed in"); return; }
      const res = await fetch(`/api/coach/ksi-report?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "Failed"); return; }
      const ps = (json.players ?? []) as Player[];
      setPlayers(ps);
      setSelected(new Set(ps.map((p) => p.player_id)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally { setLoading(false); setLoaded(true); }
  }, [from, to, IS]);

  useEffect(() => { void load(); }, [load]);

  const chosen = useMemo(() => players.filter((p) => selected.has(p.player_id)), [players, selected]);

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  const t = {
    title: IS ? "Álagsskýrsla — KSÍ" : "External Load Report — KSÍ",
    intro: IS
      ? "GPS- og IMA-álag leikmanna hjá félagi á völdu tímabili (fyrir landsliðsverkefni)."
      : "Club GPS & IMA load for selected players over the chosen window (pre-call-up).",
    period: IS ? "Tímabil" : "Period", from: IS ? "Frá" : "From", to: IS ? "Til" : "To",
    players: IS ? "Leikmenn" : "Players", all: IS ? "Allir" : "All", none: IS ? "Enginn" : "None",
    print: IS ? "Prenta / Vista PDF" : "Print / Save PDF",
    refresh: IS ? "Sækja" : "Refresh",
    generated: IS ? "Útbúin" : "Generated",
    summary: IS ? "Yfirlit" : "Summary",
    player: IS ? "Leikmaður" : "Player", sess: IS ? "Lotur" : "Sess",
    dist: IS ? "Vegalengd (km)" : "Dist (km)", hsr: "HSR (m)", sprint: IS ? "Sprettur (m)" : "Sprint (m)",
    acc: "Acc", dec: "Dec", pl: IS ? "Álag (PL)" : "Load (PL)",
    ima: IS ? "IMA háákefð (m)" : "IMA HSR (m)",
    imaAcc: "IMA Acc", imaDec: "IMA Dec", cod: "IMA CoD", jumps: "IMA Jumps",
    perPlayer: IS ? "Sundurliðun per leikmann" : "Per-player breakdown",
    date: IS ? "Dags." : "Date", min: IS ? "Mín" : "Min", noData: IS ? "Engin GPS/IMA gögn á tímabilinu" : "No GPS/IMA data in this window",
    bands: IS ? "IMA bönd 5·6·7·8 (m)" : "IMA bands 5·6·7·8 (m)",
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 11mm; }
          body * { visibility: hidden; }
          #ksi-report, #ksi-report * { visibility: visible; }
          #ksi-report { position: absolute; left: 0; top: 0; width: 100%; }
          .ksi-noprint { display: none !important; }
          .ksi-player { break-inside: avoid; }
          .ksi-section { break-inside: avoid; }
        }
      `}</style>

      {/* Controls (not printed) */}
      <div className="ksi-noprint mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-slate-500">{t.from}</label>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
              className="mt-0.5 rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-slate-500">{t.to}</label>
            <input type="date" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)}
              className="mt-0.5 rounded-md border border-slate-300 px-2 py-1 text-sm" />
          </div>
          <div className="flex gap-1.5">
            {[["2v", 13], ["4v", 27]].map(([lbl, d]) => (
              <button key={lbl as string} type="button"
                onClick={() => { setFrom(isoDaysAgo(d as number)); setTo(todayIso()); }}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">
                {IS ? (d === 13 ? "2 vikur" : "4 vikur") : (d === 13 ? "2 weeks" : "4 weeks")}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {loading ? "…" : t.refresh}
          </button>
          <button type="button" onClick={() => window.print()} disabled={chosen.length === 0}
            className="ml-auto rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            🖨 {t.print}
          </button>
        </div>

        {/* Player selection */}
        {players.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 flex items-center gap-2 text-[11px] uppercase tracking-wide text-slate-500">
              <span>{t.players} ({selected.size}/{players.length})</span>
              <button type="button" className="text-indigo-600" onClick={() => setSelected(new Set(players.map((p) => p.player_id)))}>{t.all}</button>
              <span className="text-slate-300">·</span>
              <button type="button" className="text-indigo-600" onClick={() => setSelected(new Set())}>{t.none}</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {players.map((p) => (
                <button key={p.player_id} type="button" onClick={() => toggle(p.player_id)}
                  className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium border transition-colors ${
                    selected.has(p.player_id) ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}>
                  {p.full_name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {err && <div className="ksi-noprint mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {loaded && players.length === 0 && !err && (
        <div className="ksi-noprint rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">{t.noData}</div>
      )}

      {/* ── Printable report ───────────────────────────────────────────── */}
      {chosen.length > 0 && (
        <div id="ksi-report" className="rounded-xl border border-slate-200 bg-white p-6 text-slate-800">
          <div className="ksi-section mb-4 flex items-end justify-between border-b border-slate-200 pb-3">
            <div>
              <div className="text-lg font-bold text-slate-900">{t.title}</div>
              <div className="text-xs text-slate-500">{t.intro}</div>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              <div>{t.period}: <b className="text-slate-700">{from} → {to}</b></div>
              <div>{t.generated}: {todayIso()}</div>
            </div>
          </div>

          {/* Summary table */}
          <div className="ksi-section mb-6">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">{t.summary}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b-2 border-slate-300 text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-1 text-left font-semibold">{t.player}</th>
                    <th className="px-2 py-1 text-right font-medium">{t.sess}</th>
                    <th className="px-2 py-1 text-right font-medium">{t.dist}</th>
                    <th className="px-2 py-1 text-right font-medium">{t.hsr}</th>
                    <th className="px-2 py-1 text-right font-medium">{t.sprint}</th>
                    <th className="px-2 py-1 text-right font-medium">{t.acc}</th>
                    <th className="px-2 py-1 text-right font-medium">{t.dec}</th>
                    <th className="px-2 py-1 text-right font-medium">{t.pl}</th>
                    <th className="px-2 py-1 text-right font-semibold text-emerald-700">{t.ima}</th>
                    <th className="px-2 py-1 text-right font-medium text-emerald-700">{t.imaAcc}</th>
                    <th className="px-2 py-1 text-right font-medium text-emerald-700">{t.imaDec}</th>
                    <th className="px-2 py-1 text-right font-medium text-emerald-700">{t.cod}</th>
                    <th className="px-2 py-1 text-right font-medium text-emerald-700">{t.jumps}</th>
                  </tr>
                </thead>
                <tbody>
                  {chosen.map((p) => (
                    <tr key={p.player_id} className="border-b border-slate-100">
                      <td className="px-2 py-1 font-medium text-slate-900">{p.full_name}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{p.sessions}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{km(p.agg.total_distance)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{n0(p.agg.hsr)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{n0(p.agg.sprint)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{p.agg.accels}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{p.agg.decels}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{n0(p.agg.player_load)}</td>
                      <td className="px-2 py-1 text-right font-semibold tabular-nums text-emerald-700">{n0(p.agg.ima_hsr)}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-emerald-700">{p.agg.ima_acc || "·"}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-emerald-700">{p.agg.ima_dec || "·"}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-emerald-700">{p.agg.cod || "·"}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-emerald-700">{p.agg.jumps || "·"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-player detail */}
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">{t.perPlayer}</div>
          {chosen.map((p) => (
            <div key={p.player_id} className="ksi-player mb-5">
              <div className="mb-1 flex items-baseline justify-between">
                <div className="text-sm font-bold text-slate-900">{p.full_name}</div>
                <div className="text-[11px] text-slate-500">
                  {p.sessions} {t.sess.toLowerCase()} · {km(p.agg.total_distance)} km · {t.bands}: {n0(p.agg.band5)}·{n0(p.agg.band6)}·{n0(p.agg.band7)}·{n0(p.agg.band8)}
                </div>
              </div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[9px] uppercase tracking-wide text-slate-400">
                    <th className="px-1.5 py-1 text-left font-medium">{t.date}</th>
                    <th className="px-1.5 py-1 text-right font-medium">{t.min}</th>
                    <th className="px-1.5 py-1 text-right font-medium">{t.dist}</th>
                    <th className="px-1.5 py-1 text-right font-medium">{t.hsr}</th>
                    <th className="px-1.5 py-1 text-right font-medium">{t.sprint}</th>
                    <th className="px-1.5 py-1 text-right font-medium">{t.acc}</th>
                    <th className="px-1.5 py-1 text-right font-medium">{t.dec}</th>
                    <th className="px-1.5 py-1 text-right font-medium">{t.pl}</th>
                    <th className="px-1.5 py-1 text-right font-medium text-emerald-700">{t.ima}</th>
                    <th className="px-1.5 py-1 text-right font-medium text-emerald-700">{t.imaAcc}</th>
                    <th className="px-1.5 py-1 text-right font-medium text-emerald-700">{t.imaDec}</th>
                    <th className="px-1.5 py-1 text-right font-medium text-emerald-700">{t.cod}</th>
                    <th className="px-1.5 py-1 text-right font-medium text-emerald-700">{t.jumps}</th>
                  </tr>
                </thead>
                <tbody>
                  {p.days.map((d) => (
                    <tr key={d.date} className="border-b border-slate-50">
                      <td className="px-1.5 py-0.5 text-slate-600">{d.date}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums text-slate-500">{d.duration_min || "·"}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums">{km(d.total_distance)}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums">{n0(d.hsr)}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums">{n0(d.sprint)}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums">{d.accels}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums">{d.decels}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums">{n0(d.player_load)}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums text-emerald-700">{d.ima_hsr > 0 ? n0(d.ima_hsr) : "·"}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums text-emerald-700">{d.ima_acc || "·"}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums text-emerald-700">{d.ima_dec || "·"}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums text-emerald-700">{d.cod || "·"}</td>
                      <td className="px-1.5 py-0.5 text-right tabular-nums text-emerald-700">{d.jumps || "·"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <div className="mt-4 border-t border-slate-200 pt-2 text-[9px] text-slate-400">
            MicroPulse · micropulse.is · GPS = Catapult velocity bands · IMA = Free Running band 5-8 (high-cadence running)
          </div>
        </div>
      )}
    </div>
  );
}
