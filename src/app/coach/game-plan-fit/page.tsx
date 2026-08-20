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
import BasketballGamePlanFit from "@/components/coach/BasketballGamePlanFit";

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

          {/* Per-instruction advice — the concrete lever (advisory, coach overrides) */}
          {r.advice && (
            <p className="mt-2 rounded-md border border-[#2740e6]/20 bg-[#2740e6]/5 px-2.5 py-1.5 text-[12px] font-medium text-[#2740e6]">
              → {bi(r.advice, lang)}
            </p>
          )}

          {/* Counterfactual */}
          {r.counterfactual && (
            <p className="mt-1.5 rounded-md border border-blue-100 bg-blue-50/60 px-2.5 py-1.5 text-[12px] text-blue-800">
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

/** Always-available, expandable in-page explainer — the four layers, the words on the page, and
 *  what each verdict means. Layer-2 detail per the explainability rules: on the page, behind a toggle. */
function GamePlanFitExplainer({ is }: { is: boolean }) {
  const layers: { n: string; term: string; def: string }[] = is
    ? [
        { n: "1", term: "Kröfa stöðu", def: "Staða leikmannsins ræður hvaða hreyfigæði skipta mestu. Framherji er veginn á spretti og loftfirrðan forða; bakvörður á hemlun og endurtekna vél; miðjumaður á viðvarandi vél og stefnubreytingar (Modric o.fl. 2019)." },
        { n: "2", term: "Andstæðingur (stíll)", def: "Stíll andstæðingsins breytir kröfunum: lág vörn reynir á viðvarandi vél + sköpun; há pressa á hemlun + skammtíma-forða; beint/skyndisóknir á vél + hemlun. Stíllinn er sjálfkrafa lagður til úr njósn (★), þú getur breytt með einum smelli." },
        { n: "3", term: "Geta hans", def: "Hans eigin GPS/VALD hreyfigæði, röðuð sem hundraðsröð innan stöðuhóps hans (0–100). Fyrir Lite-lið án GPS er þolið metið úr þrekprófum (MAS/VIFT). Talan hægra megin á spjaldinu er samsett geta hans veginn eftir kröfu stöðu×andstæðings." },
        { n: "4", term: "Readiness", def: "Canonical morgunliturinn (grænn / gulur / rauður) — nákvæmlega sami litur og daglega yfirlitið. Hann hliðar getuna: niðurstaðan er sú lakari af getu og readiness. CMJ ↓% birtist sem auka-merki þegar stökkkraftur er undir 6-vikna venju (Janetzki 2023)." },
      ]
    : [
        { n: "1", term: "Role demand", def: "The player's position sets which movement qualities matter most. A forward is weighted to sprint and anaerobic reserve; a full-back to braking and a repeatable engine; a midfielder to sustained engine and change-of-direction (Modric et al. 2019)." },
        { n: "2", term: "Opponent (style)", def: "The opponent's style shifts the demands: a low block taxes sustained engine + creation; a high press taxes braking + short-burst reserve; direct/counter taxes engine + braking. The style is auto-suggested from scouting (★); override it with one click." },
        { n: "3", term: "His capacity", def: "His own GPS/VALD movement qualities, ranked as a percentile within his position group (0–100). For Lite teams without GPS, the engine is estimated from fitness tests (MAS/VIFT). The number on the right of the card is his composite capacity weighted by the role×opponent demand." },
        { n: "4", term: "Readiness", def: "The canonical morning colour (green / amber / red) — the exact colour the Daily Briefing shows. It gates the capacity: the verdict is the worse of capacity and readiness. A CMJ ↓% badge appears when jump power is below the 6-week norm (Janetzki 2023)." },
      ];

  const verdicts: { chip: string; cls: string; def: string }[] = is
    ? [
        { chip: "Sterkt", cls: "border-emerald-300 bg-emerald-50 text-emerald-700", def: "Getan mætir kröfu stöðu×andstæðings OG readiness er grænt. Hann er líkamlega klár í það sem hlutverkið krefst gegn þessum andstæðingi í dag." },
        { chip: "Varúð", cls: "border-amber-300 bg-amber-50 text-amber-700", def: "Annaðhvort er eitt kröfu-gæði of stutt fyrir hlutverkið, eða readiness er gult. Spilanlegur, en spjaldið nefnir takmarkandann og hvað myndi snúa honum." },
        { chip: "Veikt", cls: "border-red-300 bg-red-50 text-red-700", def: "Alvarlegt misræmi getu×kröfu, eða rautt readiness. Íhugaðu hvíld, minnkaðu þá tilteknu kröfu, eða samþykktu varúðina meðvitað." },
        { chip: "Óvíst", cls: "border-slate-300 bg-slate-50 text-slate-500", def: "Of lítil hreyfigögn fyrir stöðuna, eða engin readiness-skráning í dag. Við sýnum „ekki nóg til að dæma“ frekar en ágiskun. Markverðir eru utan umfangs." },
      ]
    : [
        { chip: "Strong", cls: "border-emerald-300 bg-emerald-50 text-emerald-700", def: "Capacity meets the role×opponent demand AND readiness is green. He is physically ready for what his role asks against this opponent today." },
        { chip: "Caution", cls: "border-amber-300 bg-amber-50 text-amber-700", def: "Either one demand quality is short for the role, or readiness is amber. Playable, but the card names the limiter and what would flip it." },
        { chip: "Poor", cls: "border-red-300 bg-red-50 text-red-700", def: "A serious capacity×demand mismatch, or a red readiness. Consider rotating him, reducing that specific demand, or accepting the caution knowingly." },
        { chip: "Unknown", cls: "border-slate-300 bg-slate-50 text-slate-500", def: "Too little movement data for the role, or no readiness check-in today. We show “not enough to judge” rather than a guess. Goalkeepers are out of scope." },
      ];

  return (
    <details className="group rounded-2xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="text-sm font-semibold text-slate-900">
          {is ? "Hvað er ég að skoða? Lögin fjögur, dómarnir og orðin útskýrð" : "What am I looking at? The four layers, the verdicts and the words explained"}
        </span>
        <span className="shrink-0 text-[#2740e6] transition-transform group-open:rotate-90">→</span>
      </summary>
      <div className="space-y-5 border-t border-slate-100 px-4 py-4">
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Í stuttu máli" : "In one line"}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
            {is
              ? "Fyrir hvern leikmann fyrir leikinn: er hann líkamlega klár Í DAG að gera það sem staðan hans verður beðin um gegn ÞESSUM andstæðingi? Við sameinum fernt sem þú átt nú þegar — kröfu stöðu, stíl andstæðings, getu og readiness — í eina einfalda niðurstöðu. Plönunar-linsa; hún velur aldrei liðið og snertir aldrei readiness-dóminn."
              : "Per player before the match: is he physically ready TODAY to do what his role will be asked to do against THIS opponent? We fuse four things you already have — role demand, opponent style, capacity and readiness — into one plain verdict. A planning lens; it never picks the XI and never touches the readiness verdict."}
          </p>
        </section>

        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{is ? "Lögin fjögur" : "The four layers"}</h3>
          <ol className="mt-2 space-y-2.5">
            {layers.map((l) => (
              <li key={l.n} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2740e6]/10 text-[11px] font-semibold text-[#2740e6]">{l.n}</span>
                <span>
                  <span className="text-[13px] font-semibold text-slate-900">{l.term}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-slate-600">{l.def}</span>
                </span>
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
            ? "Hvers vegna „hundraðsröð“? Við berum leikmann saman við jafningja í hans stöðu, ekki við allt liðið — spretta-tala bakvarðar á að mælast við aðra bakverði. Opnaðu spjald til að sjá kröfu-vs-getu stikurnar. Reglur reikna hæfnina — ekki AI. Áætlað readiness (~) lækkar vissu."
            : "Why “percentile”? We compare a player to peers in his position, not to the whole squad — a full-back's sprint should be judged against other full-backs. Open a card to see the demand-vs-capacity bars. Rules compute the fit — not AI. Estimated readiness (~) lowers confidence."}
        </p>
      </div>
    </details>
  );
}

export default function GamePlanFitPage() {
  const [sport, setSport] = useState<string | null | undefined>(undefined);
  useEffect(() => { (async () => {
    try {
      const t = (await getSupabaseClient().auth.getSession()).data.session?.access_token ?? "";
      const r = await fetch("/api/coach/player-stats/config", { headers: { Authorization: `Bearer ${t}` } }).then((x) => x.json()).catch(() => null);
      setSport(r?.sport ? String(r.sport).toLowerCase() : null);
    } catch { setSport(null); }
  })(); }, []);
  if (sport === undefined) return <div className="mx-auto max-w-4xl px-4 py-10 text-center text-sm text-slate-400">…</div>;
  if (sport === "basketball") return <BasketballGamePlanFit />;
  return <FootballGamePlanFit />;
}

function FootballGamePlanFit() {
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

      <GamePlanFitExplainer is={L === "IS"} />

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
