"use client";

/**
 * Basketball Game-Plan Fit board. Per player: does his role's skill profile FIT what THIS
 * opponent's style demands, and is he ready TODAY? role demand × opponent style × box-score
 * capacity × readiness. Advisory — a matchup planning lens beside readiness, never the verdict.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import { BQUALITY_LABEL, type FitRead, type FitTier, type BStyleTag, type Bi } from "@/lib/micropulse/gamePlanFitBasketball";

type L = "EN" | "IS";
const bi = (b: Bi | undefined, l: L) => (b ? (l === "IS" ? b.is : b.en) : "");

type Resp = {
  ok: boolean; error?: string;
  opponentTag: { used: BStyleTag; label: Bi };
  styleTags: Array<{ tag: BStyleTag; label: Bi }>;
  rows: FitRead[];
};

const CHIP: Record<FitTier, string> = {
  strong: "border-emerald-300 bg-emerald-50 text-emerald-700",
  caution: "border-amber-300 bg-amber-50 text-amber-700",
  poor: "border-red-300 bg-red-50 text-red-700",
  unknown: "border-slate-300 bg-slate-50 text-slate-500",
};
const tierWord = (t: FitTier, l: L): string => ({
  strong: l === "IS" ? "Sterkt" : "Strong", caution: l === "IS" ? "Varúð" : "Caution",
  poor: l === "IS" ? "Veikt" : "Poor", unknown: l === "IS" ? "Óvíst" : "Unknown",
}[t]);
const READ_DOT: Record<string, string> = { GREEN: "bg-emerald-500", GREEN_PLUS: "bg-emerald-600", YELLOW: "bg-amber-400", RED: "bg-red-500" };
const confWord = (c: string, l: L) => (c === "high" ? (l === "IS" ? "há vissa" : "high confidence") : c === "moderate" ? (l === "IS" ? "miðlungs vissa" : "moderate confidence") : (l === "IS" ? "lág vissa" : "low confidence"));

function FitCard({ r, lang }: { r: FitRead; lang: L }) {
  const [open, setOpen] = React.useState(false);
  const dot = READ_DOT[(r.readinessColor ?? "").toUpperCase()] ?? "bg-slate-300";
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${CHIP[r.verdict]}`}>{tierWord(r.verdict, lang)}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-900">{r.name}</span>
            <span className="shrink-0 text-[11px] text-slate-400">{r.position ?? "—"}</span>
            <span className="ml-auto shrink-0"><span className={`inline-block h-2 w-2 rounded-full ${dot}`} title="readiness" /></span>
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-slate-600">{bi(r.driver, lang)}</span>
        </span>
        <span className="shrink-0 text-[11px] text-slate-400">{r.capacityPct != null ? `${Math.round(r.capacityPct)}%` : ""}</span>
        <span className={`shrink-0 transition-transform ${open ? "rotate-90" : ""} text-slate-300`}>▸</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3 py-3 text-[12.5px]">
          <ul className="space-y-1">{r.facts.map((f, i) => <li key={i} className="text-slate-700">• {bi(f, lang)}</li>)}</ul>
          {r.advice && <p className="mt-2 rounded-md border border-[#2740e6]/20 bg-[#2740e6]/5 px-2.5 py-1.5 text-[12px] font-medium text-[#2740e6]">→ {bi(r.advice, lang)}</p>}
          {r.counterfactual && <p className="mt-1.5 rounded-md border border-blue-100 bg-blue-50/60 px-2.5 py-1.5 text-[12px] text-blue-800">{lang === "IS" ? "Ef" : "What-if"}: {bi(r.counterfactual, lang)}</p>}

          {r.scored && r.demand.length > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{lang === "IS" ? "Kröfa stöðu × geta hans (hundraðsröð)" : "Role demand × his skill (percentile)"}</div>
              <div className="space-y-1">
                {[...r.demand].sort((a, b) => b.weight - a.weight).map((d) => (
                  <div key={d.quality} className="flex items-center gap-2">
                    <span className="w-40 shrink-0 truncate text-slate-600">{BQUALITY_LABEL[d.quality][lang === "IS" ? "is" : "en"]}</span>
                    <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-slate-400">{Math.round(d.weight * 100)}%</span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      {d.percentile != null && <span className="absolute inset-y-0 left-0 rounded-full bg-[#2740e6]/70" style={{ width: `${d.percentile}%` }} />}
                    </span>
                    <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-slate-700">{d.percentile != null ? Math.round(d.percentile) : "—"}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-400">{lang === "IS" ? "Vinstri % = vægi kröfunnar; stikan/talan = hundraðsröð hans innan stöðuhóps." : "Left % = demand weight; the bar/number = his percentile within his position group."}</p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
            <span>{confWord(r.confidence, lang)}</span><span className="text-slate-300">·</span>
            <span>{lang === "IS" ? "Reglur reikna — ekki AI" : "Rules compute — not AI"}</span><span className="text-slate-300">·</span>
            <span title={r.citations.join(" · ")}>{lang === "IS" ? "Heimildir ⓘ" : "Citations ⓘ"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BasketballGamePlanFit() {
  const [lang] = useLang();
  const L: L = lang === "IS" ? "IS" : "EN";
  const [data, setData] = React.useState<Resp | null>(null);
  const [tag, setTag] = React.useState<BStyleTag | "">("");
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const token = React.useCallback(async () => (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "", []);

  const load = React.useCallback(async (styleTag: BStyleTag | "") => {
    setLoading(true); setErr(null);
    try {
      const t = await token(); if (!t) { setErr(L === "IS" ? "Ekki innskráð(ur)" : "Not signed in"); return; }
      const qs = styleTag ? `?styleTag=${styleTag}` : "";
      const res = await fetch(`/api/coach/basketball-game-plan-fit${qs}`, { headers: { Authorization: `Bearer ${t}` } });
      const json = await res.json();
      if (!res.ok || !json.ok) { setErr(json.error ?? "Failed"); setData(null); return; }
      setData(json as Resp);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); } finally { setLoading(false); }
  }, [token, L]);

  React.useEffect(() => { void load(tag); }, [load, tag]);

  const counts = data ? {
    strong: data.rows.filter((r) => r.verdict === "strong").length,
    caution: data.rows.filter((r) => r.verdict === "caution").length,
    poor: data.rows.filter((r) => r.verdict === "poor").length,
  } : null;

  const intro = L === "IS"
    ? "passar hæfni hvers leikmanns í hans stöðu við það sem ÞESSI andstæðingur krefst — og er hann klár Í DAG? Kröfa stöðu × stíll andstæðings × geta (leikjatölur) × readiness. Ráðgefandi viðureignar-linsa, aldrei dómurinn."
    : "does each player's skill set fit what THIS opponent demands — and is he ready TODAY? role demand × opponent style × capacity (box-score) × readiness. An advisory matchup lens, never the verdict.";

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{L === "IS" ? "Leikáætlunar-hæfni" : "Game-Plan Fit"}</h1>
        <PagePurpose en={intro} is={intro} tutorial="game-plan-fit" />
      </div>

      <BasketballFitExplainer is={L === "IS"} />

      {/* Opponent style picker */}
      {data && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{L === "IS" ? "Stíll andst." : "Opponent style"}</span>
          <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {data.styleTags.map((s) => (
              <button key={s.tag} onClick={() => setTag(s.tag)}
                className={`rounded-md px-2 py-0.5 text-[12px] font-medium ${data.opponentTag.used === s.tag ? "bg-[#2740e6] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {bi(s.label, L)}
              </button>
            ))}
          </div>
        </div>
      )}

      {err && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {loading && !data && <div className="py-10 text-center text-sm text-slate-400">{L === "IS" ? "Hleð…" : "Loading…"}</div>}

      {data && counts && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
            <span className="font-semibold text-slate-800">{L === "IS" ? "Í hnotskurn:" : "At a glance:"}</span>
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[12px] font-semibold text-emerald-700">{counts.strong} {L === "IS" ? "sterk" : "strong"}</span>
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[12px] font-semibold text-amber-700">{counts.caution} {L === "IS" ? "varúð" : "caution"}</span>
            <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[12px] font-semibold text-red-700">{counts.poor} {L === "IS" ? "veik" : "poor"}</span>
          </div>

          <div className="space-y-2">{data.rows.map((r) => <FitCard key={r.playerId} r={r} lang={L} />)}</div>

          <div className="rounded-lg border border-slate-200 bg-white p-3 text-[12px] leading-relaxed text-slate-500">
            <p>{L === "IS"
              ? "Ráðgefandi PLÖNUNAR-linsa — hún velur ekki liðið og snertir aldrei readiness-dóminn né daglegu ákvörðunina. Reglur reikna hæfnina; getan er hundraðsröðuð eftir stöðu úr leikjatölum (InStat/KKÍ), readiness er canonical liturinn. Þunn gögn → „ekki nóg til að dæma“, aldrei ágiskun."
              : "An advisory PLANNING lens — it never picks the five and never touches the readiness verdict or the daily decision. Rules compute the fit; capacity is position-percentiled from box-score stats (InStat/KKÍ), readiness is the canonical colour. Thin data → “not enough to judge”, never a guess."}</p>
            <p className="mt-1.5 text-slate-400">Oliver 2004 · Kubatko et al. 2007 · role-based matchup scouting.</p>
          </div>
        </>
      )}
    </div>
  );
}

/** Always-available, expandable in-page explainer — the four layers + the four verdicts. */
function BasketballFitExplainer({ is }: { is: boolean }) {
  const layers = is
    ? [
        { n: "1", term: "Kröfa stöðu", def: "Staðan ræður hvaða hæfni skiptir mestu — bakvörður: spilastjórnun/3ja-skot/boltameðferð; kantmaður: skot/skorun/vörn; miðherji: fráköst/skorun undir körfu/vörn við körfu." },
        { n: "2", term: "Stíll andstæðings", def: "Þú velur stílinn: þriggja-stiga lið lyftir jaðar-vörn; sókn undir körfu lyftir vörn við körfu + fráköstum; pressu-lið lyftir boltameðferð. Þetta breytir vægi kröfunnar." },
        { n: "3", term: "Geta hans", def: "Leikjatölur hans (InStat/KKÍ) röðaðar sem hundraðsröð INNAN stöðuhóps hans (bakvörður vs bakverðir). Körfubolti er innandyra — engin GPS — svo getan kemur úr box-score, ekki hlaupagögnum." },
        { n: "4", term: "Readiness", def: "Canonical readiness-liturinn í dag. Hann hliðar getuna: niðurstaðan er sú lakari af getu og readiness." },
      ]
    : [
        { n: "1", term: "Role demand", def: "The position sets which skills matter most — guard: playmaking/3PT/ball security; wing: shooting/scoring/defence; big: rebounding/interior scoring/rim protection." },
        { n: "2", term: "Opponent style", def: "You pick the style: a three-heavy team lifts perimeter defence; an inside team lifts rim protection + rebounding; a pressure team lifts ball security. This re-weights the demand." },
        { n: "3", term: "His capacity", def: "His box-score stats (InStat/KKÍ), ranked as a percentile WITHIN his position group (guard vs guards). Basketball is indoor — no GPS — so capacity comes from the box score, not movement data." },
        { n: "4", term: "Readiness", def: "Today's canonical readiness colour. It gates the capacity: the verdict is the worse of capacity and readiness." },
      ];
  const verdicts = is
    ? [
        { chip: "Sterkt", cls: "border-emerald-300 bg-emerald-50 text-emerald-700", def: "Hæfni mætir kröfu stöðu×stíls OG readiness grænt — góð viðureign í dag." },
        { chip: "Varúð", cls: "border-amber-300 bg-amber-50 text-amber-700", def: "Ein kröfu-hæfni of stutt, eða readiness gult. Spilanlegur, en spjaldið nefnir takmarkandann." },
        { chip: "Veikt", cls: "border-red-300 bg-red-50 text-red-700", def: "Alvarlegt misræmi hæfni×kröfu, eða rautt readiness. Íhugaðu að fela hann/snúa." },
        { chip: "Óvíst", cls: "border-slate-300 bg-slate-50 text-slate-500", def: "Of lítil leikja-gögn, eða engin readiness-skráning í dag. „Ekki nóg til að dæma“ frekar en ágiskun." },
      ]
    : [
        { chip: "Strong", cls: "border-emerald-300 bg-emerald-50 text-emerald-700", def: "Skill meets the role×style demand AND readiness is green — a good matchup today." },
        { chip: "Caution", cls: "border-amber-300 bg-amber-50 text-amber-700", def: "One demanded skill is short, or readiness is amber. Playable, but the card names the limiter." },
        { chip: "Poor", cls: "border-red-300 bg-red-50 text-red-700", def: "A serious skill×demand mismatch, or a red readiness. Consider hiding him / rotating." },
        { chip: "Unknown", cls: "border-slate-300 bg-slate-50 text-slate-500", def: "Too little box-score data, or no readiness check-in today. “Not enough to judge” rather than a guess." },
      ];
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="text-sm font-semibold text-slate-900">{is ? "Hvað er ég að skoða? Lögin fjögur og dómarnir" : "What am I looking at? The four layers and the verdicts"}</span>
        <span className="shrink-0 text-[#2740e6] transition-transform group-open:rotate-90">→</span>
      </summary>
      <div className="space-y-5 border-t border-slate-100 px-4 py-4">
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Lögin fjögur" : "The four layers"}</h3>
          <ol className="mt-2 space-y-2.5">
            {layers.map((l) => (
              <li key={l.n} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2740e6]/10 text-[11px] font-semibold text-[#2740e6]">{l.n}</span>
                <span><span className="text-[13px] font-semibold text-slate-900">{l.term}</span><span className="mt-0.5 block text-[12.5px] leading-relaxed text-slate-600">{l.def}</span></span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Dómarnir fjórir" : "The four verdicts"}</h3>
          <ul className="mt-2 space-y-2.5">
            {verdicts.map((v) => (
              <li key={v.chip} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                <span className={`inline-block shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${v.cls}`}>{v.chip}</span>
                <span className="text-[12.5px] leading-relaxed text-slate-600">{v.def}</span>
              </li>
            ))}
          </ul>
        </section>
        <p className="border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-400">
          {is
            ? "Getan kemur úr leikmanna-tímabils tölfræði (importaðu InStat „Players“ eða KKÍ). Reglur reikna — ekki AI. Snertir aldrei readiness-dóminn."
            : "Capacity comes from player season box-score stats (import InStat “Players” or KKÍ). Rules compute — not AI. Never touches the readiness verdict."}
        </p>
      </div>
    </details>
  );
}
