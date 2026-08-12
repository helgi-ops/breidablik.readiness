"use client";

export const dynamic = "force-dynamic";

/**
 * Matchday Availability Board — one selection view that answers "who can I pick,
 * and in what state?" It combines the medical record (authoritative availability
 * gate) with the canonical readiness colour (state for cleared players) plus a
 * recent-load advisory. Read-only; never touches the readiness verdict.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang, type Lang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import type { AvailabilityBoard, AvailabilityVerdict, Bilingual, Tone } from "@/lib/micropulse/availabilityBoard";

const T = (b: Bilingual, lang: Lang) => (lang === "IS" ? b.IS : b.EN);

const READINESS_DOT: Record<string, string> = {
  green: "bg-emerald-500", yellow: "bg-amber-400", red: "bg-red-500", gray: "bg-slate-300",
};
const CHIP: Record<Tone, string> = {
  green: "border-emerald-300 bg-emerald-50 text-emerald-700",
  amber: "border-amber-300 bg-amber-50 text-amber-700",
  red: "border-red-300 bg-red-50 text-red-700",
  slate: "border-slate-300 bg-white text-slate-600",
};

export default function AvailabilityBoardPage() {
  const [lang] = useLang();
  const IS = lang === "IS";
  const [data, setData] = useState<AvailabilityBoard | null>(null);
  const [date, setDate] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const token = useCallback(async () => {
    const sb = getSupabaseClient();
    const { data: { session } } = await sb.auth.getSession();
    return session?.access_token ?? "";
  }, []);

  const load = useCallback(async (d: string) => {
    setLoading(true); setErr(null);
    try {
      const t = await token();
      if (!t) { setErr(IS ? "Ekki innskráð(ur)" : "Not signed in"); return; }
      const qs = d ? `?date=${d}` : "";
      const res = await fetch(`/api/coach/availability-board${qs}`, { headers: { Authorization: `Bearer ${t}` } });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "Failed"); setData(null); return; }
      setData(json as AvailabilityBoard);
      if (!d && json.date) setDate(json.date);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, [token, IS]);

  useEffect(() => { void load(date); }, [load, date]);

  const t = {
    title: IS ? "Leikmannastaða" : "Availability Board",
    intro: IS
      ? "sjá hverjir eru tiltækir í leik og í hvaða ástandi — meiðslastaða ræður aðgengi, readiness-litur ræður ástandi."
      : "see who is available for the match and in what state — the medical record gates availability, the readiness colour sets the state.",
    date: IS ? "Dagsetning" : "Date",
    available: IS ? "Tiltækir" : "Available",
    limited: IS ? "Takmarkað" : "Limited",
    unavailable: IS ? "Ekki tiltækir" : "Unavailable",
    availableSub: IS ? "grænn + engin meiðsl" : "green + no medical flag",
    limitedSub: IS ? "veldu með stýringu" : "selectable, manage",
    unavailableSub: IS ? "meiddir / í endurhæfingu" : "injured / in rehab",
    empty: IS ? "Engir leikmenn." : "No players.",
    loading: IS ? "Hleð…" : "Loading…",
    legend: IS
      ? "Röðin er föst og útskýranleg: (1) meiðslaskrá ræður aðgengi — meiddur/í endurhæfingu er ekki tiltækur sama hversu góð readiness er; (2) fyrir þá sem eru læknisfræðilega klárir ræður canonical readiness-litur ástandinu. Álag úr síðustu 7 dögum er ráðgjöf — breytir aldrei flokknum einn og sér."
      : "The order is fixed and explainable: (1) the medical record gates availability — injured / in-rehab is not available no matter how good the readiness looks; (2) for medically-cleared players the canonical readiness colour sets the state. Recent 7-day load is advisory — it never changes the tier on its own.",
    note: IS
      ? "Þetta snertir ekki readiness-dóminn — það les aðeins canonical litinn og meiðslastöðuna og setur saman valtöflu. Meiðslastaða kemur úr Meiðsli / RTP."
      : "This never touches the readiness verdict — it only reads the canonical colour and the medical status and composes a selection view. Medical status comes from Injuries / RTP.",
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold text-slate-900">{t.title}</h1>
          <PagePurpose en={t.intro} is={t.intro} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          {t.date}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
          />
        </label>
      </div>

      {err && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {loading && !data && <div className="py-10 text-center text-sm text-slate-400">{t.loading}</div>}

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Column
              title={t.available} sub={t.availableSub} count={data.counts.available}
              accent="border-emerald-200 bg-emerald-50/40" head="text-emerald-700"
              verdicts={data.available} lang={lang} empty={t.empty}
            />
            <Column
              title={t.limited} sub={t.limitedSub} count={data.counts.limited}
              accent="border-amber-200 bg-amber-50/40" head="text-amber-700"
              verdicts={data.limited} lang={lang} empty={t.empty}
            />
            <Column
              title={t.unavailable} sub={t.unavailableSub} count={data.counts.unavailable}
              accent="border-red-200 bg-red-50/40" head="text-red-700"
              verdicts={data.unavailable} lang={lang} empty={t.empty}
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3 text-[12px] leading-relaxed text-slate-500">
            <p>{t.legend}</p>
            <p className="mt-1.5 text-slate-400">{t.note}</p>
          </div>
        </>
      )}
    </div>
  );
}

function Column({ title, sub, count, accent, head, verdicts, lang, empty }: {
  title: string; sub: string; count: number; accent: string; head: string;
  verdicts: AvailabilityVerdict[]; lang: Lang; empty: string;
}) {
  return (
    <div className={`rounded-xl border ${accent} p-3`}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div>
          <div className={`text-sm font-bold uppercase tracking-wide ${head}`}>{title}</div>
          <div className="text-[11px] text-slate-500">{sub}</div>
        </div>
        <div className={`text-2xl font-bold ${head}`}>{count}</div>
      </div>
      <div className="space-y-2">
        {verdicts.length === 0 && <div className="py-4 text-center text-xs text-slate-400">{empty}</div>}
        {verdicts.map((v) => <PlayerCard key={v.playerId} v={v} lang={lang} />)}
      </div>
    </div>
  );
}

function PlayerCard({ v, lang }: { v: AvailabilityVerdict; lang: Lang }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button onClick={() => setOpen(!open)} className="w-full p-3 text-left transition hover:bg-slate-50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${READINESS_DOT[v.readiness] ?? "bg-slate-300"}`} />
            <span className="truncate text-sm font-semibold text-slate-900">{v.name}</span>
            {v.position && <span className="shrink-0 text-[11px] text-slate-400">{v.position}</span>}
          </div>
          <span className="shrink-0 text-slate-400">{open ? "▾" : "▸"}</span>
        </div>
        {/* Layer 0: one-sentence verdict */}
        <div className="mt-1 text-[13px] font-medium text-slate-800">{T(v.headline, lang)}</div>
        {/* Layer 1: plain why — visible without a click */}
        <ul className="mt-1 space-y-0.5">
          {v.why.slice(0, 2).map((w, i) => (
            <li key={i} className="text-[12px] leading-snug text-slate-500">{T(w, lang)}</li>
          ))}
        </ul>
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50 p-3">
          {/* Factor chips */}
          {v.factors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {v.factors.map((f, i) => (
                <span key={i} className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${CHIP[f.tone]}`}>
                  {T(f.label, lang)}
                </span>
              ))}
            </div>
          )}

          {/* Full why (if more than the 2 shown) */}
          {v.why.length > 2 && (
            <ul className="mt-2 space-y-0.5">
              {v.why.slice(2).map((w, i) => (
                <li key={i} className="text-[12px] leading-snug text-slate-600">{T(w, lang)}</li>
              ))}
            </ul>
          )}

          {/* Injury detail */}
          {v.injury && (
            <div className="mt-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-600">
              {(v.injury.bodyPart || v.injury.type) && (
                <span className="font-medium text-slate-700">{v.injury.bodyPart || v.injury.type}</span>
              )}
              {v.injury.rtpStage && <span> · {lang === "IS" ? "stig" : "stage"} {v.injury.rtpStage}</span>}
              {v.injury.estimatedReturn && <span> · {lang === "IS" ? "áætluð endurkoma" : "est. return"} {v.injury.estimatedReturn}</span>}
            </div>
          )}

          {/* Counterfactual — what flips it to available */}
          {v.counterfactual && (
            <div className="mt-2 rounded border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-[11px] text-indigo-700">
              <span className="font-semibold">{lang === "IS" ? "Til að verða tiltækur: " : "To become available: "}</span>
              {T(v.counterfactual, lang)}
            </div>
          )}

          {/* Confidence */}
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${v.confidence.band === "high" ? "bg-emerald-500" : v.confidence.band === "medium" ? "bg-amber-400" : "bg-slate-300"}`} />
            <span className="uppercase tracking-wide">{v.confidence.band}</span>
            <span>· {T(v.confidence.note, lang)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
