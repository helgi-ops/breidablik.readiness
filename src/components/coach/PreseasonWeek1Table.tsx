"use client";

/**
 * Pre-season: week 1 → peak → light week, every variable as × a match beside the research range.
 *
 * The system proposes week 1 (preseasonRamp); the coach changes any variable in × a match and every pre-season
 * week is recomputed from it (saved as the variable's value: × a match × the team's match value). Explainability:
 * the columns are explained in plain words, every number carries a word mark against the research range
 * (within / above / below), and each variable says what it is and why it starts where it starts (the rules in
 * plannedVolume — KPI_REENTRY_FLOOR; a MicroPulse line, not a research number). Presentation only: no new rule.
 */

import * as React from "react";
import { CiteRefs } from "@/components/coach/CiteRefs";
import { kpiTmRefRange, kpiReentryFloor } from "@/lib/micropulse/periodization/plannedVolume";
import { PRESEASON_DEFAULT_WEEK1, PRESEASON_TAPER_RESEARCH } from "@/lib/micropulse/periodization/preseasonWindow";
import type { PreseasonWeekTarget } from "@/lib/micropulse/periodization/preseasonStart";
import { WEEKLY_LOAD_LABELS, type WeeklyLoadMetricKey } from "@/lib/micropulse/externalLoad/weeklyLoadTypes";

type Bi = { en: string; is: string };

/** What each variable is, and why it starts where it starts (plain words; the numbers come from the rules). */
const WHAT: Partial<Record<string, Bi>> = {
  totalDistance: { en: "All the running in the week. The aerobic base: built high and early.", is: "Öll hlaup vikunnar. Grunnþolið: byggt hátt og snemma." },
  velocityBand5: { en: "Fast running (HSR). The base for repeated fast runs: loaded early, but below distance.", is: "Hröð hlaup (HSR). Grunnur fyrir endurtekin hröð hlaup: hlaðið snemma, en undir vegalengd." },
  velocityBand6: { en: "Sprinting, the fastest running. A careful return.", is: "Sprettir, hraðasta hlaupið. Varfærin endurkoma." },
  accelB23: { en: "Hard speed-ups. Training is full of them from day one (small games, drills).", is: "Kröftugar hraðaaukningar. Æfingar eru fullar af þeim frá fyrsta degi (spil, æfingar)." },
  imaAccel: { en: "Hard speed-ups. Training is full of them from day one (small games, drills).", is: "Kröftugar hraðaaukningar. Æfingar eru fullar af þeim frá fyrsta degi (spil, æfingar)." },
  decelB23: { en: "Hard braking: the biggest strain on muscles and tendons, so it starts a little below speed-ups.", is: "Kröftug hemlun: mesta álagið á vöðva og sinar, svo hún byrjar aðeins undir hraðaaukningum." },
  imaDecel: { en: "Hard braking: the biggest strain on muscles and tendons, so it starts a little below speed-ups.", is: "Kröftug hemlun: mesta álagið á vöðva og sinar, svo hún byrjar aðeins undir hraðaaukningum." },
  imaCod: { en: "Hard changes of direction. High strain on tissue, so it starts with braking.", is: "Kröftugar stefnubreytingar. Mikið álag á vefi, svo þær byrja með hemlun." },
  imaTotal: { en: "All hard speed-ups, brakes and turns together.", is: "Allar kröftugar hraðaaukningar, hemlanir og beygjur saman." },
  imaStrideBand6: { en: "Strides in longer continuous runs (12–18 s). Aerobic running base, not fast running.", is: "Skref í lengri samfelldum hlaupum (12–18 s). Hlaupagrunnur, ekki hröð hlaup." },
  imaFrDistance: { en: "Distance in long runs (18 s or more). Aerobic running base, not fast running.", is: "Vegalengd í löngum hlaupum (18 s eða lengur). Hlaupagrunnur, ekki hröð hlaup." },
  totalPlayerLoad: { en: "The whole week's load in one number. It sets the overall week-1 line the other variables are measured against.", is: "Allt álag vikunnar í einni tölu. Það setur almennu viku-1 línuna sem hinar breyturnar miðast við." },
};

type Row = { k: string; lab: Bi; unit: string; w1: number | null; w1Raw: number | null; prop: number | null; mine: boolean; pk: number | null; lt: number | null; ref: [number, number] | null };

export default function PreseasonWeek1Table({ is, ramp, kpiKeys, proposal, matchKpi, week1Kpi, week1Mult, taperPct, setCount, onKpi, onWeek1Mult, onResetAll }: {
  is: boolean;
  /** The pre-season ramp the hub shows (week 1 … the light week). */
  ramp: PreseasonWeekTarget[];
  kpiKeys: WeeklyLoadMetricKey[];
  /** Week 1 with no coach values (the system's proposal). */
  proposal: PreseasonWeekTarget;
  /** One team match per variable (the × a match unit). */
  matchKpi: Record<string, number | undefined>;
  week1Kpi: Record<string, number>;
  week1Mult: number;
  taperPct: number;
  setCount: number;
  /** Save a variable's week-1 value (null = back to the proposal). */
  onKpi: (k: string, value: number | null) => void;
  onWeek1Mult: (x: number) => void;
  onResetAll: () => void;
}) {
  const t = (b: Bi) => (is ? b.is : b.en);
  const [why, setWhy] = React.useState(true);
  const fx = (n: number) => (is ? String(n).replace(".", ",") : String(n));
  const mvOf = (k: string) => { const mv = matchKpi[k]; return mv != null && mv > 0 ? mv : null; };
  const xm = (v: number | null | undefined, k: string) => { const mv = mvOf(k); return v != null && mv != null ? Math.round((v / mv) * 100) / 100 : null; };

  const last = ramp[ramp.length - 1];
  const lightW = last.taper ? last : null;
  const peakW = lightW && ramp.length >= 2 ? ramp[ramp.length - 2] : ramp.reduce((m, w) => ((w.multipleOfMatch ?? 0) > (m.multipleOfMatch ?? 0) ? w : m), ramp[0]);
  const peakNo = ramp.indexOf(peakW) + 1;

  const rows: Row[] = [
    ...kpiKeys.filter((k) => mvOf(k) != null && ramp[0].byKpi[k] != null).map((k) => ({
      k, lab: WEEKLY_LOAD_LABELS[k], unit: WEEKLY_LOAD_LABELS[k].unit,
      w1: xm(ramp[0].byKpi[k], k), w1Raw: ramp[0].byKpi[k] ?? null, prop: xm(proposal.byKpi[k], k), mine: week1Kpi[k] != null,
      pk: xm(peakW.byKpi[k], k), lt: lightW ? xm(lightW.byKpi[k], k) : null, ref: kpiTmRefRange(k),
    })),
    {
      k: "totalPlayerLoad", lab: { en: "Overall load (PlayerLoad)", is: "Heildarálag (PlayerLoad)" }, unit: "",
      w1: ramp[0].multipleOfMatch ?? null, w1Raw: null, prop: PRESEASON_DEFAULT_WEEK1, mine: week1Mult !== PRESEASON_DEFAULT_WEEK1,
      pk: peakW.multipleOfMatch ?? null, lt: lightW ? lightW.multipleOfMatch ?? null : null, ref: kpiTmRefRange("totalPlayerLoad"),
    },
  ];

  // Week 1 in × a match → the saved value: PlayerLoad = the overall multiple, a variable = × its match value.
  const commit = (k: string, x: number) => {
    if (k === "totalPlayerLoad") onWeek1Mult(Math.max(0.5, Math.min(3, Math.round(x * 100) / 100)));
    else onKpi(k, x * (mvOf(k) ?? 0));
  };
  const reset = (k: string) => (k === "totalPlayerLoad" ? onWeek1Mult(PRESEASON_DEFAULT_WEEK1) : onKpi(k, null));

  // Read against research — always a word, never a colour alone.
  const band = (x: number | null, ref: [number, number] | null) => {
    if (x == null || ref == null) return null;
    const k = x < ref[0] ? "below" : x > ref[1] ? "above" : "in";
    const txt = k === "in" ? t({ en: "within", is: "innan" }) : k === "above" ? t({ en: "above", is: "yfir" }) : t({ en: "below", is: "undir" });
    const cls = k === "in" ? "bg-[#1c7a4a]/10 text-[#1c7a4a]" : k === "above" ? "bg-[#de9328]/15 text-[#8a5a10]" : "bg-slate-100 text-slate-600";
    return <span className={`ml-1 rounded px-1 py-px text-[10px] font-semibold ${cls}`}>{txt}</span>;
  };
  const startRule = (k: string) => {
    if (k === "totalPlayerLoad") return t({ en: `Proposal ${fx(PRESEASON_DEFAULT_WEEK1)}× a match.`, is: `Tillaga ${fx(PRESEASON_DEFAULT_WEEK1)}× leik.` });
    const f = kpiReentryFloor(k);
    return f > 0
      ? t({ en: `Starts at no less than ${Math.round(f * 100)}% of the peak week.`, is: `Byrjar í minnst ${Math.round(f * 100)}% af toppvikunni.` })
      : t({ en: "Follows the overall week-1 line.", is: "Fylgir almennu viku-1 línunni." });
  };
  const th = "pr-3 font-medium align-bottom";

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-bold text-slate-800">{t({ en: "Week 1 → peak → light week, every variable", is: "Vika 1 → toppur → létt vika, hver breyta" })}</h3>
        <span className="text-[12px] text-slate-500">{setCount > 0 ? t({ en: `${setCount} set by you · the rest is the system's proposal`, is: `${setCount} stillt af þér · restin tillaga kerfisins` }) : t({ en: "the system's proposal", is: "tillaga kerfisins" })}</span>
      </div>
      <p className="mt-0.5 text-[12px] text-slate-600">{t({ en: "The system proposes week 1. Change any variable in × a match; every pre-season week is recomputed from week 1.", is: "Kerfið leggur til viku 1. Breyttu hvaða breytu sem er í × leik; allar vikur undirbúningsins reiknast upp á nýtt út frá viku 1." })}</p>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[12px] tabular-nums">
          <thead className="text-[11px] text-slate-500">
            <tr>
              <th className={`py-1 ${th}`}>{t({ en: "Variable (× a match)", is: "Breyta (× leikur)" })}</th>
              <th className={th}>{t({ en: "Week 1 (yours to change)", is: "Vika 1 (þú breytir)" })}</th>
              <th className={th}>{t({ en: `Week ${peakNo} (peak)`, is: `Vika ${peakNo} (toppur)` })}</th>
              {lightW && <th className={th}>{t({ en: `Week ${ramp.length} (light)`, is: `Vika ${ramp.length} (létt)` })}</th>}
              <th className="font-medium align-bottom">{t({ en: "Research (training:match)", is: "Rannsóknir (æfing:leikur)" })}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k} className={`border-t border-slate-200 align-top ${r.k === "totalPlayerLoad" ? "bg-slate-50/70" : ""}`}>
                <td className="py-1.5 pr-3 font-medium text-slate-800">{t(r.lab)}{r.mine && <span title={t({ en: "your value", is: "þitt gildi" })} className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[#2740e6] align-middle" />}</td>
                <td className="py-1.5 pr-3">
                  <div className="flex items-center gap-1">
                    {/* Commit on blur / Enter — saving on every key would fight the decimal point. */}
                    <input key={`${r.k}:${r.w1 ?? ""}`} type="number" step={0.05} min={0} defaultValue={r.w1 ?? ""} aria-label={`${t(r.lab)} — ${t({ en: "week 1", is: "vika 1" })}`}
                      onBlur={(e) => { const x = Number(e.target.value.replace(",", ".")); if (Number.isFinite(x) && x > 0 && x !== r.w1) commit(r.k, x); }}
                      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                      className="h-7 w-[4.5rem] rounded border border-slate-300 bg-white px-1.5 tabular-nums" />
                    <span className="text-slate-400">×</span>{band(r.w1, r.ref)}
                  </div>
                  <div className="mt-0.5 text-[10.5px] text-slate-400">
                    {r.w1Raw != null && <>{r.w1Raw.toLocaleString("en-US")}{r.unit} · </>}
                    {r.mine
                      ? <>{t({ en: "your value", is: "þitt gildi" })}{r.prop != null && <> · {t({ en: "proposal", is: "tillaga" })} {fx(r.prop)}× · <button type="button" onClick={() => reset(r.k)} className="font-medium text-[#2740e6] hover:underline">{t({ en: "back to proposal", is: "aftur í tillögu" })}</button></>}</>
                      : t({ en: "system proposal", is: "tillaga kerfisins" })}
                  </div>
                </td>
                <td className="py-1.5 pr-3"><span className="font-semibold text-slate-900">{r.pk != null ? `${fx(r.pk)}×` : "–"}</span>{band(r.pk, r.ref)}</td>
                {lightW && <td className="py-1.5 pr-3"><span className="font-semibold text-slate-900">{r.lt != null ? `${fx(r.lt)}×` : "–"}</span>{band(r.lt, r.ref)}</td>}
                <td className="py-1.5 text-slate-600">{r.ref ? `${fx(r.ref[0])}–${fx(r.ref[1])}×` : t({ en: "no reference", is: "engin viðmið" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* What the columns mean + how to read the marks — visible, no click. */}
      <ul className="mt-2 space-y-0.5 text-[11.5px] text-slate-600">
        <li><b className="font-semibold text-slate-700">{t({ en: "× a match", is: "× leikur" })}</b> — {t({ en: "the week's total divided by one team match in the same variable. 2× = twice what one match gives.", is: "vikan samanlagt deilt með einum leik liðsins í sömu breytu. 2× = tvöfalt það sem einn leikur gefur." })}</li>
        <li><b className="font-semibold text-slate-700">{t({ en: "Week 1", is: "Vika 1" })}</b> — {t({ en: "a controlled return after the break, below a normal week. Where each variable starts is a MicroPulse line, not a research number.", is: "stýrð endurkoma eftir fríið, undir venjulegri viku. Hvar hver breyta byrjar er lína MicroPulse, ekki rannsóknartala." })}</li>
        <li><b className="font-semibold text-slate-700">{t({ en: "Peak", is: "Toppur" })}</b> — {t({ en: "the heaviest pre-season week. It may sit above the research range: pre-season builds capacity without competitive games.", is: "þyngsta vika undirbúningsins. Hún má vera yfir rannsóknabilinu: undirbúningur byggir upp þol án keppnisleikja." })}</li>
        {lightW && <li><b className="font-semibold text-slate-700">{t({ en: "Light week", is: "Létt vika" })}</b> — {t({
          en: `the peak week −${taperPct}% ("Light last week −%" above). Every variable drops by the same share and keeps its own weight. Research: a ${PRESEASON_TAPER_RESEARCH[0]}–${PRESEASON_TAPER_RESEARCH[1]}% cut in volume, intensity kept.`,
          is: `toppvikan −${taperPct}% („Létt lokavika −%“ hér að ofan). Hver breyta lækkar um sama hlutfall og heldur sínu vægi. Rannsóknir: ${PRESEASON_TAPER_RESEARCH[0]}–${PRESEASON_TAPER_RESEARCH[1]}% lækkun á magni, ákefð haldið.`,
        })}</li>}
        <li><b className="font-semibold text-slate-700">{t({ en: "Research", is: "Rannsóknir" })}</b> — {t({ en: "training:match in a normal in-season training week. The mark shows where each number lands: ", is: "æfing:leikur í venjulegri æfingaviku á keppnistímabili. Merkið sýnir hvar talan lendir: " })}
          <b className="text-[#1c7a4a]">{t({ en: "within", is: "innan" })}</b> {t({ en: "the range,", is: "bilsins," })} <b className="text-[#8a5a10]">{t({ en: "above", is: "yfir" })}</b> {t({ en: "(on purpose in the peak week),", is: "(viljandi í toppviku)," })} <b className="text-slate-600">{t({ en: "below", is: "undir" })}</b> {t({ en: "(on purpose in week 1).", is: "(viljandi í viku 1)." })}</li>
      </ul>

      {/* What each variable is, and why it starts where it starts. */}
      <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} className="mt-2 text-[12px] font-semibold text-[#2740e6] hover:underline">
        {why ? t({ en: "Hide what each variable is", is: "Fela útskýringar á breytunum" }) : t({ en: "Show what each variable is", is: "Sýna útskýringar á breytunum" })}
      </button>
      {why && (
        <dl className="mt-1 grid gap-x-4 gap-y-1 text-[11.5px] text-slate-600 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.k} className="min-w-0">
              <dt className="inline font-semibold text-slate-700">{t(r.lab)}: </dt>
              <dd className="inline">{WHAT[r.k] ? t(WHAT[r.k]!) : ""} {startRule(r.k)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-1.5 text-[10.5px] text-slate-500">
        <CiteRefs text="Clemente 2019c; Gualtieri 2023; Bosquet 2007; Mujika & Padilla 2003; Jeong 2011; Teixeira 2021; Harper 2022" is={is} />
        {Object.keys(week1Kpi).length > 0 && <> · <button type="button" onClick={onResetAll} className="font-medium text-slate-600 hover:underline">{t({ en: "All back to the proposal", is: "Allt aftur í tillögu" })}</button></>}
      </div>
    </div>
  );
}
