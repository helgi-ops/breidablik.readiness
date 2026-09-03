"use client";

/**
 * Periodization Hub (Team Planning) — a season macro → meso plan generated from the team's OWN data
 * (fixtures, load curve), plus per-player individualisation (Type 1–5 interval speeds from his MAS,
 * strength zone from his VBT) and an honest "data readiness" panel that names what's missing. The
 * micro (weekly) layer stays in Week Setup / the Training Programme — this hub links to it.
 * Rules recommend; the coach decides. Never overrides the readiness colour. EN default, IS toggle.
 */

export const dynamic = "force-dynamic";

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import PageCrossRef from "@/components/coach/PageCrossRef";
import { mdWeekTargets, type MdDayTarget, type TeamAverages } from "@/lib/micropulse/periodization";

type Bi = { en: string; is: string };
type Phase = { key: string; label: Bi; start: string; end: string; weeks: number; matches: number; rationale: Bi };
type Block = { index: number; phase: Bi; goal: Bi; start: string; end: string; weeks: number; isDeload: boolean; acwr: number | null; volumeTargetPct: number | null; flag: Bi | null };
type WeekLoad = { weekStart: string; load: number | null };
type Interval = { type: number; label: Bi; pctMas: number; kmh: number | null };
type Vbt = { exercise: string; latestLoadKg: number | null; latestMeanV: number | null; zone: Bi; note: Bi } | null;
type Gap = { key: string; severity: "missing" | "stale" | "ok"; message: Bi };
type StrengthDefault = { quality: Bi; pct1rm: Bi; velocity: Bi; intent: Bi; cite: string };
type Vald = { status: "green" | "yellow" | "red" | null; capPct: number | null; note: Bi };
type Player = { playerId: string; name: string; position: string | null; masKmh: number | null; masSource: string | null; masAgeDays: number | null; intervals: Interval[]; vbt: Vbt; strengthFallback: StrengthDefault | null; vald: Vald; gaps: Gap[] };
type TeamAvg = { sessions: number; players: number; distanceM: number | null; hsrM: number | null; sprintM: number | null; maxKmh: number | null; playerLoad: number | null; plPerMin: number | null; accel: number | null; decel: number | null; direction: { forward: number; backward: number; lateral: number } | null; matchSessions: number; matchDistanceM: number | null; matchHsrM: number | null; matchPlayerLoad: number | null };
type PositionBaseline = { key: number; label: Bi; avg: TeamAvg };
type Tier = { tier: "pro" | "core" | "rpe" | "none"; loadSource: "gps" | "srpe" | "none"; label: Bi; confidence: "high" | "medium" | "low"; unlock: Bi | null };
type Plan = { seasonYear: number; phases: Phase[]; blocks: Block[]; loadCurve: WeekLoad[]; positionBaselines: PositionBaseline[]; tier: Tier; mdShape: Record<string, number>; players: Player[] };

const PHASE_BG: Record<string, string> = { preseason: "#7a5cc4", competitive: "#2740e6", offseason: "#94a3b8" };
const shortDate = (iso: string, is: boolean) => { try { return new Intl.DateTimeFormat(is ? "is-IS" : "en-GB", { day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00`)); } catch { return iso; } };

function LoadCurve({ weeks, is }: { weeks: WeekLoad[]; is: boolean }) {
  const vals = weeks.map((w) => w.load ?? 0);
  if (vals.length < 2) return null;
  const max = Math.max(...vals) || 1;
  const W = 640, H = 90, padB = 4, slot = W / weeks.length, bw = Math.max(2, slot * 0.7);
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wide text-slate-400">{is ? "Vikulegt álag liðsins (Player Load) — raunveruleg þróun" : "Weekly team load (Player Load) — the real trend"}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-24 w-full" preserveAspectRatio="none">
        {weeks.map((w, i) => { const h = ((w.load ?? 0) / max) * (H - padB); return <rect key={i} x={i * slot + (slot - bw) / 2} y={H - padB - h} width={bw} height={h} rx="1" fill="#2740e6" opacity="0.6"><title>{`${w.weekStart}: ${Math.round(w.load ?? 0)}`}</title></rect>; })}
      </svg>
      <div className="flex justify-between text-[9px] text-slate-400"><span>{shortDate(weeks[0].weekStart, is)}</span><span>{shortDate(weeks[weeks.length - 1].weekStart, is)}</span></div>
    </div>
  );
}

export default function PeriodizationHubPage() {
  const [lang] = useLang();
  const is = lang === "IS";
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [selId, setSelId] = React.useState("");
  const [preStart, setPreStart] = React.useState("");   // coach-set pre-season start (e.g. December)
  const [seasonEnd, setSeasonEnd] = React.useState("");  // coach-set season end (e.g. late October)
  const [saved, setSaved] = React.useState(false);
  const [friendly, setFriendly] = React.useState("");    // pre-season friendly date to add (MD anchor)
  const [mdPosKey, setMdPosKey] = React.useState<number | null>(null); // position for the MD-week template

  const authHeader = React.useCallback(async () => `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}`, [supabase]);

  const load = React.useCallback(async (preS: string, endS: string) => {
    setLoading(true); setErr(null);
    try {
      const qs = new URLSearchParams();
      if (preS) qs.set("preStart", preS);
      if (endS) qs.set("seasonEnd", endS);
      const res = await fetch(`/api/coach/periodization?${qs}`, { headers: { Authorization: await authHeader() } });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) { setErr(j.error ?? "Failed"); return; }
      setPlan(j.plan as Plan);
      setSelId((prev) => prev || ((j.plan as Plan).players?.[0]?.playerId ?? ""));
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [authHeader]);

  React.useEffect(() => { load("", ""); }, [load]);

  async function savePlan() {
    if (!plan) return;
    setSaved(false);
    const res = await fetch("/api/coach/periodization", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() },
      body: JSON.stringify({ seasonYear: plan.seasonYear, overrides: { preseasonStart: preStart || undefined, seasonEnd: seasonEnd || undefined },
        blocks: plan.blocks.map((b) => ({ block_index: b.index, phase: b.phase.en, goal: b.goal.en, start_date: b.start, end_date: b.end, is_deload: b.isDeload, targets: { acwr: b.acwr, volumeTargetPct: b.volumeTargetPct } })) }),
    });
    setSaved(res.ok);
  }

  async function addFriendly() {
    if (!friendly) return;
    const res = await fetch("/api/coach/periodization", { method: "POST", headers: { "Content-Type": "application/json", Authorization: await authHeader() }, body: JSON.stringify({ addFriendly: friendly }) });
    if (res.ok) { setFriendly(""); load(preStart, seasonEnd); } // re-anchor MD with the new friendly
  }

  const player = plan?.players.find((p) => p.playerId === selId) ?? null;
  const sevColor = (s: string) => (s === "missing" ? "bg-rose-100 text-rose-800" : s === "stale" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-bold text-slate-900">{is ? "Tímabilsskipulag" : "Periodization Hub"}</h1>
      <PagePurpose
        en="build a season plan — macro phases → meso blocks → the week — generated from this team's own fixtures, load and tests, not a generic template"
        is="byggðu tímabils-áætlun — makró fasar → mesó lotur → vikan — búin til úr eigin leikjum, álagi og prófum liðsins, ekki almennu sniðmáti"
      />
      <PageCrossRef
        en="This page: the season plan (macro → meso) from the team's data. The week itself (MD-minus/plus) lives in Week Setup; the per-player MD week in the Training Programme (Æfingavika)."
        is="Þessi síða: tímabils-áætlunin (makró → mesó) úr gögnum liðsins. Sjálf vikan (MD-mínus/plús) er í Week Setup; per-leikmanns MD-vikan í Æfingaviku."
      />

      {loading && <div className="mt-4 rounded-lg border bg-white p-6 text-center text-sm text-slate-500">{is ? "Set saman áætlun úr gögnum…" : "Assembling the plan from your data…"}</div>}
      {err && <div className="mt-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{err}</div>}

      {plan && !loading && (
        <div className="mt-4 space-y-4">
          {/* TIER — every club gets a plan; hardware only adds detail + confidence */}
          {plan.tier && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px]">
              <span className="rounded bg-[#2740e6]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2740e6]">{is ? "gagnastig" : "data tier"}</span>
              <span className="font-semibold text-slate-800">{is ? plan.tier.label.is : plan.tier.label.en}</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-600">{is ? "álagsferill úr" : "load curve from"} {plan.tier.loadSource === "gps" ? (is ? "GPS ytra álagi" : "GPS external load") : plan.tier.loadSource === "srpe" ? "sRPE (RPE×mín)" : "—"}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-400">{is ? "vissa" : "conf"}: {plan.tier.confidence}</span>
              {plan.tier.unlock && <span className="w-full text-[11px] text-slate-500">↑ {is ? plan.tier.unlock.is : plan.tier.unlock.en}</span>}
            </div>
          )}
          {/* MACRO */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">{is ? "Makró — tímabils-kortið" : "Macro — the season map"} <span className="text-[11px] font-normal text-slate-400">{plan.seasonYear}</span></h2>
              {/* Coach sets the window — some start pre-season in December, season ends late October. */}
              <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                <span>{is ? "Undirb. frá" : "Pre-season from"}</span>
                <input type="date" value={preStart} onChange={(e) => setPreStart(e.target.value)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px]" />
                <span>{is ? "tímabil lýkur" : "season ends"}</span>
                <input type="date" value={seasonEnd} onChange={(e) => setSeasonEnd(e.target.value)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px]" />
                <button onClick={() => load(preStart, seasonEnd)} className="rounded-lg bg-[#2740e6] px-2 py-1 text-[11px] font-semibold text-white">{is ? "Uppfæra" : "Apply"}</button>
                <button onClick={savePlan} className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">{saved ? (is ? "✓ Vistað" : "✓ Saved") : (is ? "Vista" : "Save")}</button>
              </div>
            </div>
            {/* Pre-season friendlies anchor MD before the competitive season. */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              <span>{is ? "Bæta við æfingaleik (preseason → MD-akkeri)" : "Add a friendly (pre-season → MD anchor)"}</span>
              <input type="date" value={friendly} onChange={(e) => setFriendly(e.target.value)} className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px]" />
              <button onClick={addFriendly} disabled={!friendly} className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-[#2740e6] hover:bg-slate-50 disabled:opacity-40">{is ? "+ Æfingaleikur" : "+ Friendly"}</button>
            </div>
            {plan.phases.length === 0 ? (
              <p className="mt-2 text-[12px] text-slate-500">{is ? "Engir leikir skráðir fyrir tímabilið." : "No fixtures on record for the season."}</p>
            ) : (
              <>
                <div className="mt-2 flex h-7 w-full overflow-hidden rounded-lg">
                  {plan.phases.map((ph) => <span key={ph.key} className="flex items-center justify-center text-[10px] font-semibold text-white" style={{ flexGrow: ph.weeks, background: PHASE_BG[ph.key] ?? "#64748b" }} title={`${ph.start} → ${ph.end}`}>{is ? ph.label.is : ph.label.en}</span>)}
                </div>
                <ul className="mt-2 space-y-1">
                  {plan.phases.map((ph) => <li key={ph.key} className="text-[12px] text-slate-600"><span className="font-medium text-slate-800">{is ? ph.label.is : ph.label.en}</span> ({shortDate(ph.start, is)}–{shortDate(ph.end, is)}) — {is ? ph.rationale.is : ph.rationale.en}</li>)}
                </ul>
                <div className="mt-3"><LoadCurve weeks={plan.loadCurve} is={is} /></div>
              </>
            )}
          </section>

          {/* SQUAD BASELINE PER POSITION — GPS + IMA averages from the data that exists (the "squad default") */}
          {(plan.positionBaselines ?? []).some((b) => b.avg.sessions > 0) && (() => {
            const km = (m: number | null) => (m == null ? "–" : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);
            const rows = plan.positionBaselines.filter((b) => b.avg.sessions > 0);
            return (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-900">{is ? "Grunnlína eftir stöðu (GPS + IMA)" : "Baseline by position (GPS + IMA)"}</h2>
                <p className="mt-1 text-[11px] text-slate-500">{is ? "Meðaltal per æfingu/leik yfir tímabilið úr raungögnum, eftir stöðu — peak-kröfur eru staða-sértækar (Ju). „Sjálfgefna gildið“ sem einstaklings-viðmið falla á er HANS staða, ekki allt liðið." : "Average per session over the season, from the real data, by position — peak demands are position-specific (Ju). The \"default\" a player falls back to is HIS position, not the whole team."}</p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead><tr className="text-left text-[9px] uppercase tracking-wide text-slate-400">
                      <th className="py-1 pr-2 font-medium">{is ? "Staða" : "Position"}</th>
                      <th className="py-1 pr-2 text-right font-medium">{is ? "Vegal." : "Dist"}</th>
                      <th className="py-1 pr-2 text-right font-medium">HSR</th>
                      <th className="py-1 pr-2 text-right font-medium">{is ? "Hám." : "Max"}</th>
                      <th className="py-1 pr-2 text-right font-medium">PL</th>
                      <th className="py-1 pr-2 text-right font-medium">Acc/Dec</th>
                      <th className="py-1 pl-2 font-medium">{is ? "IMA fram/hlið/aftur" : "IMA fwd/lat/back"}</th>
                    </tr></thead>
                    <tbody>
                      {rows.map((b) => { const a = b.avg; return (
                        <tr key={b.key} className="border-t border-slate-100">
                          <td className="py-1 pr-2 font-medium text-slate-800">{is ? b.label.is : b.label.en} <span className="text-[9px] font-normal text-slate-400">({a.players})</span></td>
                          <td className="py-1 pr-2 text-right tabular-nums">{km(a.distanceM)}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{a.hsrM == null ? "–" : `${Math.round(a.hsrM)}m`}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{a.maxKmh == null ? "–" : a.maxKmh}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{a.playerLoad == null ? "–" : Math.round(a.playerLoad)}</td>
                          <td className="py-1 pr-2 text-right tabular-nums">{a.accel ?? "–"}/{a.decel ?? "–"}</td>
                          <td className="py-1 pl-2">
                            {a.direction ? (
                              <span className="inline-flex h-2 w-24 overflow-hidden rounded-full align-middle" title={`${Math.round(a.direction.forward * 100)}/${Math.round(a.direction.lateral * 100)}/${Math.round(a.direction.backward * 100)}`}>
                                <span className="bg-[#2740e6]" style={{ width: `${a.direction.forward * 100}%` }} /><span className="bg-slate-400" style={{ width: `${a.direction.lateral * 100}%` }} /><span className="bg-amber-500" style={{ width: `${a.direction.backward * 100}%` }} />
                              </span>
                            ) : <span className="text-slate-300">–</span>}
                          </td>
                        </tr>
                      ); })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1 text-[9px] text-slate-400">{is ? "Vegalengd/HSR/PL = meðaltal per session · Hám. = km/klst · IMA-slá: 🔵 fram / ⚪ hlið / 🟡 aftur. Lýsandi — aldrei readiness-liturinn." : "Distance/HSR/PL = mean per session · Max = km/h · IMA bar: 🔵 fwd / ⚪ lat / 🟡 back. Descriptive — never the readiness colour."}</p>
              </section>
            );
          })()}

          {/* MD-ANCHORED WEEK — the numbers tied to matchday, per position */}
          {(plan.positionBaselines ?? []).some((b) => b.avg.sessions > 0) && (() => {
            const rows = plan.positionBaselines.filter((b) => b.avg.sessions > 0);
            const pos = rows.find((b) => b.key === mdPosKey) ?? rows[0];
            const mdDays: MdDayTarget[] = mdWeekTargets(pos.avg as unknown as TeamAverages, plan.mdShape);
            const typeColor: Record<string, string> = { mechanical: "#a83e28", locomotive: "#2740e6", mixed: "#7a5cc4", technical: "#64748b", restart: "#de9328", topup: "#de9328", match: "#1c7a4a" };
            const shapeFromData = plan.mdShape && Object.keys(plan.mdShape).length > 0;
            return (
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">{is ? "MD-vika — álagsmörk bundin við leikdag" : "MD week — targets anchored to matchday"}</h2>
                  <select value={pos.key} onChange={(e) => setMdPosKey(Number(e.target.value))} className="ml-auto rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12px]">
                    {rows.map((b) => <option key={b.key} value={b.key}>{is ? b.label.is : b.label.en}</option>)}
                  </select>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{is ? "Hver dagur vísar til leikdags (MD). Tölurnar koma úr stöðu-grunnlínunni × %-af-leikkröfu dagsins. Restart/Mechanical/Locomotive/Top-up. Þarf æfingaleik í preseason til að MD-N sé til." : "Each day is relative to matchday (MD). Numbers come from the position baseline × the day's %-of-match-demand. Restart/Mechanical/Locomotive/Top-up. Needs a pre-season friendly for MD-N to exist there."}</p>
                <div className="mt-2 space-y-1.5">
                  {mdDays.map((d) => (
                    <div key={d.mdTag} className="rounded-lg border border-slate-200 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: typeColor[d.type] }}>{d.mdTag}</span>
                        <span className="text-[12px] font-semibold text-slate-900">{is ? d.label.is : d.label.en}</span>
                        <span className="text-[11px] text-slate-500">— {is ? d.quality.is : d.quality.en}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-700">
                        {d.targets.map((t, i) => <span key={i}><span className="text-slate-400">{is ? t.metric.is : t.metric.en}:</span> <b className="tabular-nums">{t.value}</b></span>)}
                      </div>
                      {d.note && <p className="mt-0.5 text-[10px] text-slate-400">{is ? d.note.is : d.note.en}</p>}
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-slate-500">{shapeFromData ? (is ? "✓ Niðurtröppunar-lögunin er úr EIGIN MD-meðaltölum liðsins (ekki kennslubók)." : "✓ The taper shape is from the team's OWN per-MD-day averages (not a textbook curve).") : (is ? "Sjálfgefin %-af-leikkröfu lögun (ekki næg eigin MD-gögn enn)." : "Default %-of-match-demand shape (not enough own per-MD data yet).")}</p>
                <p className="mt-1 text-[9px] text-slate-400">Owen 2017 (positional mesocycle, MD taper) · Oliveira 2019 (congested-week variants) · Oliveira 2021 (ACWR/monotony on sRPE+HSR, positional) · Teixeira 2021 (monitoring) · Martín-García 2018 (%-of-match-demand). {is ? "Lýsandi — aldrei readiness-liturinn." : "Descriptive — never the readiness colour."}</p>
              </section>
            );
          })()}

          {/* MESO */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">{is ? "Mesó — 4-vikna lotur" : "Meso — 4-week blocks"}</h2>
            <p className="mt-1 text-[11px] text-slate-500">{is ? "Álags-ramp og niðurtröppun úr raunverulegu vikulegu álagi liðsins (ACWR)." : "Progression + deload derived from the team's real weekly load (ACWR)."}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {plan.blocks.map((b) => (
                <div key={b.index} className={`rounded-lg border p-2.5 ${b.isDeload ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-slate-900">{is ? b.phase.is : b.phase.en}</span>
                    <span className="text-[10px] text-slate-400">{shortDate(b.start, is)}–{shortDate(b.end, is)} · {b.weeks}{is ? " vk" : "w"}</span>
                    {b.acwr != null && <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600">ACWR {b.acwr}</span>}
                  </div>
                  <p className="mt-1 text-[12px] text-slate-700">{is ? b.goal.is : b.goal.en}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px]">
                    {b.volumeTargetPct != null && <span className="text-slate-500">{is ? "Magn-mark" : "Volume target"}: <b>{b.volumeTargetPct}%</b></span>}
                    {b.flag && <span className={`rounded px-1.5 py-0.5 font-semibold ${b.isDeload ? "bg-amber-200 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{is ? b.flag.is : b.flag.en}</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* MICRO — link out */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">{is ? "Mikró — vikan" : "Micro — the week"}</h2>
            <p className="mt-1 text-[12px] text-slate-600">{is ? "Vikan sjálf (MD-mínus/plús, dag fyrir dag) er byggð annars staðar — þessi hub setur lotu-markið, vikan útfærir það." : "The week itself (MD-minus/plus, day by day) is built elsewhere — this hub sets the block target, the week executes it."}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a href="/coach/week-setup" className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-[#2740e6] hover:bg-slate-50">{is ? "Vikuuppsetning →" : "Week Setup →"}</a>
              <a href="/coach/training-programme" className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-[#2740e6] hover:bg-slate-50">{is ? "Æfingavika (per leikmann) →" : "Training Programme (per player) →"}</a>
            </div>
          </section>

          {/* INDIVIDUALISATION + DATA READINESS */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">{is ? "Einstaklingsmiðun" : "Individualisation"}</h2>
              <select value={selId} onChange={(e) => setSelId(e.target.value)} className="ml-auto rounded-lg border border-slate-300 bg-white px-2 py-1 text-[13px]">
                {plan.players.map((p) => <option key={p.playerId} value={p.playerId}>{p.name}</option>)}
              </select>
            </div>

            {player && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {/* Endurance intervals from his MAS */}
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Þolþjálfun — interval-hraði (Type 1–5)" : "Endurance — interval speeds (Type 1–5)"}</div>
                  {player.masKmh != null ? (
                    <>
                      <p className="mt-1 text-[12px] text-slate-600">{is ? "MAS" : "MAS"}: <b>{player.masKmh} km/klst</b> <span className="text-slate-400">· {player.masSource}{player.masAgeDays != null ? ` · ${player.masAgeDays}d` : ""}</span></p>
                      <table className="mt-1 w-full text-[12px] text-slate-700">
                        <tbody>{player.intervals.map((z) => <tr key={z.type}><td className="py-0.5 pr-2 text-slate-500">T{z.type} · {is ? z.label.is : z.label.en}</td><td className="py-0.5 text-right font-semibold tabular-nums">{z.kmh} km/klst</td><td className="py-0.5 pl-2 text-right text-[10px] text-slate-400">{z.pctMas}% MAS</td></tr>)}</tbody>
                      </table>
                    </>
                  ) : <p className="mt-1 text-[12px] text-slate-400">{is ? "Ekkert þolpróf — sjá gögn-tilbúnaðar spjaldið." : "No endurance test — see the data-readiness panel."}</p>}
                </div>
                {/* Strength from his VBT */}
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Styrktarþjálfun — VBT" : "Strength — VBT"}</div>
                  {player.vbt ? (
                    <>
                      <p className="mt-1 text-[12px] text-slate-700">{player.vbt.exercise} · <b>{player.vbt.latestLoadKg ?? "–"} kg</b> @ {player.vbt.latestMeanV?.toFixed(2)} m/s → <span className="font-semibold">{is ? player.vbt.zone.is : player.vbt.zone.en}</span></p>
                      <p className="mt-1 text-[11px] text-slate-500">{is ? player.vbt.note.is : player.vbt.note.en}</p>
                    </>
                  ) : player.strengthFallback ? (
                    <>
                      <p className="mt-1 text-[12px] text-slate-700"><span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-700">{is ? "rannsóknar-viðmið (enginn VBT)" : "research default (no VBT)"}</span> {is ? player.strengthFallback.quality.is : player.strengthFallback.quality.en}</p>
                      <p className="mt-1 text-[12px] text-slate-700"><b>{is ? player.strengthFallback.pct1rm.is : player.strengthFallback.pct1rm.en}</b> · {is ? player.strengthFallback.velocity.is : player.strengthFallback.velocity.en} · {is ? player.strengthFallback.intent.is : player.strengthFallback.intent.en}</p>
                      <p className="mt-1 text-[10px] text-slate-400">{player.strengthFallback.cite}</p>
                    </>
                  ) : <p className="mt-1 text-[12px] text-slate-400">{is ? "Enginn VBT prófíll." : "No VBT profile."}</p>}
                </div>
              </div>
            )}

            {/* VALD readiness to LOAD — volume cap (not the daily readiness colour) */}
            {player && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 p-2.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${player.vald.status === "green" ? "bg-emerald-500" : player.vald.status === "yellow" ? "bg-amber-500" : player.vald.status === "red" ? "bg-rose-500" : "bg-slate-300"}`} />
                <span className="text-[12px] text-slate-700"><span className="font-semibold">{is ? "VALD — geta til að taka álag" : "VALD — readiness to load"}{player.vald.capPct != null ? ` · ${is ? "magn-þak" : "cap"} ${player.vald.capPct}%` : ""}</span> — {is ? player.vald.note.is : player.vald.note.en}</span>
              </div>
            )}

            {/* Data readiness — name the gap */}
            {player && (
              <div className="mt-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Gögn tilbúin? — hvað vantar" : "Data readiness — what's missing"}</div>
                {player.gaps.length === 0 ? <p className="mt-1 text-[12px] text-emerald-700">{is ? "Öll gögn til staðar." : "All data present."}</p> : (
                  <ul className="mt-1 space-y-1">
                    {player.gaps.map((g) => <li key={g.key} className="flex items-start gap-2 text-[12px] text-slate-700"><span className={`mt-0.5 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${sevColor(g.severity)}`}>{g.severity}</span><span>{is ? g.message.is : g.message.en}</span></li>)}
                  </ul>
                )}
              </div>
            )}
          </section>

          <p className="text-[10px] text-slate-400">{is ? "Reglur mæla með — þjálfari ákveður og hnekkir. Tímabilsskipulag setur áætlunina; readiness stýrir deginum. Það breytir aldrei readiness-litnum. Martin-García 2018 (taper) · Buchheit & Laursen 2013 (interval) · Mann/Weakley (VBT-svæði)." : "Rules recommend — the coach decides and overrides. Periodization sets the plan; readiness modulates the day. It never changes the readiness colour. Martin-García 2018 (taper) · Buchheit & Laursen 2013 (intervals) · Mann/Weakley (VBT zones)."}</p>
        </div>
      )}
    </div>
  );
}
