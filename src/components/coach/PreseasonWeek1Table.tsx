"use client";

/**
 * Pre-season: week 1 → peak → light week, every variable as × a match beside the research range.
 *
 * The system proposes week 1 (preseasonRamp); the coach changes any variable in × a match and that variable's
 * whole ramp — peak and light week included — moves by the same share (saved as the variable's value: × a match
 * × the team's match value). Explainability:
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
  totalPlayerLoad: { en: "The whole week's load in one number. Changing it moves every variable you haven't set yourself by the same share.", is: "Allt álag vikunnar í einni tölu. Ef þú breytir því færast allar breytur sem þú hefur ekki stillt sjálfur um sama hlutfall." },
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
  const [why, setWhy] = React.useState(false);
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

  // Grouped by what the variable loads, in plain names (explainability: no GPS jargon in the primary view).
  const GROUP_OF: Record<string, "run" | "speed" | "tissue"> = {
    totalDistance: "run", imaFrDistance: "run", imaStrideBand6: "run",
    velocityBand5: "speed", velocityBand6: "speed",
    accelB23: "tissue", imaAccel: "tissue", decelB23: "tissue", imaDecel: "tissue", imaCod: "tissue", imaTotal: "tissue",
  };
  const GROUPS: Array<{ key: "run" | "speed" | "tissue" | "other"; title: Bi; sub: Bi }> = [
    { key: "run", title: { en: "Running volume", is: "Hlaupamagn" }, sub: { en: "the aerobic base — built high and early", is: "grunnþolið — byggt hátt og snemma" } },
    { key: "speed", title: { en: "Speed", is: "Hraði" }, sub: { en: "fast running — a careful return", is: "hröð hlaup — varfærin endurkoma" } },
    { key: "tissue", title: { en: "Muscle & tendon", is: "Vöðvar & sinar" }, sub: { en: "speed-ups, braking, turns — the biggest strain", is: "hraðaaukningar, hemlun, beygjur — mesta álagið" } },
    { key: "other", title: { en: "Other", is: "Annað" }, sub: { en: "", is: "" } },
  ];
  const PLAIN: Partial<Record<string, Bi>> = {
    totalDistance: { en: "Total distance", is: "Heildarvegalengd" },
    imaFrDistance: { en: "Long runs at match pace", is: "Löng hlaup á leikhraða" },
    imaStrideBand6: { en: "Long-run strides", is: "Skref í löngum hlaupum" },
    velocityBand5: { en: "High-speed running", is: "Háhraðahlaup" },
    velocityBand6: { en: "Sprint", is: "Sprettir" },
    accelB23: { en: "Hard speed-ups", is: "Kröftugar hraðaaukningar" }, imaAccel: { en: "Hard speed-ups", is: "Kröftugar hraðaaukningar" },
    decelB23: { en: "Hard braking", is: "Kröftug hemlun" }, imaDecel: { en: "Hard braking", is: "Kröftug hemlun" },
    imaCod: { en: "Changes of direction", is: "Stefnubreytingar" },
    imaTotal: { en: "All hard actions", is: "Allar kröftugar aðgerðir" },
  };
  const used = new Set<string>();
  const nameOf = (r: Row): string => {
    const plain = PLAIN[r.k] ? t(PLAIN[r.k]!) : null;
    const n = plain && !used.has(plain) ? plain : t(r.lab); // two sources of one action keep their own label
    used.add(n); return n;
  };
  const master = rows.find((r) => r.k === "totalPlayerLoad")!;
  const kpiRows = rows.filter((r) => r.k !== "totalPlayerLoad").map((r) => ({ ...r, name: nameOf(r) }));

  // The scale every track shares: 0× → the largest number on the page (at least 4×), so rows compare.
  const scaleMax = Math.max(4, Math.ceil(Math.max(...rows.flatMap((r) => [r.w1 ?? 0, r.pk ?? 0, r.lt ?? 0, r.ref?.[1] ?? 0]))));
  const pos = (x: number) => `${Math.max(0, Math.min(100, (x / scaleMax) * 100))}%`;
  const ticks = Array.from({ length: scaleMax + 1 }, (_, i) => i);

  // Read against research — always a word, never a colour alone.
  const band = (x: number | null, ref: [number, number] | null) => {
    if (x == null) return null;
    if (ref == null) return <span className="text-[10px] text-slate-500">{t({ en: "no reference", is: "engin viðmið" })}</span>;
    const k = x < ref[0] ? "below" : x > ref[1] ? "above" : "in";
    const txt = k === "in" ? t({ en: "within", is: "innan" }) : k === "above" ? t({ en: "above", is: "yfir" }) : t({ en: "below", is: "undir" });
    const cls = k === "in" ? "bg-[#1c7a4a]/12 text-[#15603a]" : k === "above" ? "bg-[#de9328]/16 text-[#7a4a06]" : "bg-[#eeece6] text-slate-600";
    return <span className={`rounded px-1.5 py-px text-[10px] font-semibold ${cls}`}>{txt}</span>;
  };
  const startRule = (k: string) => {
    if (k === "totalPlayerLoad") return t({ en: `Proposal ${fx(PRESEASON_DEFAULT_WEEK1)}× a match.`, is: `Tillaga ${fx(PRESEASON_DEFAULT_WEEK1)}× leik.` });
    const f = kpiReentryFloor(k);
    return f > 0
      ? t({ en: `Starts at no less than ${Math.round(f * 100)}% of the peak week.`, is: `Byrjar í minnst ${Math.round(f * 100)}% af toppvikunni.` })
      : t({ en: "Follows the overall week-1 line.", is: "Fylgir almennu viku-1 línunni." });
  };

  const cols = "grid grid-cols-1 items-center gap-3 md:grid-cols-[minmax(180px,1.3fr)_190px_minmax(220px,2fr)_150px] md:gap-5";

  // Week 1 → peak on the shared scale: research range shaded, the build as a bar, the three weeks as marks.
  const track = (r: Row) => {
    const lo = Math.min(r.w1 ?? 0, r.pk ?? 0), hi = Math.max(r.w1 ?? 0, r.pk ?? 0);
    return (
      <div className="relative h-10" role="img" aria-label={`${t({ en: "Week 1", is: "Vika 1" })} ${r.w1 != null ? fx(r.w1) : "–"}×, ${t({ en: "peak", is: "toppur" })} ${r.pk != null ? fx(r.pk) : "–"}×${lightW ? `, ${t({ en: "light week", is: "létt vika" })} ${r.lt != null ? fx(r.lt) : "–"}×` : ""}${r.ref ? `; ${t({ en: "research", is: "rannsóknir" })} ${fx(r.ref[0])}–${fx(r.ref[1])}×` : ""}`}>
        <div className="absolute inset-x-0 top-[17px] h-1.5 rounded-full bg-[#ece9e2]" />
        {r.ref && <div className="absolute top-2 h-6 rounded-md bg-[#1c7a4a]/[0.14]" style={{ left: pos(r.ref[0]), width: `calc(${pos(r.ref[1])} - ${pos(r.ref[0])})` }} />}
        {r.w1 != null && r.pk != null && <div className="absolute top-[17px] h-1.5 rounded-full bg-[#2740e6]/35" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />}
        {lightW && r.lt != null && <div className="absolute top-[30px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-[#8a919c]" style={{ left: pos(r.lt) }} />}
        {r.w1 != null && <div className="absolute top-[13px] h-3.5 w-3.5 -translate-x-1/2 rounded-full border-[3px] border-[#2740e6] bg-white" style={{ left: pos(r.w1) }} />}
        {r.pk != null && <div className="absolute top-[13px] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-[#2740e6] ring-2 ring-white" style={{ left: pos(r.pk) }} />}
      </div>
    );
  };
  const nums = (r: Row) => (
    <div className="flex flex-col gap-1 text-[12px] text-slate-600">
      <span>{t({ en: "Peak", is: "Toppur" })} <b className="text-[14px] tabular-nums text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{r.pk != null ? `${fx(r.pk)}×` : "–"}</b> {band(r.pk, r.ref)}</span>
      {lightW && <span>{t({ en: "Light", is: "Létt" })} <b className="text-[14px] tabular-nums text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{r.lt != null ? `${fx(r.lt)}×` : "–"}</b> {band(r.lt, r.ref)}</span>}
    </div>
  );
  // − [typed value] + : 0.05× a step; typing still works (Week1Input).
  const stepper = (r: Row, name: string, big = false) => {
    const step = (dir: 1 | -1) => { if (r.w1 == null) return; commit(r.k, Math.max(0.05, Math.round((r.w1 + dir * 0.05) * 100) / 100)); };
    return (
      <div className={`flex items-center overflow-hidden rounded-[10px] border bg-white ${big || r.mine ? "border-[#2740e6]" : "border-[#d9d5cc]"} ${big ? "h-11" : "h-10"}`}>
        <button type="button" onClick={() => step(-1)} aria-label={`${name} — ${t({ en: "week 1 down", is: "vika 1 niður" })}`} className="h-full w-10 shrink-0 text-[17px] text-[#2740e6] hover:bg-[#2740e6]/5">−</button>
        <Week1Input value={r.w1} label={`${name} — ${t({ en: "week 1", is: "vika 1" })}`} onCommit={(x) => commit(r.k, x)} big={big} />
        <span className={`pr-1 font-bold text-[#14181c] ${big ? "text-[18px]" : "text-[16px]"}`} style={{ fontFamily: "var(--font-archivo, inherit)" }}>×</span>
        <button type="button" onClick={() => step(1)} aria-label={`${name} — ${t({ en: "week 1 up", is: "vika 1 upp" })}`} className="h-full w-10 shrink-0 text-[17px] text-[#2740e6] hover:bg-[#2740e6]/5">+</button>
      </div>
    );
  };
  const sub = (r: Row) => (
    <span className="text-[11px] text-slate-600">
      {r.w1Raw != null && <>{r.w1Raw.toLocaleString("en-US")}{r.unit}</>}
      {r.mine
        ? <>{r.w1Raw != null && " · "}{r.prop != null && <button type="button" onClick={() => reset(r.k)} className="font-semibold text-[#2740e6] underline">{t({ en: "proposal", is: "tillaga" })} {fx(r.prop)}×</button>}</>
        : <>{r.w1Raw != null && " · "}{t({ en: "system proposal", is: "tillaga kerfisins" })}</>}
    </span>
  );
  const yours = <span className="rounded-full bg-[#2740e6]/[0.08] px-1.5 py-0.5 text-[10px] font-semibold text-[#2740e6]">{t({ en: "yours", is: "þitt" })}</span>;
  const changed = setCount + (week1Mult !== PRESEASON_DEFAULT_WEEK1 ? 1 : 0);

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-[#e3e0d8] bg-white">
      {/* Verdict + how it works */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#ece9e2] px-5 pb-5 pt-5 sm:px-6">
        <div className="flex min-w-0 max-w-[680px] flex-col gap-1.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#2740e6]">{t({ en: "Load per variable", is: "Álag á hverja breytu" })}</span>
          <h3 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{t({ en: "Set week 1 — the whole ramp follows", is: "Stilltu viku 1 — allur rampurinn fylgir" })}</h3>
          <p className="text-[14px] leading-relaxed text-slate-600">{t({ en: "Every number is ", is: "Hver tala er " })}<b className="text-[#14181c]">{t({ en: "× a match", is: "× leikur" })}</b>{t({ en: ": the week's total ÷ one team match in that variable. Change week 1 and the peak and light week move by the same share.", is: ": vikan samanlagt ÷ einn leikur liðsins í þeirri breytu. Breyttu viku 1 og toppurinn og létta vikan færast um sama hlutfall." })}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`inline-flex h-7 items-center rounded-full px-3 text-[12px] font-semibold ${changed > 0 ? "bg-[#2740e6]/[0.08] text-[#2740e6]" : "bg-[#f1efe9] text-slate-600"}`}>
            {changed > 0 ? t({ en: `${changed} set by you · the rest follows the proposal`, is: `${changed} stillt af þér · restin fylgir tillögunni` }) : t({ en: "The system's proposal", is: "Tillaga kerfisins" })}
          </span>
          {changed > 0 && <button type="button" onClick={() => { onResetAll(); if (week1Mult !== PRESEASON_DEFAULT_WEEK1) onWeek1Mult(PRESEASON_DEFAULT_WEEK1); }} className="h-9 rounded-lg border border-[#d9d5cc] bg-white px-3 text-[13px] font-medium text-[#14181c] hover:bg-slate-50">{t({ en: "All back to the proposal", is: "Allt aftur í tillögu" })}</button>}
        </div>
      </div>

      {/* Master: the overall load moves every variable the coach hasn't set */}
      <div className={`${cols} border-b border-[#ece9e2] bg-[#f8f7f3] px-5 py-5 sm:px-6`}>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[16px] font-bold text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{t({ en: "Overall load", is: "Heildarálag" })}{master.mine && yours}</span>
          <span className="text-[12px] leading-snug text-slate-600">{t({ en: "The whole week in one number (PlayerLoad). Moves every variable you haven't set yourself.", is: "Öll vikan í einni tölu (PlayerLoad). Færir allar breytur sem þú hefur ekki stillt sjálfur." })}</span>
        </div>
        <div className="flex flex-col gap-1">{stepper(master, t({ en: "Overall load", is: "Heildarálag" }), true)}{sub(master)}</div>
        {track(master)}
        {nums(master)}
      </div>

      {/* Legend + the shared scale */}
      <div className="hidden px-5 pt-3.5 sm:px-6 md:block">
        <div className={`${cols} items-end text-[11px] text-slate-600`}>
          <span>{t({ en: "Variable", is: "Breyta" })}</span>
          <span>{t({ en: "Week 1 · yours to change", is: "Vika 1 · þú breytir" })}</span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-[18px] rounded-[3px] bg-[#1c7a4a]/[0.18]" />{t({ en: "Research range", is: "Rannsóknabil" })}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-[#2740e6] bg-white" />{t({ en: "Week 1", is: "Vika 1" })}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#2740e6]" />{t({ en: `Peak · wk ${peakNo}`, is: `Toppur · v ${peakNo}` })}</span>
            {lightW && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 bg-[#8a919c]" />{t({ en: `Light · wk ${ramp.length}`, is: `Létt · v ${ramp.length}` })}</span>}
          </div>
          <span>{t({ en: "vs research", is: "miðað við rannsóknir" })}</span>
        </div>
        <div className={`${cols} mt-1 font-mono text-[10px] text-slate-500`}>
          <span /><span />
          <div className="flex justify-between">{ticks.map((i) => <span key={i}>{i}×</span>)}</div>
          <span />
        </div>
      </div>

      {/* Groups */}
      {GROUPS.map((g) => {
        const gr = kpiRows.filter((r) => (GROUP_OF[r.k] ?? "other") === g.key);
        if (!gr.length) return null;
        return (
          <div key={g.key} className="px-5 pt-2 sm:px-6">
            <div className="flex flex-wrap items-baseline gap-2.5 border-b border-[#ece9e2] pb-1.5 pt-3.5">
              <span className="text-[13px] font-bold uppercase tracking-[0.02em] text-[#14181c]" style={{ fontFamily: "var(--font-archivo, inherit)" }}>{t(g.title)}</span>
              {g.sub.en && <span className="text-[12px] text-slate-600">{t(g.sub)}</span>}
            </div>
            {gr.map((r) => (
              <div key={r.k} className={`${cols} border-b border-[#f1efe9] py-3 last:border-b-0`}>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold text-[#14181c]">{r.name}{r.mine && yours}</span>
                  {WHAT[r.k] && <span className="text-[12px] leading-snug text-slate-600">{t(WHAT[r.k]!)}</span>}
                </div>
                <div className="flex flex-col gap-1">{stepper(r, r.name)}{sub(r)}</div>
                {track(r)}
                {nums(r)}
              </div>
            ))}
          </div>
        );
      })}

      {/* The plain why stays visible; the column definitions, start rules and sources sit behind the toggle. */}
      <div className="mt-3 border-t border-[#ece9e2] bg-[#f8f7f3] px-5 pb-5 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[760px] text-[12px] leading-relaxed text-slate-600">{t({ en: "Week 1 sits low on purpose (a controlled return); the peak may sit above the range on purpose (pre-season builds capacity without league games). Research = training:match in a normal in-season week.", is: "Vika 1 er lág viljandi (stýrð endurkoma); toppurinn má vera yfir bilinu viljandi (undirbúningur byggir upp þol án deildarleikja). Rannsóknir = æfing:leikur í venjulegri viku á keppnistímabili." })}</p>
          <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} className="h-9 rounded-lg px-3 text-[13px] font-semibold text-[#2740e6] hover:bg-[#2740e6]/5">
            {why ? t({ en: "Hide details & sources", is: "Fela nánar & heimildir" }) : t({ en: "Show details & sources", is: "Sýna nánar & heimildir" })}
          </button>
        </div>
        {why && (
          <div className="mt-3 space-y-3 text-[11.5px] text-slate-600">
            <ul className="space-y-0.5">
              <li><b className="font-semibold text-slate-700">{t({ en: "Week 1", is: "Vika 1" })}</b> — {t({ en: "a controlled return after the break, below a normal week. Where each variable starts is a MicroPulse line, not a research number.", is: "stýrð endurkoma eftir fríið, undir venjulegri viku. Hvar hver breyta byrjar er lína MicroPulse, ekki rannsóknartala." })}</li>
              <li><b className="font-semibold text-slate-700">{t({ en: "Peak", is: "Toppur" })}</b> — {t({ en: "the heaviest pre-season week. It moves with week 1 by the same share.", is: "þyngsta vika undirbúningsins. Hún færist með viku 1 um sama hlutfall." })}</li>
              {lightW && <li><b className="font-semibold text-slate-700">{t({ en: "Light week", is: "Létt vika" })}</b> — {t({
                en: `the peak week −${taperPct}% ("Light last week" above). Every variable drops by the same share and keeps its own weight. Research: a ${PRESEASON_TAPER_RESEARCH[0]}–${PRESEASON_TAPER_RESEARCH[1]}% cut in volume, intensity kept.`,
                is: `toppvikan −${taperPct}% („Létt lokavika“ hér að ofan). Hver breyta lækkar um sama hlutfall og heldur sínu vægi. Rannsóknir: ${PRESEASON_TAPER_RESEARCH[0]}–${PRESEASON_TAPER_RESEARCH[1]}% lækkun á magni, ákefð haldið.`,
              })}</li>}
            </ul>
            <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {[master, ...kpiRows].map((r) => (
                <div key={r.k} className="min-w-0">
                  <dt className="inline font-semibold text-slate-700">{t(r.lab)}: </dt>
                  <dd className="inline">{startRule(r.k)}{r.ref ? ` ${t({ en: "Research", is: "Rannsóknir" })} ${fx(r.ref[0])}–${fx(r.ref[1])}×.` : ""}</dd>
                </div>
              ))}
            </dl>
            <div className="text-[10.5px] text-slate-500">
              <CiteRefs text="Clemente 2019c; Gualtieri 2023; Bosquet 2007; Mujika & Padilla 2003; Jeong 2011; Teixeira 2021; Harper 2022; PMC6747517" is={is} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Week-1 input: arrows and typing re-flow the plan ~0.4 s after the last change, Enter / leaving the box at once.
// While the coach types, the box shows what they typed; otherwise it follows the plan's value (reset, draft reload).
function Week1Input({ value, label, onCommit, big = false }: { value: number | null; label: string; onCommit: (x: number) => void; big?: boolean }) {
  const [txt, setTxt] = React.useState("");
  const [editing, setEditing] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const fire = (v: string) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const x = Number(v.replace(",", "."));
    if (v.trim() !== "" && Number.isFinite(x) && x > 0 && x !== value) onCommit(x);
  };
  return (
    <input type="number" step={0.05} min={0} aria-label={label}
      value={editing ? txt : (value ?? "")}
      onFocus={() => { setTxt(value == null ? "" : String(value)); setEditing(true); }}
      onChange={(e) => {
        const v = e.target.value; setTxt(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => fire(v), 400);
      }}
      onBlur={() => { fire(txt); setEditing(false); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className={`h-full min-w-0 flex-1 border-0 bg-transparent px-0 text-right font-bold tabular-nums text-[#14181c] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${big ? "text-[18px]" : "text-[16px]"}`} style={{ fontFamily: "var(--font-archivo, inherit)" }} />
  );
}
