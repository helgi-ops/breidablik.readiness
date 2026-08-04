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
