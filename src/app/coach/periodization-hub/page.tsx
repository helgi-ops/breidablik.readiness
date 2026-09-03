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

type Bi = { en: string; is: string };
type Phase = { key: string; label: Bi; start: string; end: string; weeks: number; matches: number; rationale: Bi };
type Block = { index: number; phase: Bi; goal: Bi; start: string; end: string; weeks: number; isDeload: boolean; acwr: number | null; volumeTargetPct: number | null; flag: Bi | null };
type WeekLoad = { weekStart: string; load: number | null };
type Interval = { type: number; label: Bi; pctMas: number; kmh: number | null };
type Vbt = { exercise: string; latestLoadKg: number | null; latestMeanV: number | null; zone: Bi; note: Bi } | null;
type Gap = { key: string; severity: "missing" | "stale" | "ok"; message: Bi };
type Player = { playerId: string; name: string; position: string | null; masKmh: number | null; masSource: string | null; masAgeDays: number | null; intervals: Interval[]; vbt: Vbt; gaps: Gap[] };
type Plan = { seasonYear: number; phases: Phase[]; blocks: Block[]; loadCurve: WeekLoad[]; players: Player[] };

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

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tok = (await supabase.auth.getSession()).data.session?.access_token;
        const res = await fetch("/api/coach/periodization", { headers: { Authorization: `Bearer ${tok ?? ""}` } });
        const j = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok || !j.ok) { setErr(j.error ?? "Failed"); return; }
        setPlan(j.plan as Plan);
        if ((j.plan as Plan).players?.length) setSelId((j.plan as Plan).players[0].playerId);
      } catch (e) { if (alive) setErr(e instanceof Error ? e.message : "Failed"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [supabase]);

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
          {/* MACRO */}
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">{is ? "Makró — tímabils-kortið" : "Macro — the season map"} <span className="text-[11px] font-normal text-slate-400">{plan.seasonYear}</span></h2>
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
                  ) : <p className="mt-1 text-[12px] text-slate-400">{is ? "Enginn VBT prófíll." : "No VBT profile."}</p>}
                </div>
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
