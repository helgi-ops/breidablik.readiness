"use client";

/**
 * TrainingReadPanel — "How to develop him" (docs/train-like-you-play-individual.md).
 *
 * Per-player ranked development emphases from /api/coach/training-read: a card grid
 * (headline + confidence at a glance) that opens a modal pop-up with the full read —
 * every emphasis's why + evidence + citation, plus a "not assessable at your tier"
 * note. A tiny game-model selector drives it. Rules decide the qualities; the phrasing
 * is fixed cited templates (no AI). A distinct labelled development signal — never the
 * readiness colour. Explainability-first: verdict at a glance on the card, the plain
 * "why" one tap away, jargon + citations in the modal, confidence always shown.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { GAME_MODELS, GAME_MODEL_LABEL, type GameModel } from "@/lib/micropulse/trainingRead/catalogue";
import type { PlayerTrainingRead } from "@/lib/micropulse/trainingRead";

type Read = PlayerTrainingRead & { name: string };
type Payload = { gameModel: GameModel; reads: Read[] };

const CONF_TONE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700",
  moderate: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-500",
};
const CONF_DOT: Record<string, string> = {
  high: "bg-emerald-500",
  moderate: "bg-amber-500",
  low: "bg-slate-300",
};

// Plain-language reading of a player's confidence — parallels the Squad Load
// card's cited read. Deterministic, no AI.
const CONF_PLAIN: Record<string, { EN: string; IS: string }> = {
  high:     { EN: "High confidence — good signal coverage and a mature baseline.",        IS: "Mikið traust — góð þekja merkja og þroskuð grunnlína." },
  moderate: { EN: "Moderate confidence — partial signal or a still-maturing baseline.",   IS: "Miðlungs traust — hluti merkja eða grunnlína enn að þroskast." },
  low:      { EN: "Lower confidence — limited signal; read this as directional.",         IS: "Lítið traust — takmörkuð merki; lestu þetta sem vísbendingu." },
};

export default function TrainingReadPanel({ lang = "EN" }: { lang?: "IS" | "EN" }) {
  const IS = lang === "IS";
  const [data, setData] = React.useState<Payload | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/coach/training-read", { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) setData((await res.json()) as Payload);
    } catch { /* supplementary — fail silent */ }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const setModel = async (model: GameModel) => {
    try {
      setSaving(true);
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      await fetch("/api/coach/training-read", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ game_model: model }),
      });
      await load();
    } finally { setSaving(false); }
  };

  // Close modal on Escape.
  React.useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  if (!data) return null;
  const tx = (o: { EN: string; IS: string }) => (IS ? o.IS : o.EN);
  const active = data.reads.find((r) => r.player_id === openId) ?? null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">{IS ? "Hvernig á að þróa hann" : "How to develop him"}</div>
          <div className="text-[11px] text-slate-500" title={IS ? "Reglur ákveða gæðin; orðalag er fast + vitnað — ekki AI. Þetta er þróunar-merki, ekki readiness-liturinn." : "Rules decide the qualities; phrasing is fixed + cited — not AI. A development signal, not the readiness colour."}>
            {IS ? "Þróunar-áhersla per leikmann · leikstíll × hvernig hann hreyfist" : "Per-player development emphasis · game model × how he moves"}
          </div>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
          {IS ? "Leikstíll" : "Game model"}:
          <select
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] disabled:opacity-50"
            value={data.gameModel}
            disabled={saving}
            onChange={(e) => setModel(e.target.value as GameModel)}
          >
            {GAME_MODELS.map((m) => <option key={m} value={m}>{tx(GAME_MODEL_LABEL[m])}</option>)}
          </select>
        </label>
      </div>

      {/* Explainability — layer 1 plain line always on; layer 2 detail behind a toggle. */}
      <p className="mt-2 text-[12px] leading-relaxed text-slate-600">
        {IS
          ? "Hvert kort er einn þróunar-forgangur fyrir leikmanninn: leikstíllinn þinn × hvernig hann hreyfist í raun. Ekki fitness-einkunn og ekki readiness-liturinn — heldur „á hverju á að leggja áherslu næst“."
          : "Each card is one development priority for the player: your game model × how he actually moves. Not a fitness score and not the readiness colour — it's “what to emphasise next”."}
      </p>
      <details className="group mt-1.5">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700">
          <span className="transition group-open:rotate-90">▸</span>
          {IS ? "Hvernig þetta er reiknað" : "How this is built"}
        </summary>
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-600">
          <p>
            <span className="font-semibold text-slate-700">{IS ? "Að lesa kortið." : "Reading the card."}</span>{" "}
            {IS
              ? "Fyrirsögnin er efsti forgangurinn hans. Traust-punkturinn — grænn / gulur / grár — segir hversu viss lesturinn er (þekja merkja × hversu þroskuð grunnlínan hans er). Smelltu á kortið fyrir allan raðaðan lista: „af hverju“, z-skorið sem sönnun, og heimildina."
              : "The headline is his top priority. The confidence dot — green / amber / grey — says how sure the read is (signal coverage × how mature his baseline is). Tap the card for the full ranked list: the “why”, the z-score as evidence, and the paper."}
          </p>
          <p>
            <span className="font-semibold text-slate-700">{IS ? "Hvernig forgangur er valinn." : "How priority is chosen."}</span>{" "}
            {IS
              ? "Reglur + fastur gæða-listi ákveða HVAÐA eiginleikar skipta máli fyrir stöðuna hans undir leikstílnum þínum. Síðan raðar squad-norm z-skorið hans (hversu mikið hann gerir af þeim eiginleika miðað við hópinn) þeim — það dregur fram hreyfi-undirskriftina hans: miðvörður les hátt í hemlun / lágt í spretti. Fastir vitnaðir textar orða þetta — ekkert AI í ákvörðuninni."
              : "Rules + a fixed quality catalogue decide WHICH qualities matter for his position under your game model. His squad-norm z-score (how much of that quality he does vs the squad) then ranks them — surfacing his movement signature: a centre-back reads high-braking / low-sprint. Fixed cited templates phrase it — no AI in the decision."}
          </p>
          <p>
            <span className="font-semibold text-slate-700">{IS ? "Leikstíllinn stýrir." : "The game model drives it."}</span>{" "}
            {IS
              ? "Skiptu um leikstíl efst (Háþrýstingur / Bolthald / Beint / Lág vörn / Jafnvægi) og forgangur allra leikmanna endurraðast — sami leikmaður fær aðra áherslu."
              : "Switch the model at the top (High press / Possession / Direct / Low block / Balanced) and every player's priorities re-rank — the same player gets a different emphasis."}
          </p>
          <p>
            <span className="font-semibold text-slate-700">{IS ? "Þegar merkið vantar." : "When a signal is missing."}</span>{" "}
            {IS
              ? "Eiginleiki sem gögnin þín sjá ekki (t.d. stefnubreytingar eða vinstri/hægri ósamhverfa þurfa IMA) fer í „ekki metanlegt á þínu þrepi“ með heiðarlegri nótu um hvað opnar hann — aldrei giskað."
              : "A quality your data tier can't see (e.g. change-of-direction or left/right asymmetry need IMA) goes to “not assessable at your tier” with an honest note on what unlocks it — never guessed."}
          </p>
          <p className="text-[10.5px] text-slate-400">
            {IS
              ? "Þróunar-merki, ekki readiness-dómurinn. Buchheit 2024 · Morin 2016 · Harper 2019 · McBurnie 2022."
              : "A development signal, not the readiness verdict. Buchheit 2024 · Morin 2016 · Harper 2019 · McBurnie 2022."}
          </p>
        </div>
      </details>

      {/* Card grid — verdict at a glance; tap a card for the full read. */}
      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {data.reads.map((r) => {
          const top = r.emphases[0];
          return (
            <button
              key={r.player_id}
              type="button"
              onClick={() => setOpenId(r.player_id)}
              className="group flex flex-col rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-left transition hover:border-slate-300 hover:bg-white hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800">{r.name.split(" ")[0]}</span>
                  {r.position ? <span className="ml-1.5 text-[10px] font-medium uppercase text-slate-400">{r.position}</span> : null}
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${CONF_TONE[r.confidence.level] ?? CONF_TONE.low}`}
                  title={IS ? `Þekja ${Math.round(r.confidence.coverage * 100)}% · ${r.confidence.baselineDays}-daga grunnlína` : `Coverage ${Math.round(r.confidence.coverage * 100)}% · ${r.confidence.baselineDays}-day baseline`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${CONF_DOT[r.confidence.level] ?? CONF_DOT.low}`} />
                  {r.confidence.level}
                </span>
              </div>
              <div className="mt-1.5 text-[13px] leading-snug text-slate-700">
                {top ? tx(top.headline) : (IS ? "Engin áhersla yfir þröskuldi" : "No emphasis above threshold")}
              </div>
              <div className="mt-auto pt-2 text-[10px] font-medium text-blue-600 opacity-0 transition group-hover:opacity-100">
                {IS ? "Sjá áherslur →" : "View details →"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Modal pop-up — the full per-player read. */}
      {active && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
          onClick={() => setOpenId(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-slate-900">{active.name.split(" ")[0]}</span>
                  {active.position ? <span className="text-[11px] font-medium uppercase text-slate-400">{active.position}</span> : null}
                  <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${CONF_TONE[active.confidence.level] ?? CONF_TONE.low}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${CONF_DOT[active.confidence.level] ?? CONF_DOT.low}`} />
                    {active.confidence.level}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {IS ? "Þróunar-áhersla" : "Development emphasis"} · {IS ? "þekja" : "coverage"} {Math.round(active.confidence.coverage * 100)}% · {active.confidence.baselineDays}-{IS ? "daga grunnlína" : "day baseline"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label={IS ? "Loka" : "Close"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {/* Reading — plain verdict + plain confidence, deterministic + cited. */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{IS ? "Lestur" : "Reading"}</div>
                <p className="mt-0.5 text-[13px] font-semibold text-slate-800">
                  {active.emphases.length === 0
                    ? (IS ? "Engin skýr þróunar-áhersla þessa lotu." : "No clear development priority stands out this cycle.")
                    : (IS ? `Efsti forgangur: ${tx(active.emphases[0].headline)}.` : `Top priority: ${tx(active.emphases[0].headline)}.`)
                      + (active.emphases.length > 1 ? (IS ? ` Svo ${active.emphases.length - 1} til viðbótar að neðan.` : ` Then ${active.emphases.length - 1} more below.`) : "")}
                </p>
                <p className="mt-1 text-[12px] text-slate-600">
                  {tx(CONF_PLAIN[active.confidence.level] ?? CONF_PLAIN.low)}
                </p>
                <p className="mt-1.5 text-[10px] text-slate-400">
                  {IS
                    ? "Reglur velja gæðin út frá leikstíl × hvernig hann hreyfist; fast, vitnað orðalag útskýrir — þróunar-merki, ekki readiness-dómurinn."
                    : "Rules pick the qualities from game model × how he moves; fixed, cited wording explains — a development signal, not the readiness verdict."}
                </p>
              </div>

              {active.emphases.length === 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-[12px] text-slate-500">
                  {IS ? "Engin áhersla yfir þröskuldi fyrir þennan leikmann." : "No emphasis above threshold for this player."}
                </div>
              )}
              {active.emphases.map((e, i) => (
                <div key={e.quality} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-[12px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-800">
                      <span className="mr-1.5 text-[10px] font-bold text-slate-400">{i + 1}</span>
                      {tx(e.headline)}
                    </span>
                    <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${CONF_TONE[e.confidence]}`}>{e.confidence}</span>
                  </div>
                  <p className="mt-1 text-slate-700">{tx(e.why)}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{IS ? "Merki" : "Evidence"}: {tx(e.evidence)}</p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {e.citation}{e.methodFamily ? ` · ${IS ? "aðferð" : "method"}: ${e.methodFamily}` : ""}
                  </p>
                </div>
              ))}
              {active.notAssessable.length > 0 && (
                <div className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5 text-[11px] text-amber-800">
                  <span className="font-semibold">{IS ? "Ekki metanlegt á þínu þrepi" : "Not assessable at your tier"}: </span>
                  {active.notAssessable.map((n) => tx(n.plain)).join(", ")}.
                  <span className="ml-1 text-amber-700/80">{tx(active.notAssessable[0].note)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
