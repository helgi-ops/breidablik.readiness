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
import { downloadKsiReportPdf, type KsiPdfPlayer } from "@/components/coach/KsiReportPdf";

type Day = {
  date: string; duration_min: number; total_distance: number; hsr: number; sprint: number;
  player_load: number; accels: number; decels: number; max_vel_kmh: number;
  ima_hsr: number; band5: number; band6: number; band7: number; band8: number;
  ima_acc: number; ima_dec: number; cod: number; jumps: number;
};
type Agg = Omit<Day, "date" | "duration_min" | "cod"> & { cod: number };
type RadarAxis = { key: string; labelIs: string; labelEn: string; unit: string; value: number; pct: number | null };
type Player = {
  player_id: string; full_name: string; sessions: number; agg: Agg; days: Day[];
  injuryAuto?: string; programAuto?: string; injuryNote?: string | null; programNote?: string | null;
  radar?: RadarAxis[]; matches?: number; matchMinutes?: number;
  peakDemands?: Array<{ windowMin: number; distance: number | null; hsr: number | null }>;
};
type NoteDraft = { injury: string; program: string; saving: boolean; savedAt: number | null; aiHeadline: string; aiSummary: string; aiBusy: boolean };

function todayIso() { return new Date().toISOString().slice(0, 10); }
function isoDaysAgo(n: number) { return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10); }
const km = (m: number) => (m / 1000).toFixed(1);
const n0 = (v: number) => Math.round(v).toLocaleString();

/** Hand-rolled SVG athletic radar (prints). Each axis = squad percentile (0–100); the raw
 *  value + percentile are labelled so it reads honestly, not just a shape. */
function RadarChart({ axes, is }: { axes: RadarAxis[]; is: boolean }) {
  const usable = axes.filter((a) => a.pct != null);
  if (usable.length < 3) return null;
  const W = 300, H = 250, cx = W / 2, cy = H / 2 + 6, R = 82;
  const N = usable.length;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
  const pt = (i: number, r: number) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r] as const;
  const poly = usable.map((a, i) => pt(i, R * ((a.pct ?? 0) / 100)).join(",")).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[320px]" role="img" aria-label="athletic radar">
      {[25, 50, 75, 100].map((ring) => (
        <polygon key={ring} points={usable.map((_, i) => pt(i, R * (ring / 100)).join(",")).join(" ")}
          fill="none" stroke="#e2e8f0" strokeWidth={ring === 100 ? 1.2 : 0.8} />
      ))}
      {usable.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e2e8f0" strokeWidth="0.8" />; })}
      <polygon points={poly} fill="#2740e6" fillOpacity="0.18" stroke="#2740e6" strokeWidth="1.6" />
      {usable.map((a, i) => {
        const [x, y] = pt(i, R * ((a.pct ?? 0) / 100));
        return <circle key={a.key} cx={x} cy={y} r="2.4" fill="#2740e6" />;
      })}
      {usable.map((a, i) => {
        const [lx, ly] = pt(i, R + 16);
        const anchor = Math.abs(Math.cos(ang(i))) < 0.3 ? "middle" : Math.cos(ang(i)) > 0 ? "start" : "end";
        return (
          <text key={a.key} x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontSize="8.5" fill="#475569">
            <tspan fontWeight="600">{is ? a.labelIs : a.labelEn}</tspan>
            <tspan x={lx} dy="10" fill="#94a3b8">{a.value}{a.unit && a.unit !== "n" ? " " + a.unit : ""} · {a.pct}%</tspan>
          </text>
        );
      })}
    </svg>
  );
}

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
  const [notes, setNotes] = useState<Record<string, NoteDraft>>({}); // per-player KSÍ note drafts
  const [preparedBy, setPreparedBy] = useState<string | null>(null);

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
      setPreparedBy(json.preparedBy ?? null);
      setSelected(new Set(ps.map((p) => p.player_id)));
      // Seed the editable note drafts: saved coach note if present, else the auto-derived text.
      setNotes(Object.fromEntries(ps.map((p) => [p.player_id, {
        injury: p.injuryNote ?? p.injuryAuto ?? "",
        program: p.programNote ?? p.programAuto ?? "",
        saving: false, savedAt: null, aiHeadline: "", aiSummary: "", aiBusy: false,
      } as NoteDraft])));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally { setLoading(false); setLoaded(true); }
  }, [from, to, IS]);

  useEffect(() => { void load(); }, [load]);

  const chosen = useMemo(() => players.filter((p) => selected.has(p.player_id)), [players, selected]);
  const [pdfBusy, setPdfBusy] = useState(false);

  const downloadPdf = useCallback(async () => {
    if (chosen.length === 0) return;
    setPdfBusy(true);
    try {
      const pdfPlayers: KsiPdfPlayer[] = chosen.map((p) => {
        const d = notes[p.player_id];
        return {
          full_name: p.full_name, sessions: p.sessions,
          agg: {
            total_distance: p.agg.total_distance, hsr: p.agg.hsr, sprint: p.agg.sprint, max_vel_kmh: p.agg.max_vel_kmh,
            accels: p.agg.accels, decels: p.agg.decels, player_load: p.agg.player_load, ima_hsr: p.agg.ima_hsr,
          },
          radar: p.radar ?? [],
          matches: p.matches ?? 0, matchMinutes: p.matchMinutes ?? 0,
          peakDemands: p.peakDemands ?? [],
          days: p.days.map((x) => ({
            date: x.date, duration_min: x.duration_min, total_distance: x.total_distance, hsr: x.hsr, sprint: x.sprint,
            max_vel_kmh: x.max_vel_kmh, accels: x.accels, decels: x.decels, player_load: x.player_load, ima_hsr: x.ima_hsr,
          })),
          injuryText: d?.injury ?? p.injuryNote ?? p.injuryAuto ?? "",
          programText: d?.program ?? p.programNote ?? p.programAuto ?? "",
          aiHeadline: d?.aiHeadline || undefined,
          aiSummary: d?.aiSummary || undefined,
        };
      });
      await downloadKsiReportPdf(pdfPlayers, from, to, IS ? "IS" : "EN", preparedBy);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "PDF error");
    } finally { setPdfBusy(false); }
  }, [chosen, notes, from, to, IS, preparedBy]);

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  const setNote = (id: string, field: "injury" | "program", value: string) =>
    setNotes((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value, savedAt: null } }));

  const saveNote = useCallback(async (id: string) => {
    const d = notes[id]; if (!d) return;
    setNotes((prev) => ({ ...prev, [id]: { ...prev[id], saving: true } }));
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) { setErr(IS ? "Ekki innskráð(ur)" : "Not signed in"); return; }
      const res = await fetch("/api/coach/ksi-report", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: id, injuryNote: d.injury, programNote: d.program }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); setErr(j.error ?? "Save failed"); return; }
      setNotes((prev) => ({ ...prev, [id]: { ...prev[id], savedAt: Date.now() } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setNotes((prev) => ({ ...prev, [id]: { ...prev[id], saving: false } }));
    }
  }, [notes, IS]);

  const genAi = useCallback(async (id: string) => {
    const p = players.find((x) => x.player_id === id); const d = notes[id];
    if (!p) return;
    setNotes((prev) => ({ ...prev, [id]: { ...prev[id], aiBusy: true } }));
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session?.access_token) { setErr(IS ? "Ekki innskráð(ur)" : "Not signed in"); return; }
      const res = await fetch("/api/coach/ksi-report/ai", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: p.full_name, lang: IS ? "IS" : "EN",
          window: { from, to, sessions: p.sessions },
          load: {
            total_distance: p.agg.total_distance, hsr: p.agg.hsr, sprint: p.agg.sprint, max_vel_kmh: p.agg.max_vel_kmh,
            accels: p.agg.accels, decels: p.agg.decels, player_load: p.agg.player_load, ima_hsr: p.agg.ima_hsr,
          },
          radar: (p.radar ?? []).map((r) => ({ label: IS ? r.labelIs : r.labelEn, value: r.value, unit: r.unit, pct: r.pct })),
          injuryNote: d?.injury ?? null, programNote: d?.program ?? null,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setErr(j.error ?? "AI failed"); return; }
      setNotes((prev) => ({ ...prev, [id]: { ...prev[id], aiHeadline: j.headline ?? "", aiSummary: j.summary ?? "" } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setNotes((prev) => ({ ...prev, [id]: { ...prev[id], aiBusy: false } }));
    }
  }, [players, notes, from, to, IS]);

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
    injuries: IS ? "Meiðsli / þættir að vita af" : "Injuries / factors to be aware of",
    program: IS ? "Einstaklings styrktar-/fyrirbyggjandi prógram" : "Individual strength / prevention programme",
    save: IS ? "Vista" : "Save", saving: IS ? "Vista…" : "Saving…", saved: IS ? "✓ Vistað" : "✓ Saved",
    maxv: IS ? "Hám.hraði" : "Top spd",
    aiLabel: IS ? "AI-samantekt (úr tölum hans)" : "AI summary (from his numbers)",
    aiBtn: IS ? "✨ Búa til" : "✨ Generate", aiRegen: IS ? "↻ Endurskapa" : "↻ Regenerate",
    aiNote: IS ? "Búið til af AI úr álagstölum leikmannsins — reglur velja tölurnar, AI orðar. Yfirfarið áður en sent er." : "AI-generated from the player's load numbers — rules pick the numbers, AI phrases. Review before sending.",
    radar: IS ? "Atgervis-prófíll" : "Athletic profile",
    radarNote: IS
      ? "Hver ás = percentíl leikmannsins innan liðsins á tímabilinu (0–100). Tala = uppsafnað gildi. Lýsandi — ekki dómur."
      : "Each axis = the player's percentile within the squad over the window (0–100). Number = accrued value. Descriptive — not a verdict.",
    reviewNote: IS
      ? "Forfyllt úr kerfinu — yfirfarið og lagið áður en skýrslan er send til KSÍ. Kerfið sendir aldrei sjálfkrafa."
      : "Pre-filled by the system — review and edit before sending to KSÍ. The system never sends automatically.",
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <style>{`
        .ksi-printonly { display: none; }
        @media print {
          @page { size: A4 landscape; margin: 11mm; }
          body * { visibility: hidden; }
          #ksi-report, #ksi-report * { visibility: visible; }
          #ksi-report { position: absolute; left: 0; top: 0; width: 100%; }
          .ksi-noprint { display: none !important; }
          .ksi-printonly { display: block !important; }
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
          <button type="button" onClick={() => void downloadPdf()} disabled={chosen.length === 0 || pdfBusy}
            className="ml-auto rounded-md bg-[#2740e6] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {pdfBusy ? "…" : `⬇ ${IS ? "Sækja PDF" : "Download PDF"}`}
          </button>
          <button type="button" onClick={() => window.print()} disabled={chosen.length === 0}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
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
                    <th className="px-2 py-1 text-right font-medium">{t.maxv}</th>
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
                      <td className="px-2 py-1 text-right tabular-nums">{p.agg.max_vel_kmh || "·"}</td>
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

              {/* AI summary (from his numbers) — top of the player block, like the transfer
                  dossier. The headline + summary print; the editor + button are screen-only. */}
              {(() => {
                const d = notes[p.player_id] ?? { aiHeadline: "", aiSummary: "", aiBusy: false };
                const has = d.aiHeadline || d.aiSummary;
                return (
                  <div className="ksi-section mb-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-2.5">
                    <div className="ksi-noprint mb-1 flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">{t.aiLabel}</span>
                      <button type="button" onClick={() => void genAi(p.player_id)} disabled={d.aiBusy}
                        className="rounded-md bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-50">
                        {d.aiBusy ? "…" : has ? t.aiRegen : t.aiBtn}
                      </button>
                    </div>
                    {has && (
                      <>
                        {d.aiHeadline && <div className="ksi-printonly text-[13px] font-bold text-slate-900">{d.aiHeadline}</div>}
                        {d.aiSummary && <div className="ksi-printonly mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-700">{d.aiSummary}</div>}
                        <input className="ksi-noprint mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-[12px] font-semibold"
                          value={d.aiHeadline} onChange={(e) => setNotes((prev) => ({ ...prev, [p.player_id]: { ...prev[p.player_id], aiHeadline: e.target.value } }))} />
                        <textarea className="ksi-noprint mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-[12px]" rows={3}
                          value={d.aiSummary} onChange={(e) => setNotes((prev) => ({ ...prev, [p.player_id]: { ...prev[p.player_id], aiSummary: e.target.value } }))} />
                        <div className="ksi-noprint text-[10px] text-slate-400">{t.aiNote}</div>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* KSÍ sections — injuries/factors + individual programme. The value prints; the
                  textarea + Save button are screen-only (.ksi-noprint). Coach reviews before send. */}
              {(() => {
                const d = notes[p.player_id] ?? { injury: p.injuryNote ?? p.injuryAuto ?? "", program: p.programNote ?? p.programAuto ?? "", saving: false, savedAt: null };
                return (
                  <div className="mb-2 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="ksi-section">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t.injuries}</div>
                        <div className="ksi-printonly mt-0.5 whitespace-pre-wrap text-[12px] leading-snug text-slate-800">{d.injury || "—"}</div>
                        <textarea className="ksi-noprint mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-[12px]"
                          rows={2} value={d.injury} onChange={(e) => setNote(p.player_id, "injury", e.target.value)} />
                      </div>
                      <div className="ksi-section">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t.program}</div>
                        <div className="ksi-printonly mt-0.5 whitespace-pre-wrap text-[12px] leading-snug text-slate-800">{d.program || "—"}</div>
                        <textarea className="ksi-noprint mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-[12px]"
                          rows={2} value={d.program} onChange={(e) => setNote(p.player_id, "program", e.target.value)} />
                      </div>
                    </div>
                    <div className="ksi-noprint mt-1.5 flex items-center gap-2">
                      <button type="button" onClick={() => void saveNote(p.player_id)} disabled={d.saving}
                        className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50">
                        {d.saving ? t.saving : t.save}
                      </button>
                      {d.savedAt && <span className="text-[11px] font-medium text-emerald-600">{t.saved}</span>}
                      <span className="text-[10px] text-slate-400">{t.reviewNote}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Athletic radar — physical profile as a squad percentile over the window. */}
              {p.radar && p.radar.filter((a) => a.pct != null).length >= 3 && (
                <div className="ksi-section mb-2 flex flex-wrap items-center gap-4">
                  <RadarChart axes={p.radar} is={IS} />
                  <div className="max-w-[280px] text-[10px] leading-snug text-slate-500">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">{t.radar}</div>
                    <div className="mt-0.5">{t.radarNote}</div>
                  </div>
                </div>
              )}

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
