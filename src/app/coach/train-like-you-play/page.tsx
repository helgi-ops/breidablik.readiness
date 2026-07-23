"use client";

export const dynamic = "force-dynamic";

/**
 * Train like you Play — preparedness board. For each player, the best training
 * exposure to each match demand vs that player's own match demand, so the coach
 * sees who isn't trained for what matches require (Gabbett 2016; Malone 2018).
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import { POSITION_GROUPS } from "@/lib/micropulse/positionStyle";
import VerdictBanner, { type VerdictDriver, type VerdictTone } from "@/components/coach/VerdictBanner";
import TlypTrainingFocus, { type FocusGroup } from "@/components/coach/TlypTrainingFocus";
import TrainingReadPanel from "@/components/coach/TrainingReadPanel";

type MetricKey =
  | "top_speed" | "fmp_run_high" | "fmp_dyn_high" | "fmp_dyn_med"
  | "ima_accel" | "ima_decel" | "ima_cod" | "ima_jumps"
  | "decel_eff" | "sprint_eff" | "hsr_dist"
  | "player_load" | "pl_per_min";
type Mode = "fmp" | "ima" | "core";
type Baseline = "own" | "position";
type Flag = "under" | "gap" | "ok" | "none";
type Cell = { match: number | null; train: number | null; pct: number | null; flag: Flag };
type Player = { id: string; name: string; position: string | null; group: string; match_appearances: number; train_sessions: number; metrics: Record<MetricKey, Cell>; gaps: number };
type MicroCohort = { sessions: number; metrics: Record<MetricKey, number | null> };
type Micro = { md_day: string; sessions: number; metrics: Record<MetricKey, number | null>; cohorts?: { recovery?: MicroCohort; topup?: MicroCohort } };
type MicroWindow = "season" | "month" | "week";
type Resp = { season: number; metrics: Array<{ key: MetricKey; kind: string }>; modes: Record<Mode, MetricKey[]>; players: Player[]; microcycle?: Micro[]; microcycleByWindow?: Record<MicroWindow, Micro[]>; microWindowRef?: string; groupDemand: Record<string, Record<MetricKey, number | null>> };

const FLAG: Record<string, string> = {
  under: "bg-red-100 text-red-700", gap: "bg-amber-100 text-amber-700", ok: "bg-emerald-100 text-emerald-700", none: "bg-slate-100 text-slate-400",
};
function flagOf(kind: string | undefined, pct: number | null): Flag {
  if (pct == null) return "none";
  if (kind === "max") return pct < 70 ? "under" : pct < 85 ? "gap" : "ok";
  return pct < 50 ? "under" : pct < 80 ? "gap" : "ok";
}

// Desirable training load per MD-day, as % of match demand — a typical
// periodization shape (lowest MD+1 & MD-1, peak mid-week). A REFERENCE template
// (Martin-García 2018; Akenhead 2016), not a per-team rule: the coach adjusts to
// their model. One load-shape regardless of the selected metric — a per-metric ×
// per-day target grid would be a number wall, against explainability-first.
const MD_TARGET: Record<string, { lo: number; hi: number }> = {
  "MD+1": { lo: 20, hi: 40 },   // recovery / regeneration
  "MD+2": { lo: 45, hi: 70 },   // re-introduction
  "MD+3": { lo: 70, hi: 95 },   // build
  "MD-5": { lo: 70, hi: 95 },   // build (long weeks)
  "MD-4": { lo: 85, hi: 110 },  // high
  "MD-3": { lo: 85, hi: 110 },  // peak load
  "MD-2": { lo: 55, hi: 80 },   // moderate, taper begins
  "MD-1": { lo: 35, hi: 55 },   // taper / activation
};
// Top-up cohort bands for the post-match days: non-starters replace the match
// stimulus they missed → roughly match-equivalent load. Tunable reference, not a
// rule (Anderson 2016; Hills 2018; Stevens 2017). The Recovery cohort uses the
// MD_TARGET bands above (those were designed for recovering players).
const TOPUP_TARGET: Record<string, { lo: number; hi: number }> = {
  "MD+1": { lo: 80, hi: 110 },
  "MD+2": { lo: 85, hi: 110 },
};
const MICRO_SCALE = 150; // bar axis max (% of match demand)

// One microcycle bar: the value vs its desirable band, with a 100% match line.
// Shared by the single squad series and the per-cohort (recovery / top-up) bars.
function MicroBar({ leftLabel, pct, band, sessions, IS, sub = false, lowConf = false }: {
  leftLabel: string; pct: number | null; band: { lo: number; hi: number } | null; sessions: number; IS: boolean; sub?: boolean; lowConf?: boolean;
}) {
  const w = pct == null ? 0 : Math.min(pct, MICRO_SCALE) / MICRO_SCALE * 100;
  const status: "on" | "under" | "over" | "none" = pct == null || band == null ? "none" : pct < band.lo ? "under" : pct > band.hi ? "over" : "on";
  const tone = status === "on" ? "bg-emerald-500" : status === "under" ? "bg-amber-400" : status === "over" ? "bg-indigo-500" : pct == null ? "bg-slate-200" : "bg-sky-500";
  return (
    <div className="flex items-center gap-2">
      <div className={`shrink-0 tabular-nums ${sub ? "w-28 pl-2 text-[10px] text-slate-500" : "w-12 text-[11px] font-semibold text-slate-600"}`}>
        {leftLabel}{lowConf && <span className="ml-1 text-amber-500" title={IS ? "Fá úrtök — lítið traust" : "Few sessions — low confidence"}>!</span>}
      </div>
      <div className="relative h-5 flex-1 overflow-hidden rounded bg-slate-100">
        {band && (
          <div className="absolute top-0 bottom-0 bg-emerald-200/50 ring-1 ring-inset ring-emerald-300/60"
            style={{ left: `${band.lo / MICRO_SCALE * 100}%`, width: `${(band.hi - band.lo) / MICRO_SCALE * 100}%` }}
            title={IS ? `Æskilegt: ${band.lo}–${band.hi}% af leik-kröfu` : `Desirable: ${band.lo}–${band.hi}% of match demand`} />
        )}
        <div className="absolute top-0 bottom-0 w-px bg-slate-400" style={{ left: `${100 / MICRO_SCALE * 100}%` }} title={IS ? "100% = leik-ákefð" : "100% = match intensity"} />
        <div className={`relative h-full ${tone} ${lowConf ? "opacity-40" : "opacity-80"}`} style={{ width: `${w}%` }} />
      </div>
      <div className="w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-700">{pct == null ? "—" : `${pct}%`}</div>
      <div className="w-16 shrink-0 text-right text-[10px] tabular-nums text-slate-400">{band ? `${band.lo}–${band.hi}%` : "—"}</div>
      <div className="w-8 shrink-0 text-right text-[10px] text-slate-400">{sessions}{IS ? " æf" : " s"}</div>
    </div>
  );
}

export default function TrainLikeYouPlayPage() {
  const [lang] = useLang();
  const IS = lang === "IS";
  const thisYear = new Date().getFullYear();
  const [season, setSeason] = useState(thisYear);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const token = useCallback(async () => {
    const sb = getSupabaseClient();
    const { data: { session } } = await sb.auth.getSession();
    return session?.access_token ?? "";
  }, []);

  const load = useCallback(async (yr: number) => {
    setLoading(true); setErr(null);
    try {
      const t = await token();
      if (!t) { setErr(IS ? "Ekki innskráð(ur)" : "Not signed in"); return; }
      const res = await fetch(`/api/coach/train-like-you-play?season=${yr}`, { headers: { Authorization: `Bearer ${t}` } });
      const json = await res.json();
      if (!res.ok) { setErr(json.error ?? "Failed"); setData(null); return; }
      setData(json as Resp);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, [token, IS]);
  useEffect(() => { void load(season); }, [load, season]);

  const META = useMemo<Record<MetricKey, { en: string; is: string }>>(() => ({
    top_speed: { en: "Top speed", is: "Hámarkshraði" },
    fmp_run_high: { en: "Running High", is: "Hlaup há" },
    fmp_dyn_high: { en: "Dynamic High", is: "Dýnamísk há" },
    fmp_dyn_med: { en: "Dynamic Med", is: "Dýnamísk miðl." },
    ima_accel: { en: "IMA Accel", is: "IMA hröðun" },
    ima_decel: { en: "IMA Decel", is: "IMA hemlun" },
    ima_cod: { en: "IMA CoD", is: "IMA stefnubr." },
    ima_jumps: { en: "IMA Jumps", is: "IMA stökk" },
    decel_eff: { en: "Hard efforts", is: "Ákafa-átök" },
    sprint_eff: { en: "Sprint efforts", is: "Spretta-átök" },
    hsr_dist: { en: "High-speed running", is: "Háhraðahlaup" },
    player_load: { en: "Player Load", is: "Player Load" },
    pl_per_min: { en: "Work rate", is: "Ákefð" },
  }), []);
  const [mode, setMode] = useState<Mode>("fmp");
  const [baseline, setBaseline] = useState<Baseline>("own");
  const metricKeys = useMemo<MetricKey[]>(() => data?.modes?.[mode] ?? [], [data, mode]);
  // How many of a mode's metrics the club actually has match data for. top_speed
  // is shared across modes, so we count populated metrics rather than "any", to
  // pick the RICHEST mode (Pro → FMP with 6; Core → core with 4, not FMP with 1).
  const modeDataCount = useCallback((m: Mode) => {
    const keys = data?.modes?.[m] ?? [];
    return keys.filter((k) => (data?.players ?? []).some((p) => p.metrics[k]?.match != null)).length;
  }, [data]);
  // Auto-pick the richest mode ONCE per load (capability-driven default), without
  // overriding the coach's manual choice afterwards.
  const autoPicked = useRef(false);
  useEffect(() => { autoPicked.current = false; }, [season]);
  useEffect(() => {
    if (!data || autoPicked.current) return;
    autoPicked.current = true;
    const best = (["fmp", "ima", "core"] as Mode[])
      .map((m) => [m, modeDataCount(m)] as const)
      .sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] > 0 && best[0] !== mode) setMode(best[0]);
  }, [data, mode, modeDataCount]);
  const [microWindow, setMicroWindow] = useState<MicroWindow>("season");
  const microcycle = useMemo(
    () => data?.microcycleByWindow?.[microWindow] ?? data?.microcycle ?? [],
    [data, microWindow],
  );
  // Demand baseline = each player's OWN match demand, or his POSITION group's
  // average match demand (position-specific standard). Gaps are mode-specific.
  const players = useMemo(() => {
    const gd = data?.groupDemand ?? {};
    const kindMap = new Map((data?.metrics ?? []).map((m) => [m.key, m.kind]));
    const ps = (data?.players ?? []).map((p) => {
      const display = {} as Record<MetricKey, { train: number | null; demand: number | null; pct: number | null; flag: Flag }>;
      for (const k of (data?.metrics ?? []).map((m) => m.key)) {
        const cell = p.metrics[k];
        const demand = baseline === "own" ? (cell?.match ?? null) : (gd[p.group]?.[k] ?? null);
        const pct = cell?.train != null && demand != null && demand > 0 ? Math.round((cell.train / demand) * 100) : null;
        display[k] = { train: cell?.train ?? null, demand, pct, flag: flagOf(kindMap.get(k), pct) };
      }
      const modeGaps = metricKeys.filter((k) => display[k].flag === "under").length;
      return { ...p, display, modeGaps };
    });
    return ps.sort((a, b) => b.modeGaps - a.modeGaps || a.name.localeCompare(b.name, "is"));
  }, [data, metricKeys, baseline]);
  // Group players by position for rendering (ties to Position Comparison).
  const grouped = useMemo(() => POSITION_GROUPS
    .map((g) => ({ ...g, members: players.filter((p) => p.group === g.key) }))
    .filter((g) => g.members.length > 0), [players]);
  const totalGaps = useMemo(() => players.reduce((s, p) => s + p.modeGaps, 0), [players]);
  const playersWithGaps = useMemo(() => players.filter((p) => p.modeGaps > 0).length, [players]);
  const [microMetric, setMicroMetric] = useState<MetricKey>("fmp_dyn_high");
  const microKey: MetricKey | undefined = metricKeys.includes(microMetric) ? microMetric : metricKeys[1] ?? metricKeys[0];

  // ── VERDICT (rules, not AI) ─────────────────────────────────────────────
  // Plain one-sentence read of the board: who is under-exposed to match-intensity
  // demands and where the squad sits as a % of match load. Jargon (FMP/IMA event
  // names + the paper citation) lives in each driver tooltip, never the headline.
  const verdict = useMemo(() => {
    if (players.length === 0) return null;
    // Source paper for each metric so the tooltip can cite it.
    const metricTip: Record<MetricKey, { en: string; is: string }> = {
      top_speed: { en: "Top sprint speed vs match (Buchheit 2014).", is: "Hámarks-sprett­hraði m.v. leik (Buchheit 2014)." },
      fmp_run_high: { en: "High-intensity running exposure — Catapult Football Movement Profile, running-high zone (Malone 2017).", is: "Háákefðar-hlaup — Catapult Football Movement Profile, hlaup-há flokkur (Malone 2017)." },
      fmp_dyn_high: { en: "High-intensity dynamic (multi-directional) movement — FMP dynamic-high zone (Malone 2017).", is: "Háákefðar dýnamísk (fjölátta) hreyfing — FMP dýnamísk-há flokkur (Malone 2017)." },
      fmp_dyn_med: { en: "Medium-intensity dynamic movement — FMP dynamic-medium zone (Malone 2017).", is: "Miðlungs-ákefðar dýnamísk hreyfing — FMP dýnamísk-miðl. flokkur (Malone 2017)." },
      ima_accel: { en: "Acceleration events — inertial movement analysis (Gabbett 2016).", is: "Hröðunar-atburðir — inertial movement analysis (Gabbett 2016)." },
      ima_decel: { en: "Deceleration / braking events — inertial movement analysis (McBurnie 2022).", is: "Hemlunar-atburðir — inertial movement analysis (McBurnie 2022)." },
      ima_cod: { en: "Change-of-direction events — inertial movement analysis (McBurnie 2022).", is: "Stefnubreytingar — inertial movement analysis (McBurnie 2022)." },
      ima_jumps: { en: "Jump events — inertial movement analysis (Gabbett 2016).", is: "Stökk — inertial movement analysis (Gabbett 2016)." },
      decel_eff: { en: "Hard accel/decel efforts — Gen2 effort count, the Core braking signal without IMA (McBurnie 2022).", is: "Ákafa-átök (hröðun/hemlun) — Gen2 átaka-talning, Core hemlunar-merki án IMA (McBurnie 2022)." },
      sprint_eff: { en: "Sprint-band efforts — number of sprint efforts (Malone 2017).", is: "Spretta-átök — fjöldi spretta-átaka (Malone 2017)." },
      hsr_dist: { en: "High-speed running distance — above the high-speed threshold (Malone 2018).", is: "Háhraðahlaup — vegalengd yfir háhraðaþröskuldi (Malone 2018)." },
      player_load: { en: "Player Load per 90 — total mechanical work (volume).", is: "Player Load per 90 — heildar vélræn vinna (magn)." },
      pl_per_min: { en: "Player Load per minute — training intensity vs match intensity.", is: "Player Load á mínútu — þjálfunar-ákefð vs leik-ákefð." },
    };
    const total = players.length;
    const withGaps = players.filter((p) => p.modeGaps > 0);
    // Squad coverage: avg % of match demand across the active metrics & players
    // that have a number — a single "training at ~X% of match" headline figure.
    let pctSum = 0, pctN = 0;
    for (const p of players) for (const k of metricKeys) {
      const v = p.display[k]?.pct;
      if (v != null) { pctSum += v; pctN += 1; }
    }
    const squadPct = pctN > 0 ? Math.round(pctSum / pctN) : null;
    // Thin data → low confidence, never faked.
    const level: "high" | "moderate" | "low" = total >= 12 ? "high" : total >= 6 ? "moderate" : "low";
    const confNote = {
      EN: `${total} ${total === 1 ? "player" : "players"} · ${pctN} ${pctN === 1 ? "reading" : "readings"}`,
      IS: `${total} ${total === 1 ? "leikmaður" : "leikmenn"} · ${pctN} ${pctN === 1 ? "mæling" : "mælingar"}`,
    };
    const basisEN = mode === "fmp" ? "movement-profile" : mode === "ima" ? "movement-event" : "GPS / effort";
    const basisIS = mode === "fmp" ? "hreyfi-prófíl" : mode === "ima" ? "hreyfi-atburða" : "GPS / átaka";
    const vsEN = baseline === "own" ? "their own match" : "their position's match";
    const vsIS = baseline === "own" ? "eigin leik" : "stöðu-leik";

    // Tone: many under-exposed → concern, some → watch, none → good.
    const share = withGaps.length / total;
    const tone: VerdictTone = withGaps.length === 0 ? "good" : share >= 0.34 ? "concern" : "watch";

    const names = withGaps.slice(0, 6).map((p) => p.name.split(" ")[0]);
    const namesStr = names.join(", ") + (withGaps.length > names.length ? (IS ? ` +${withGaps.length - names.length} fleiri` : ` +${withGaps.length - names.length} more`) : "");
    const pctTailEN = squadPct != null ? ` The squad is training at about ${squadPct}% of match demand.` : "";
    const pctTailIS = squadPct != null ? ` Liðið þjálfar við um ${squadPct}% af leik-kröfu.` : "";

    // At/above match is the norm on the event/movement basis (drills accumulate
    // events) — phrase the all-clear headline by magnitude so 264% never reads as
    // "close to" match demand.
    const aboveMatch = squadPct != null && squadPct >= 125;
    const sentence = withGaps.length === 0
      ? {
          EN: squadPct == null
            ? "Everyone is training in line with what their matches demand."
            : `Everyone is training ${aboveMatch ? "at or above" : "close to"} what their matches demand — about ${squadPct}% of match load on the ${basisEN} basis.`,
          IS: squadPct == null
            ? "Allir þjálfa í takt við það sem leikir þeirra krefjast."
            : `Allir þjálfa ${aboveMatch ? "á eða yfir" : "nálægt"} því sem leikir þeirra krefjast — um ${squadPct}% af leik-kröfu á ${basisIS}-grunni.`,
        }
      : {
          EN: `${withGaps.length} of ${total} ${withGaps.length === 1 ? "player is" : "players are"} under-exposed to match-intensity demands — ${namesStr}.${pctTailEN}`,
          IS: `${withGaps.length} af ${total} ${withGaps.length === 1 ? "leikmaður er" : "leikmenn eru"} undir-þjálfaðir m.v. leik-ákefð — ${namesStr}.${pctTailIS}`,
        };

    const hotBasis = mode === "fmp" || mode === "ima";
    const aboveTailEN = aboveMatch && hotBasis ? " On this basis training naturally runs above match intensity (movement events pile up in drills), so a high % is expected — this view flags only under-exposure, not overload." : "";
    const aboveTailIS = aboveMatch && hotBasis ? " Á þessum grunni fer þjálfun eðlilega yfir leik-ákefð (hreyfi-atburðir hlaðast upp í æfingum), svo há prósenta er væntanleg — þessi sýn merkir aðeins van-þjálfun, ekki ofálag." : "";
    const subtitle = {
      EN: `Train at the intensities the match demands: where a player's best training is well below ${vsEN}, the body isn't being prepared for what the game asks (Gabbett 2016).${aboveTailEN}`,
      IS: `Þjálfaðu á þeirri ákefð sem leikurinn krefst: þar sem besta þjálfun leikmanns er langt undir ${vsIS} er líkaminn ekki undirbúinn fyrir kröfur leiksins (Gabbett 2016).${aboveTailIS}`,
    };

    // Drivers: the most under-exposed players, with the under-trained metric (and
    // its jargon + paper citation) tucked into each tooltip.
    const drivers: VerdictDriver[] = withGaps.slice(0, 5).map((p) => {
      const under = metricKeys.filter((k) => p.display[k]?.flag === "under");
      const worst = under
        .map((k) => ({ k, pct: p.display[k]?.pct ?? 999 }))
        .sort((a, b) => a.pct - b.pct)[0];
      const worstK = worst?.k;
      return {
        label: p.name.split(" ")[0],
        detail: worstK
          ? { EN: `${IS ? META[worstK].is : META[worstK].en} ${worst.pct}%`, IS: `${META[worstK].is} ${worst.pct}%` }
          : undefined,
        tone: "concern" as VerdictTone,
        tip: worstK
          ? {
              EN: `${p.name} · best training ${worst.pct}% of match demand on ${META[worstK].en}. ${metricTip[worstK].en} Below ~50% = under-prepared (Malone 2018).`,
              IS: `${p.name} · besta þjálfun ${worst.pct}% af leik-kröfu í ${META[worstK].is}. ${metricTip[worstK].is} Undir ~50% = vanbúinn (Malone 2018).`,
            }
          : undefined,
      };
    });

    return { tone, sentence, subtitle, confidence: { level, note: confNote }, drivers };
  }, [players, metricKeys, mode, baseline, IS, META]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <style>{`@media print {@page{size:A4 landscape;margin:11mm} body *{visibility:hidden} #tlp,#tlp *{visibility:visible} #tlp{position:absolute;left:0;top:0;width:100%} .tlp-noprint{display:none!important} .tlp-sec{break-inside:avoid}}`}</style>

      <div className="tlp-noprint mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-base font-bold text-slate-900">{IS ? "Train like you Play" : "Train like you Play"}</div>
            <PagePurpose
              en="compare training demands to match demands per role"
              is="bera þjálfunarkröfur saman við leikkröfur per hlutverk"
              tutorial="train-like-you-play"
            />
            <div className="text-xs text-slate-500">{IS ? "Besta þjálfunar-exposure vs leik-krafa (IMU — virkar innandyra). Grunnur: FMP (Catapult hreyfi-flokkar) eða hrá IMA (atburðir: hröðun, hemlun, stefnubreytingar, stökk)." : "Best training exposure vs match demand (IMU — works indoors). Basis: FMP (Catapult movement zones) or raw IMA (events: accelerations, decelerations, change-of-direction, jumps)."}</div>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-slate-500">{IS ? "Grunnur" : "Basis"}</label>
              <div className="mt-0.5 flex rounded-md border border-slate-300 p-0.5 text-xs">
                <button type="button" onClick={() => setMode("fmp")} className={`rounded px-2 py-1 ${mode === "fmp" ? "bg-slate-900 text-white" : "text-slate-600"}`}>FMP</button>
                <button type="button" onClick={() => setMode("ima")} className={`rounded px-2 py-1 ${mode === "ima" ? "bg-slate-900 text-white" : "text-slate-600"}`}>IMA</button>
                <button type="button" onClick={() => setMode("core")} className={`rounded px-2 py-1 ${mode === "core" ? "bg-slate-900 text-white" : "text-slate-600"}`} title={IS ? "GPS + Gen2 átök (allir Catapult-pakkar)" : "GPS + Gen2 efforts (every Catapult tier)"}>GPS</button>
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-slate-500">{IS ? "Borið við" : "Compared to"}</label>
              <div className="mt-0.5 flex rounded-md border border-slate-300 p-0.5 text-xs">
                <button type="button" onClick={() => setBaseline("own")} className={`rounded px-2 py-1 ${baseline === "own" ? "bg-slate-900 text-white" : "text-slate-600"}`}>{IS ? "Eigin leik" : "Own match"}</button>
                <button type="button" onClick={() => setBaseline("position")} className={`rounded px-2 py-1 ${baseline === "position" ? "bg-slate-900 text-white" : "text-slate-600"}`}>{IS ? "Stöðu-norm" : "Position"}</button>
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-slate-500">{IS ? "Tímabil" : "Season"}</label>
              <select value={season} onChange={(e) => setSeason(Number(e.target.value))} className="mt-0.5 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => window.print()} disabled={!data || players.length === 0}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">🖨 PDF</button>
          </div>
        </div>
      </div>

      {err && <div className="tlp-noprint mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {loading && <div className="tlp-noprint mb-4 text-sm text-slate-500">…</div>}

      {data && players.length > 0 && (
        <div id="tlp" className="space-y-4">
          {verdict && (
            <div className="tlp-sec">
              <VerdictBanner
                lang={lang}
                kicker={IS ? "Þjálfa eins og þú spilar" : "Train like you Play"}
                tone={verdict.tone}
                sentence={verdict.sentence}
                subtitle={verdict.subtitle}
                confidence={verdict.confidence}
                drivers={verdict.drivers}
              />
            </div>
          )}
          <div className="tlp-sec flex items-end justify-between border-b border-slate-200 pb-3">
            <div>
              <div className="text-lg font-bold text-slate-900">{IS ? "Þjálfa eins og þú spilar" : "Train like you play"}</div>
              <div className="text-xs text-slate-500">{IS ? "Tölur = besta þjálfun sem % af leik-kröfu" : "Numbers = best training as % of match demand"} · {season}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums text-slate-900">{playersWithGaps}<span className="text-sm font-normal text-slate-400">/{players.length}</span></div>
              <div className="text-[11px] text-slate-500">{IS ? "með exposure-gap" : "with an exposure gap"}{totalGaps > 0 ? ` · ${totalGaps} ${IS ? "alls" : "total"}` : ""}</div>
            </div>
          </div>

          {/* How to train them — turns each exposure gap into a concrete,
              paper-cited training method (position focus + per-player exceptions).
              Rules decide; the prescription is a fixed lookup, never AI. */}
          {players.length > 0 && (
            <div className="tlp-sec">
              <TlypTrainingFocus
                lang={IS ? "IS" : "EN"}
                metricKeys={metricKeys}
                groups={grouped.map((g): FocusGroup => ({ key: g.key, label: { EN: g.en, IS: g.is }, members: g.members }))}
              />
            </div>
          )}

          {/* Microcycle — avg training intensity as % of match demand per MD-day */}
          {(data?.microcycleByWindow?.season ?? data?.microcycle ?? []).length > 0 && (
            <div className="tlp-sec rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{IS ? "Vikuskipulag eftir MD-degi (% af leik-kröfu)" : "Weekly periodization by MD-day (% of match demand)"}</div>
                <div className="flex items-center gap-1.5">
                  <select value={microWindow} onChange={(e) => setMicroWindow(e.target.value as MicroWindow)} className="tlp-noprint rounded-md border border-slate-300 px-2 py-1 text-xs">
                    <option value="week">{IS ? "Síðasta vika" : "Last week"}</option>
                    <option value="month">{IS ? "Síðustu 4 vikur" : "Last 4 weeks"}</option>
                    <option value="season">{IS ? "Allt tímabilið" : "Whole season"}</option>
                  </select>
                  <select value={microKey} onChange={(e) => setMicroMetric(e.target.value as MetricKey)} className="tlp-noprint rounded-md border border-slate-300 px-2 py-1 text-xs">
                    {metricKeys.map((m) => <option key={m} value={m}>{IS ? META[m].is : META[m].en}</option>)}
                  </select>
                </div>
              </div>
              <div className="mb-2 text-[10px] text-slate-400">
                {microWindow === "season"
                  ? (IS ? "Meðaltal yfir allt tímabilið — dæmigert form." : "Averaged over the whole season — the typical shape.")
                  : (IS ? `${microWindow === "week" ? "Síðustu 7 dagar" : "Síðustu 4 vikur"}${data?.microWindowRef ? ` (til ${data.microWindowRef})` : ""} — nýlegt álag.` : `${microWindow === "week" ? "Last 7 days" : "Last 4 weeks"}${data?.microWindowRef ? ` (to ${data.microWindowRef})` : ""} — recent load.`)}
              </div>
              <div className="space-y-1.5">
                {microcycle.length === 0 ? (
                  <div className="rounded-md bg-slate-50 px-3 py-4 text-center text-xs text-slate-400">{IS ? "Engar æfingar á þessum MD-dögum í völdum glugga." : "No sessions on these MD-days in the selected window."}</div>
                ) : microcycle.map((d) => {
                  const c = d.cohorts;
                  // MD+1 / MD+2: the squad is two populations. Render a bar per
                  // cohort against its own band, with a plain-language verdict.
                  if (c && (c.recovery || c.topup)) {
                    const recPct = c.recovery ? c.recovery.metrics[microKey] : null;
                    const topPct = c.topup ? c.topup.metrics[microKey] : null;
                    const recBand = MD_TARGET[d.md_day] ?? null;
                    const topBand = TOPUP_TARGET[d.md_day] ?? null;
                    const onPlan = (p: number | null, b: { lo: number; hi: number } | null) => p != null && b != null && p >= b.lo && p <= b.hi;
                    const parts: string[] = [];
                    if (recPct != null) parts.push(IS ? `byrjunarlið í endurheimt (${recPct}%)` : `starters recovering (${recPct}%)`);
                    if (topPct != null) parts.push(IS ? `varamenn í top-up (${topPct}%)` : `non-starters topped up (${topPct}%)`);
                    const tail = recPct != null && topPct != null
                      ? (onPlan(recPct, recBand) && onPlan(topPct, topBand) ? (IS ? " — bæði á plani." : " — both on plan.") : (IS ? " — athugaðu bilin." : " — check the bands."))
                      : "";
                    return (
                      <div key={d.md_day} className="rounded-md bg-slate-50/70 p-1.5">
                        <div className="mb-1 flex items-baseline gap-2 px-0.5">
                          <span className="w-12 shrink-0 text-[11px] font-bold tabular-nums text-slate-700">{d.md_day}</span>
                          <span className="text-[11px] leading-snug text-slate-600">{parts.join(", ")}{tail}</span>
                        </div>
                        <div className="space-y-1">
                          {c.recovery && <MicroBar leftLabel={IS ? "Endurheimt (spilaði)" : "Recovery (played)"} pct={recPct} band={recBand} sessions={c.recovery.sessions} IS={IS} sub lowConf={c.recovery.sessions < 4} />}
                          {c.topup && <MicroBar leftLabel={IS ? "Top-up (hvíldur)" : "Top-up (rested)"} pct={topPct} band={topBand} sessions={c.topup.sessions} IS={IS} sub lowConf={c.topup.sessions < 4} />}
                        </div>
                      </div>
                    );
                  }
                  // Every other MD-day: single squad bar (unchanged).
                  return <MicroBar key={d.md_day} leftLabel={d.md_day} pct={microKey ? d.metrics[microKey] : null} band={MD_TARGET[d.md_day] ?? null} sessions={d.sessions} IS={IS} />;
                })}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-emerald-200 ring-1 ring-inset ring-emerald-300/60" />{IS ? "æskilegt bil" : "desirable band"}</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />{IS ? "á bili" : "on target"}</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-amber-400" />{IS ? "undir" : "below"}</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-indigo-500" />{IS ? "yfir" : "above"}</span>
              </div>
              <div className="mt-1 text-[10px] text-slate-400">{IS ? "Æskilegt bil = dæmigert vikuskipulag (lágt MD+1 og MD-1, hámark mið-viku) — viðmið, ekki regla; aðlagaðu að þínu módeli (Martin-García 2018; Akenhead 2016)." : "Desirable band = a typical periodization shape (low MD+1 & MD-1, peak mid-week) — a reference, not a rule; adjust to your model (Martin-García 2018; Akenhead 2016)."}</div>
              <div className="mt-1 text-[10px] text-slate-400">{IS ? "Hver % = heildar-magn æfingar sem hlutfall af heildar-magni heils leiks (ekki per-90 hraði — það blæs upp stuttar sessionir). MD+1/MD+2 skipt í tvennt: leikmenn sem spiluðu fullan skammt (≥60 mín) eru í endurheimt; allir aðrir (varamenn, takmarkaðar eða engar mínútur) gera „top-up\" til að bæta upp leik-áreitið sem þá vantaði — hvor með sitt æskilegt bil (Anderson 2016; Hills 2018; Nédélec 2012). „!\" = fá úrtök, lítið traust." : "Each % = the session's total volume as a share of a full match's total (not a per-90 rate — that inflates short sessions). MD+1/MD+2 are split in two: players who played a full shift (≥60 min) are recovering; everyone else (subs, limited or no minutes) does a compensatory “top-up” to replace the match stimulus they missed — each against its own desirable band (Anderson 2016; Hills 2018; Nédélec 2012). “!” = few sessions, low confidence."}</div>
            </div>
          )}

          <div className="tlp-sec rounded-xl border border-slate-200 bg-white p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="px-2 py-1.5 text-left font-medium">{IS ? "Leikmaður" : "Player"}</th>
                    {metricKeys.map((m) => <th key={m} className="px-2 py-1.5 text-center font-medium">{IS ? META[m].is : META[m].en}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((g) => (
                    <Fragment key={g.key}>
                      <tr className="border-t border-slate-200 bg-slate-50">
                        <td colSpan={metricKeys.length + 1} className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {IS ? g.is : g.en} <span className="font-normal text-slate-400">({g.members.length})</span>
                        </td>
                      </tr>
                      {g.members.map((p) => (
                        <tr key={p.id} className={`border-t border-slate-100 ${p.modeGaps > 0 ? "bg-red-50/30" : ""}`}>
                          <td className="px-2 py-1.5">
                            <span className="font-medium text-slate-800">{p.name}</span>
                            <span className="ml-1 text-[10px] text-slate-400">{p.position}</span>
                          </td>
                          {metricKeys.map((m) => {
                            const c = p.display[m];
                            return (
                              <td key={m} className="px-2 py-1.5 text-center">
                                <span className={`inline-block min-w-[42px] rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${FLAG[c?.flag ?? "none"]}`}
                                  title={c?.pct != null ? `${IS ? "þjálfun" : "train"} ${c.train} · ${baseline === "own" ? (IS ? "leikur" : "match") : (IS ? "stöðu-krafa" : "position demand")} ${c.demand}` : (IS ? "engin gögn" : "no data")}>
                                  {c?.pct != null ? `${c.pct}%` : "—"}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-400" />{IS ? "undir-þjálfaður (<50% / hraði <70%)" : "under-trained (<50% / speed <70%)"}</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" />{IS ? "gap (50–80% / hraði 70–85%)" : "gap (50–80% / speed 70–85%)"}</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-400" />{IS ? "vel þjálfaður" : "well trained"}</span>
            </div>
          </div>

          <div className="tlp-sec rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 text-[12px] leading-relaxed text-slate-700">
            {IS
              ? "Byggt á Catapult Football Movement Profile (IMU) — fangar dýnamíska, fjölátta hreyfingu (ekki bara beinan GPS-hraða) og virkar innandyra. Þjálfun á að undirbúa fyrir leik-hreyfimynstrið (Gabbett 2016); undir ~50% af leik-kröfu í háákefðar-flokkunum = aukin áhætta (Malone 2018, Duhig 2016). FMP gefur sína eigin session-lengd, svo per-90 ákefð er reiknanleg þótt GPS-lengd vanti."
              : "Built on the Catapult Football Movement Profile (IMU) — it captures dynamic, multi-directional movement (not just straight-line GPS speed) and works indoors. Training should prepare for the match movement profile (Gabbett 2016); below ~50% of match demand in the high-intensity categories = elevated risk (Malone 2018, Duhig 2016). FMP carries its own session duration, so per-90 intensity is computable even when GPS duration is missing."}
          </div>
          <div className="text-[9px] text-slate-400">
            MicroPulse · {IS ? `FMP/IMA per-90 · topp-3 æfingar vs ${baseline === "own" ? "eigin leik-kröfu" : "stöðu-kröfu (stöðu-meðaltal)"} · hópað eftir stöðu · leik-krafa = per-90 yfir leiki ≥20 mín (athugið: Pre-session/Progressive overload nota ≥75 mín heila leiki)` : `FMP/IMA per-90 · top-3 training vs ${baseline === "own" ? "own match demand" : "position demand (group average)"} · grouped by position · match demand = per-90 over appearances ≥20 min (note: Pre-session/Progressive overload use ≥75-min full games)`} · Catapult FMP · Gabbett 2016 · Malone 2018 · Duhig 2016
          </div>
        </div>
      )}
      {data && players.length === 0 && !loading && (
        <div className="tlp-noprint rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">{IS ? "Engin gögn." : "No data."}</div>
      )}

      {/* "How to develop him" — per-player development drill-down at the BOTTOM:
          it deepens the squad-level TLYP analysis above into an individual read
          (game model × how he moves). Self-fetches; capability-driven. */}
      <div className="tlp-noprint mt-6">
        <TrainingReadPanel lang={lang === "EN" ? "EN" : "IS"} />
      </div>
    </div>
  );
}
