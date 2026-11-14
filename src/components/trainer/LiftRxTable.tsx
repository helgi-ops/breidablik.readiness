"use client";

/**
 * Every training variable for the gym lifts in one block (lota 7): load, how hard, the speed of each rep, rest,
 * warm-up, when to add weight, how often, order, and "With a bar-speed device". Coach view shows where each number
 * comes from (the method's own studies, another study, or MicroPulse's guide); the player view keeps the four plain
 * lines and the device lines, without sources.
 *
 * Collapsed by default behind "All the details", so the short dose line stays the first read.
 */

import { useState } from "react";
import {
  RX_BAR_LABEL,
  RX_BAR_TITLE,
  RX_DETAILS_TOGGLE,
  RX_PLAYER_ROWS,
  RX_REFS,
  RX_ROW_LABEL,
  RX_ROW_ORDER,
  RX_SETS_LABEL,
  RX_SOURCE_LABEL,
  type LiftRx,
  type RxLine,
} from "@/lib/micropulse/goalPlan/liftRx";
import type { Bi } from "@/lib/micropulse/goalPlan/types";

type Lang = "IS" | "EN";

const SOURCE_STYLE: Record<RxLine["source"], string> = {
  plan_study: "bg-emerald-50 text-emerald-800",
  other_study: "bg-sky-50 text-sky-800",
  micropulse: "bg-slate-100 text-slate-600",
  session: "bg-indigo-50 text-indigo-800",
};

function Source({ line, lang }: { line: RxLine; lang: Lang }) {
  const L = (x: Bi) => (lang === "IS" ? x.is : x.en);
  const refs = (line.refs ?? []).map((k) => RX_REFS[k]?.short).filter(Boolean);
  return (
    <span className={`mt-0.5 inline-block rounded px-1 py-px text-[10px] ${SOURCE_STYLE[line.source]}`}>
      {L(RX_SOURCE_LABEL[line.source])}
      {refs.length ? `: ${refs.join(", ")}` : ""}
    </span>
  );
}

function Lift({ r, lang, player, bare }: { r: LiftRx; lang: Lang; player: boolean; bare: boolean }) {
  const L = (x: Bi) => (lang === "IS" ? x.is : x.en);
  const rows = (player ? RX_PLAYER_ROWS : RX_ROW_ORDER).filter((k) => r.rows[k]);
  const bar = player ? r.barSpeed.filter((x) => x.key !== "none") : r.barSpeed;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      {!bare && (
        <div className="text-[12px] font-semibold text-slate-900">
          {L(r.exercise)} <span className="font-normal text-slate-500">· {L(RX_SETS_LABEL)} {r.sets} × {r.reps}</span>
        </div>
      )}
      <dl className={`${bare ? "" : "mt-1 "}grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-[9rem_minmax(0,1fr)]`}>
        {rows.map((k) => (
          <div key={k} className="contents">
            <dt className="text-[11px] font-medium text-slate-500">{L(RX_ROW_LABEL[k])}</dt>
            <dd className="min-w-0 text-[11.5px] text-slate-800">
              {L(r.rows[k]!.text)}
              {!player && (
                <>
                  <br />
                  <Source line={r.rows[k]!} lang={lang} />
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {bar.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-1.5">
          <div className="text-[11px] font-semibold text-[#2740e6]">{L(RX_BAR_TITLE)}</div>
          <dl className="mt-0.5 grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-[9rem_minmax(0,1fr)]">
            {bar.map((x) => (
              <div key={x.key} className="contents">
                <dt className="text-[11px] font-medium text-slate-500">{L(RX_BAR_LABEL[x.key])}</dt>
                <dd className="min-w-0 text-[11.5px] text-slate-800">
                  {L(x.line.text)}
                  {!player && (
                    <>
                      <br />
                      <Source line={x.line} lang={lang} />
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/** "All the details" for one block's lifts; renders nothing for a block without lifts. `bare` drops the exercise +
 *  sets × reps header (the Today row already shows both, with the readiness cut). */
export function LiftRxDetails({ rx, lang, player = false, bare = false }: { rx: LiftRx[] | undefined; lang: Lang; player?: boolean; bare?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!rx?.length) return null;
  const L = (x: Bi) => (lang === "IS" ? x.is : x.en);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="text-[11px] font-semibold text-[#2740e6] underline-offset-2 hover:underline"
      >
        {L(RX_DETAILS_TOGGLE)} {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {rx.map((r, i) => (
            <Lift key={i} r={r} lang={lang} player={player} bare={bare} />
          ))}
        </div>
      )}
    </div>
  );
}
