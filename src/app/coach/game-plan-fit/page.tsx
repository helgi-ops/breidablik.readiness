"use client";

export const dynamic = "force-dynamic";

/**
 * Game-Plan Fit board (differentiator #1). Per player, per matchday: is he physically
 * ready TODAY to execute his role's tactical-physical demands vs THIS opponent? A
 * transparent composite of role demand × opponent modifier × player capacity × readiness.
 * Advisory only — a planning lens beside readiness, never the daily decision.
 */

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import { QUALITY_BY_ID } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import type { FitRead, FitTier, StyleTag, Bi } from "@/lib/micropulse/gamePlanFit";

type Resp = {
  ok: boolean; error?: string;
  generatedFor: string;
  fixture: { date: string; opponent: string | null; isHome: boolean | null; kickoff: string | null } | null;
  fixtures: Array<{ date: string; opponent: string | null; isHome: boolean | null; kickoff: string | null }>;
  opponentTag: { suggested: StyleTag; used: StyleTag; why: Bi; scouted: boolean; label: Bi };
  styleTags: Array<{ tag: StyleTag; label: Bi }>;
  rows: FitRead[];
};

type L = "EN" | "IS";
const bi = (b: Bi | undefined, lang: L) => (b ? (lang === "IS" ? b.is : b.en) : "");

const CHIP: Record<FitTier, string> = {
  strong: "border-emerald-300 bg-emerald-50 text-emerald-700",
  caution: "border-amber-300 bg-amber-50 text-amber-700",
  poor: "border-red-300 bg-red-50 text-red-700",
  unknown: "border-slate-300 bg-slate-50 text-slate-500",
};
const tierWord = (t: FitTier, lang: L): string => ({
  strong: lang === "IS" ? "Sterkt" : "Strong", caution: lang === "IS" ? "Varúð" : "Caution",
  poor: lang === "IS" ? "Veikt" : "Poor", unknown: lang === "IS" ? "Óvíst" : "Unknown",
}[t]);
const READ_DOT: Record<string, string> = { GREEN: "bg-emerald-500", GREEN_PLUS: "bg-emerald-600", YELLOW: "bg-amber-400", RED: "bg-red-500" };
const confWord = (c: string, lang: L) => (c === "high" ? (lang === "IS" ? "há vissa" : "high confidence") : c === "moderate" ? (lang === "IS" ? "miðlungs vissa" : "moderate confidence") : (lang === "IS" ? "lág vissa" : "low confidence"));

function FitCard({ r, lang }: { r: FitRead; lang: L }) {
  const [open, setOpen] = useState(false);
  const dot = READ_DOT[(r.readinessColor ?? "").toUpperCase()] ?? "bg-slate-300";
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CHIP[r.verdict]}`}>{tierWord(r.verdict, lang)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-900">{r.name}</span>
            <span className="shrink-0 text-[11px] text-slate-400">{r.position ?? "—"}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {r.cmjDropPct != null && (r.cmjTier === "caution" || r.cmjTier === "poor") && (
                <span className={`rounded px-1 text-[10px] font-semibold ${r.cmjTier === "poor" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`} title={lang === "IS" ? "CMJ vs 6-vikna venju" : "CMJ vs 6-wk norm"}>CMJ ↓{Math.abs(Math.round(r.cmjDropPct))}%</span>
              )}
              <span className={`inline-block h-2 w-2 rounded-full ${dot}`} title="readiness" />
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-slate-600">{bi(r.driver, lang)}</span>
        </span>
        <span className="shrink-0 text-[11px] text-slate-400">{r.capacityPct != null ? `${Math.round(r.capacityPct)}%` : ""}</span>
        <span className={`shrink-0 transition-transform ${open ? "rotate-90" : ""} text-slate-300`}>▸</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3 py-3 text-[12.5px]">
          {/* Layer 1 — plain facts */}
          <ul className="space-y-1">
            {r.facts.map((f, i) => <li key={i} className="text-slate-700">• {bi(f, lang)}</li>)}
          </ul>

          {/* Counterfactual */}
          {r.counterfactual && (
            <p className="mt-2 rounded-md border border-blue-100 bg-blue-50/60 px-2.5 py-1.5 text-[12px] text-blue-800">
              {lang === "IS" ? "Ef" : "What-if"}: {bi(r.counterfactual, lang)}
            </p>
          )}

          {/* Layer 2 — the demand weights × his percentiles */}
          {r.scored && r.demand.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {lang === "IS" ? "Kröfa stöðu × geta hans (hundraðsröð)" : "Role demand × his capacity (percentile)"}
              </div>
              <div className="space-y-1">
                {[...r.demand].sort((a, b) => b.weight - a.weight).map((d) => (
                  <div key={d.quality} className="flex items-center gap-2">
                    <span className="w-40 shrink-0 truncate text-slate-600">{QUALITY_BY_ID[d.quality]?.[lang === "IS" ? "is" : "en"] ?? d.quality}</span>
                    <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{Math.round(d.weight * 100)}%</span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      {d.percentile != null && <span className="absolute inset-y-0 left-0 rounded-full bg-[#2740e6]/70" style={{ width: `${d.percentile}%` }} />}
                    </span>
                    <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-slate-700">{d.percentile != null ? Math.round(d.percentile) : "—"}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-400">{lang === "IS" ? "Vinstri % = vægi kröfunnar; stikan/talan = hundraðsröð hans fyrir stöðuna." : "Left % = demand weight; the bar/number = his position-percentile."}</p>
            </div>
          )}

          {/* Confidence + citations */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
            <span>{confWord(r.confidence, lang)}</span>
            <span className="text-slate-300">·</span>
            <span>{lang === "IS" ? "Reglur reikna — ekki AI" : "Rules compute — not AI"}</span>
            <span className="text-slate-300">·</span>
            <span title={r.citations.join(" · ")}>{lang === "IS" ? "Heimildir ⓘ" : "Citations ⓘ"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GamePlanFitPage() {
  const [lang] = useLang();
  const L: L = lang === "IS" ? "IS" : "EN";
  const [data, setData] = useState<Resp | null>(null);
  const [date, setDate] = useState<string>("");
  const [tag, setTag] = useState<StyleTag | "">("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const token = useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "", []);

  const load = useCallback(async (d: string, styleTag: StyleTag | "") => {
    setLoading(true); setErr(null);
    try {
      const t = await token();
      if (!t) { setErr(L === "IS" ? "Ekki innskráð(ur)" : "Not signed in"); return; }
      const qs = new URLSearchParams();
      if (d) qs.set("date", d);
      if (styleTag) qs.set("styleTag", styleTag);
      const res = await fetch(`/api/coach/game-plan-fit${qs.toString() ? `?${qs}` : ""}`, { headers: { Authorization: `Bearer ${t}` } });
      const json = await res.json();
      if (!res.ok || !json.ok) { setErr(json.error ?? "Failed"); setData(null); return; }
      setData(json as Resp);
      if (!d && json.fixture?.date) setDate(json.fixture.date);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, [token, L]);

  useEffect(() => { void load(date, tag); }, [load, date, tag]);

  const counts = data ? {
    strong: data.rows.filter((r) => r.verdict === "strong").length,
    caution: data.rows.filter((r) => r.verdict === "caution").length,
    poor: data.rows.filter((r) => r.verdict === "poor").length,
  } : null;

  const intro = L === "IS"
    ? "hver er líkamlega klár Í DAG að framkvæma það sem staða hans krefst gegn ÞESSUM andstæðingi — kröfa stöðu × andstæðingur × geta × readiness. Ráðgefandi linsa við hlið readiness, aldrei daglega ákvörðunin."
    : "who is physically ready TODAY to execute what his role demands against THIS opponent — role demand × opponent × capacity × readiness. An advisory lens beside readiness, never the daily decision.";

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{L === "IS" ? "Leikáætlunar-hæfni" : "Game-Plan Fit"}</h1>
        <PagePurpose en={intro} is={intro} tutorial="game-plan-fit" />
      </div>

      {/* Controls: fixture + opponent style tag */}
      {data && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            {L === "IS" ? "Leikur" : "Fixture"}
            <select value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm">
              {data.fixtures.length === 0 && <option value="">{L === "IS" ? "Enginn leikur framundan" : "No upcoming fixture"}</option>}
              {data.fixtures.map((f) => (
                <option key={f.date} value={f.date}>{f.date} · {f.opponent ?? "—"} ({f.isHome ? (L === "IS" ? "heima" : "H") : (L === "IS" ? "úti" : "A")})</option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{L === "IS" ? "Stíll andst." : "Opponent style"}</span>
            <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {data.styleTags.map((s) => (
                <button key={s.tag} onClick={() => setTag(s.tag)}
                  className={`rounded-md px-2 py-0.5 text-[12px] font-medium ${data.opponentTag.used === s.tag ? "bg-[#2740e6] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                  {bi(s.label, L)}{data.opponentTag.suggested === s.tag && data.opponentTag.used !== s.tag ? " ★" : ""}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {data && (
        <p className="text-[11px] text-slate-400">
          {data.opponentTag.scouted
            ? (L === "IS" ? "★ = sjálfvirk tillaga úr njósn. " : "★ = auto-suggested from scouting. ") + bi(data.opponentTag.why, L)
            : bi(data.opponentTag.why, L)}
        </p>
      )}

      {err && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {loading && !data && <div className="py-10 text-center text-sm text-slate-400">{L === "IS" ? "Hleð…" : "Loading…"}</div>}

      {data && counts && (
        <>
          {/* Layer 0 — one-line squad glance */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
            <span className="font-semibold text-slate-800">{L === "IS" ? "Í hnotskurn:" : "At a glance:"}</span>
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[12px] font-semibold text-emerald-700">{counts.strong} {L === "IS" ? "sterk" : "strong"}</span>
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-700">{counts.caution} {L === "IS" ? "varúð" : "caution"}</span>
            <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[12px] font-semibold text-red-700">{counts.poor} {L === "IS" ? "veik" : "poor"}</span>
          </div>

          <div className="space-y-2">
            {data.rows.map((r) => <FitCard key={r.playerId} r={r} lang={L} />)}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3 text-[12px] leading-relaxed text-slate-500">
            <p>{L === "IS"
              ? "Þetta er ráðgefandi PLÖNUNAR-linsa — hún velur ekki liðið og snertir aldrei readiness-dóminn né daglegu ákvörðunina. Reglur reikna hæfnina; getan er hundraðsröðuð eftir stöðu (GPS/VALD), readiness er canonical liturinn. Þunn gögn → „ekki nóg til að dæma“, aldrei ágiskun."
              : "This is an advisory PLANNING lens — it never picks the XI and never touches the readiness verdict or the daily decision. Rules compute the fit; capacity is position-percentiled (GPS/VALD), readiness is the canonical colour. Thin data → “not enough to judge”, never a guess."}</p>
            <p className="mt-1.5 text-slate-400">Bradley &amp; Ade · Modric et al. 2019 · Janetzki et al. 2023.</p>
          </div>
        </>
      )}
    </div>
  );
}
