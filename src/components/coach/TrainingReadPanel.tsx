"use client";

/**
 * TrainingReadPanel — "How to develop him" (docs/train-like-you-play-individual.md).
 *
 * Per-player ranked development emphases from /api/coach/training-read: headline +
 * 2-3 emphases (expand to why + evidence + citation), a "not assessable at your
 * tier" note, and a confidence chip. Plus a tiny game-model selector. Rules decide
 * the qualities; the phrasing is fixed cited templates (no AI). A distinct labelled
 * development signal — never the readiness colour. Explainability-first: one line
 * on top, jargon in tooltips, confidence shown, every emphasis cited.
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

export default function TrainingReadPanel({ lang = "EN" }: { lang?: "IS" | "EN" }) {
  const IS = lang === "IS";
  const [data, setData] = React.useState<Payload | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
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

  if (!data) return null;
  const tx = (o: { EN: string; IS: string }) => (IS ? o.IS : o.EN);

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

      <ul className="mt-3 divide-y divide-slate-100">
        {data.reads.map((r) => {
          const top = r.emphases[0];
          const open = expanded === r.player_id;
          return (
            <li key={r.player_id} className="py-2">
              <button type="button" onClick={() => setExpanded(open ? null : r.player_id)} className="flex w-full items-baseline justify-between gap-2 text-left">
                <span className="min-w-0">
                  <span className="text-[11px] text-slate-400">{open ? "▾" : "▸"} </span>
                  <span className="font-medium text-slate-800">{r.name.split(" ")[0]}</span>
                  {r.position ? <span className="ml-1 text-[10px] text-slate-400">{r.position}</span> : null}
                  <span className="ml-2 text-[12px] text-slate-600">{top ? tx(top.headline) : (IS ? "Engin áhersla yfir þröskuldi" : "No emphasis above threshold")}</span>
                </span>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${CONF_TONE[r.confidence.level] ?? CONF_TONE.low}`}
                  title={IS ? `Þekja ${Math.round(r.confidence.coverage * 100)}% · ${r.confidence.baselineDays}-daga grunnlína` : `Coverage ${Math.round(r.confidence.coverage * 100)}% · ${r.confidence.baselineDays}-day baseline`}>
                  {r.confidence.level}
                </span>
              </button>

              {open && (
                <div className="mt-2 space-y-2 pl-4">
                  {r.emphases.map((e) => (
                    <div key={e.quality} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px]">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-slate-800">{tx(e.headline)}</span>
                        <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${CONF_TONE[e.confidence]}`}>{e.confidence}</span>
                      </div>
                      <p className="mt-0.5 text-slate-700">{tx(e.why)}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{IS ? "Merki" : "Evidence"}: {tx(e.evidence)}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {e.citation}{e.methodFamily ? ` · ${IS ? "aðferð" : "method"}: ${e.methodFamily}` : ""}
                      </p>
                    </div>
                  ))}
                  {r.notAssessable.length > 0 && (
                    <div className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800">
                      <span className="font-semibold">{IS ? "Ekki metanlegt á þínu þrepi" : "Not assessable at your tier"}: </span>
                      {r.notAssessable.map((n) => tx(n.plain)).join(", ")}.
                      <span className="ml-1 text-amber-700/80">{tx(r.notAssessable[0].note)}</span>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
