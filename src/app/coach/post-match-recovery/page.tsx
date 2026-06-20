"use client";

export const dynamic = "force-dynamic";

/**
 * Post-match recovery board — for one match, every player who played and their
 * canonical readiness colour across MD+1 → MD+N, so the coach sees who rebounded
 * by MD+2 (Nédélec 2012) and who is lagging. Visual, print-friendly.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";

type Color = "green" | "yellow" | "red" | null;
type Offset = { key: string; date: string };
type LoadTier = "high" | "mid" | "low" | null;
type Cmj = { jhPct: number | null; rsiPct: number | null };
type Player = {
  id: string; name: string; position: string | null; minutes: number;
  colors: Record<string, Color>; cmj: Record<string, Cmj | null>; reboundedByMd2: boolean; lagging: boolean; md2: Color;
  load: { decel: number; score: number | null; tier: LoadTier } | null;
  heavyEcho: boolean; notPostMatch: boolean;
};
type Counts = { green: number; yellow: number; red: number; none: number };
type Resp = {
  match: { date: string; opponent: string | null; competition: string | null; is_home: boolean | null; days_ago: number } | null;
  matches: Array<{ date: string; opponent: string | null; is_home: boolean | null }>;
  offsets: Offset[];
  players: Player[];
  summary: { played: number; by_offset: Record<string, Counts>; rebounded_by_md2: number; with_md2: number; lagging: number; cmj_tested: number } | null;
};

const CELL: Record<string, string> = {
  green: "bg-emerald-500", yellow: "bg-amber-400", red: "bg-red-500", none: "bg-slate-200",
};
const BAR: Record<string, string> = {
  green: "bg-emerald-500", yellow: "bg-amber-400", red: "bg-red-500", none: "bg-slate-200",
};
const TIER: Record<string, string> = {
  high: "bg-orange-100 text-orange-700", mid: "bg-slate-100 text-slate-600", low: "bg-slate-50 text-slate-400",
};

export default function PostMatchRecoveryPage() {
  const [lang] = useLang();
  const IS = lang === "IS";
  const [data, setData] = useState<Resp | null>(null);
  const [matchDate, setMatchDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const token = useCallback(async () => {
    const sb = getSupabaseClient();
    const { data: { session } } = await sb.auth.getSession();
    return session?.access_token ?? "";
  }, []);

  const load = useCallback(async (md: string) => {
    setLoading(true); setErr(null);
    try {
      const t = await token();
      if (!t) { setErr(IS ? "Ekki innskráð(ur)" : "Not signed in"); return; }
      const qs = md ? `?match_date=${md}` : "";
      const res = await fetch(`/api/coach/post-match-recovery${qs}`, { headers: { Authorization: `Bearer ${t}` } });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "Failed"); setData(null); return; }
      setData(json as Resp);
      if (!md && json.match) setMatchDate(json.match.date);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, [token, IS]);
  useEffect(() => { void load(matchDate); }, [load, matchDate]);

  const t = {
    title: IS ? "Endurheimt eftir leik" : "Post-match recovery",
    intro: IS ? "Endurheimt leikmanna eftir leik — hver náði sér fyrir MD+2." : "Player recovery after a match — who rebounded by MD+2.",
    match: IS ? "Leikur" : "Match",
    rebounded: IS ? "náðu sér fyrir MD+2" : "rebounded by MD+2",
    lagging: IS ? "hanga flaggaðir á MD+2" : "still flagged at MD+2",
    curve: IS ? "Endurheimtarkúrfa liðsins" : "Squad recovery curve",
    player: IS ? "Leikmaður" : "Player", min: IS ? "Mín" : "Min",
    load: IS ? "IMA-álag" : "IMA load",
    loadHint: IS ? "Decel-vegið vélrænt álag úr leiknum (z vs liðið) — McBurnie 2022" : "Decel-weighted mechanical match load (z vs squad) — McBurnie 2022",
    heavyEcho: IS ? "þungt bergmál" : "heavy echo",
    notPM: IS ? "ekki post-match?" : "not post-match?",
    home: "H", away: IS ? "Ú" : "A",
    none: IS ? "engin skráning" : "no check-in",
    legend: IS ? "Grænn / Gulur / Rauður = canonical readiness þann dag" : "Green / Yellow / Red = canonical readiness that day",
    note: IS
      ? "Eftir leik er taugavöðva- og upplifuð þreyta þyngst á MD+1 og á að ná sér fyrir MD+2/MD+3 (Nédélec 2012). IMA-álagið er skammturinn — háákefðar hemlanir spá best fyrir um vöðvaskemmd (McBurnie 2022). Hátt IMA-álag + enn flaggaður á MD+2 = raunverulegt þungt bergmál; lágt álag + flaggaður = líklega annað en post-match."
      : "Post-match neuromuscular + perceived fatigue is heaviest at MD+1 and should rebound by MD+2/MD+3 (Nédélec 2012). IMA load is the \"dose\": high-intensity decelerations best predict muscle damage (McBurnie 2022). High IMA load + still flagged at MD+2 = a genuine heavy echo; low load + flagged = likely something other than post-match.",
    print: "PDF",
    noData: IS ? "Engin leikgögn." : "No match data.",
    cmjHave: IS ? "objektíf CMJ-mæling skráð á endurheimtardögum" : "objective CMJ measurements logged on recovery days",
    cmjNone: IS
      ? "Engin CMJ-mæling á MD+1–MD+N. Litur er upplifunar-proxy; CMJ (stökkhæð / RSI-mod vs baseline) er objektíva taugavöðva-mælingin (Nédélec 2012). Bættu ~30 sek ForceDecks-stökki á MD+1 við til að kveikja á þessu laginu."
      : "No CMJ logged on MD+1–MD+N. Colour is a perceptual proxy; CMJ (jump height / RSI-mod vs baseline) is the objective neuromuscular marker (Nédélec 2012). Add a ~30 s ForceDecks jump on MD+1 to light up this layer.",
  };

  const match = data?.match;
  const offsets = data?.offsets ?? [];
  const players = data?.players ?? [];
  const summary = data?.summary;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <style>{`@media print {@page{size:A4 portrait;margin:12mm} body *{visibility:hidden} #pmr,#pmr *{visibility:visible} #pmr{position:absolute;left:0;top:0;width:100%} .pmr-noprint{display:none!important} .pmr-sec{break-inside:avoid}}`}</style>

      <div className="pmr-noprint mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-base font-bold text-slate-900">{t.title}</div>
            <div className="text-xs text-slate-500">{t.intro}</div>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-slate-500">{t.match}</label>
              <select value={matchDate} onChange={(e) => setMatchDate(e.target.value)} className="mt-0.5 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                {(data?.matches ?? []).map((m) => (
                  <option key={m.date} value={m.date}>{m.date} · {m.opponent ?? "—"}{m.is_home == null ? "" : m.is_home ? ` (${t.home})` : ` (${t.away})`}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => window.print()} disabled={!match || players.length === 0}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">🖨 {t.print}</button>
          </div>
        </div>
      </div>

      {err && <div className="pmr-noprint mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {loading && <div className="pmr-noprint mb-4 text-sm text-slate-500">…</div>}

      {match && players.length > 0 && summary && (
        <div id="pmr" className="space-y-5">
          {/* Header */}
          <div className="pmr-sec flex items-end justify-between border-b border-slate-200 pb-3">
            <div>
              <div className="text-lg font-bold text-slate-900">{match.opponent ?? "—"}{match.is_home == null ? "" : match.is_home ? ` (${t.home})` : ` (${t.away})`}</div>
              <div className="text-xs text-slate-500">{match.date} · {match.days_ago} {IS ? "dögum síðan" : "days ago"} · {summary.played} {IS ? "léku" : "played"}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums text-emerald-600">{summary.rebounded_by_md2}<span className="text-sm font-normal text-slate-400">/{summary.with_md2}</span></div>
              <div className="text-[11px] text-slate-500">{t.rebounded}</div>
            </div>
          </div>

          {/* Recovery curve — colour counts per offset day */}
          <div className="pmr-sec rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{t.curve}</div>
            <div className="space-y-1.5">
              {offsets.map((o) => {
                const c = summary.by_offset[o.key];
                const total = c.green + c.yellow + c.red + c.none || 1;
                return (
                  <div key={o.key} className="flex items-center gap-2">
                    <div className="w-12 shrink-0 text-[11px] font-medium tabular-nums text-slate-600">{o.key}</div>
                    <div className="flex h-5 flex-1 overflow-hidden rounded">
                      {(["red", "yellow", "green", "none"] as const).map((k) => c[k] > 0 ? (
                        <div key={k} className={`${BAR[k]} flex items-center justify-center text-[10px] font-semibold ${k === "yellow" || k === "none" ? "text-slate-700" : "text-white"}`}
                          style={{ width: `${(c[k] / total) * 100}%` }} title={`${c[k]} ${k}`}>{c[k] > 0 ? c[k] : ""}</div>
                      ) : null)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 text-[10px] text-slate-400">{t.legend}</div>
          </div>

          {/* Player grid */}
          <div className="pmr-sec rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{t.player}</div>
              {summary.lagging > 0 && <div className="text-[11px] font-medium text-red-600">{summary.lagging} {t.lagging}</div>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="px-1 py-1 text-left font-medium">{t.player}</th>
                    <th className="px-1 py-1 text-right font-medium">{t.min}</th>
                    <th className="px-1 py-1 text-center font-medium" title={t.loadHint}>{t.load}</th>
                    {offsets.map((o) => <th key={o.key} className="px-1 py-1 text-center font-medium">{o.key}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr key={p.id} className={`border-t border-slate-100 ${p.lagging ? "bg-red-50/40" : ""}`}>
                      <td className="px-1 py-1.5">
                        <span className="font-medium text-slate-800">{p.name}</span>
                        {p.heavyEcho
                          ? <span className="ml-1 rounded bg-red-100 px-1 py-0.5 text-[9px] font-semibold text-red-700" title={t.lagging}>⚠ {t.heavyEcho}</span>
                          : p.notPostMatch
                            ? <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-medium text-amber-700">{t.notPM}</span>
                            : p.lagging ? <span className="ml-1 text-red-500" title={t.lagging}>⚠</span> : null}
                        <span className="ml-1 text-[10px] text-slate-400">{p.position}</span>
                      </td>
                      <td className="px-1 py-1.5 text-right tabular-nums text-slate-500">{p.minutes}</td>
                      <td className="px-1 py-1.5 text-center">
                        {p.load
                          ? <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${TIER[p.load.tier ?? "mid"]}`} title={`decel ${p.load.decel} · z ${p.load.score}`}>{p.load.decel}</span>
                          : <span className="text-[10px] text-slate-300">—</span>}
                      </td>
                      {offsets.map((o) => {
                        const c = p.colors[o.key] ?? "none";
                        const cmj = p.cmj?.[o.key] ?? null;
                        const pctVal = cmj ? (cmj.rsiPct ?? cmj.jhPct) : null;
                        return (
                          <td key={o.key} className="px-1 py-1.5">
                            <div className="mx-auto flex flex-col items-center justify-center gap-0.5">
                              <span className={`inline-block h-4 w-4 rounded-full ${CELL[c]}`} title={c === "none" ? t.none : `${o.key}: ${c}`} />
                              {cmj ? (
                                <span className={`text-[9px] font-semibold tabular-nums ${cmjTone(pctVal)}`}
                                  title={`CMJ vs baseline — ${cmj.jhPct != null ? `hæð ${fmtPct(cmj.jhPct)}` : ""}${cmj.rsiPct != null ? ` · RSI ${fmtPct(cmj.rsiPct)}` : ""}`}>
                                  {fmtPct(pctVal)}
                                </span>
                              ) : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Objective neuromuscular layer status (CMJ) */}
          <div className={`pmr-sec rounded-lg border p-3 text-[12px] leading-relaxed ${summary.cmj_tested > 0 ? "border-emerald-100 bg-emerald-50/40 text-slate-700" : "border-amber-100 bg-amber-50/50 text-slate-700"}`}>
            <span className="font-semibold">CMJ {summary.cmj_tested > 0 ? "✓" : "⚠"} </span>
            {summary.cmj_tested > 0 ? `${summary.cmj_tested} ${t.cmjHave}` : t.cmjNone}
          </div>

          <div className="pmr-sec rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 text-[12px] leading-relaxed text-slate-700">
            {t.note}
          </div>
          <div className="border-t border-slate-200 pt-2 text-[9px] text-slate-400">
            MicroPulse · {IS ? "Litur = canonical readiness (readiness_entries.color) · IMA-álag = decel-vegið z vs liðið" : "Colour = canonical readiness (readiness_entries.color) · IMA load = decel-weighted z vs squad"} · Nédélec 2012 · McBurnie 2022 · Gathercole 2015
          </div>
        </div>
      )}
      {match && players.length === 0 && !loading && (
        <div className="pmr-noprint rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">{t.noData}</div>
      )}
    </div>
  );
}

function fmtPct(v: number | null): string {
  if (v == null) return "·";
  return `${v > 0 ? "+" : ""}${v}%`;
}
function cmjTone(v: number | null): string {
  if (v == null) return "text-slate-400";
  if (v <= -10) return "text-red-600";
  if (v <= -5) return "text-amber-600";
  return "text-emerald-600";
}
