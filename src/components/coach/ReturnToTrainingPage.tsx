"use client";

/**
 * ReturnToTrainingPage — one player's load history (injury-shaded timeline) + an
 * injury-aware return-to-training plan. Layered read: verdict → per-quality
 * targets with why-lines + ACWR → raw history behind Show details. The ceiling
 * is his own HEALTHY baseline; every target cites its % of that baseline. Rules
 * decide; coach edits are logged.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { buildRttTodayRecommendation, type RttResult } from "@/lib/micropulse/returnToTraining";
import RttPlayerPicker from "./RttPlayerPicker";
import PhysioNoteCard from "@/components/clinical/PhysioNoteCard";

type Quality = "volume" | "distance" | "hsr" | "sprint" | "accel" | "decel" | "decelHigh" | "cod" | "efforts";
const ORDER: Quality[] = ["volume", "distance", "hsr", "sprint", "accel", "decel", "decelHigh", "cod"];
const LABEL: Record<Quality, { en: string; is: string; unit: string }> = {
  volume: { en: "Weekly player load", is: "Vikuálag", unit: "" },
  distance: { en: "Weekly distance", is: "Vikuvegalengd", unit: "m" },
  hsr: { en: "Weekly high-speed running", is: "Vikuháhraðahlaup", unit: "m" },
  sprint: { en: "Weekly sprinting", is: "Vikusprettur", unit: "m" },
  accel: { en: "Accelerations (IMA)", is: "Hröðun (IMA)", unit: "" },
  decel: { en: "Decelerations (IMA)", is: "Hemlun (IMA)", unit: "" },
  decelHigh: { en: "High-intensity braking (IMA)", is: "Háákefðar hemlun (IMA)", unit: "" },
  cod: { en: "Change of direction (IMA)", is: "Stefnubreytingar (IMA)", unit: "" },
  efforts: { en: "Efforts (accel + decel)", is: "Átök (hröðun + hemlun)", unit: "" },
};

// RTP workflow labels (mirror the Injuries/RTP page vocabulary; kept short).
const RTP_STATUS: Record<string, { en: string; is: string }> = {
  injured: { en: "Injured", is: "Meiddur" },
  rehabilitation: { en: "Rehabilitation", is: "Endurhæfing" },
  rtp_training: { en: "RTP training", is: "RTP þjálfun" },
  cleared: { en: "Cleared", is: "Grænljós" },
};
const RTP_STAGE_NAME: Record<number, { en: string; is: string }> = {
  0: { en: "Rest", is: "Hvíld" },
  1: { en: "Light cardio", is: "Léttur hjartsláttur" },
  2: { en: "Running", is: "Hlaup" },
  3: { en: "Non-contact", is: "Án snertingar" },
  4: { en: "Full training", is: "Full þjálfun" },
  5: { en: "Match play", is: "Leikur" },
};

type Session = { date: string; injured: boolean; isMatch: boolean; estimated: boolean; load: number; distance: number; hsr: number; sprint: number; cod: number; topSpeed: number };
type Win = { start: string; end: string; type: string; source: string; isActive: boolean };
type WeekTarget = { week: number; quality: Quality; target: number; pctOfHealthy: number; wow: number; acwr: number; locked: boolean; unlockWeek: number; caution: boolean; why: string; overridden?: boolean; overrideReason?: string };
type InjuryProfile = { category: string; label: { en: string; is: string }; riskQualities: Quality[] };
type RtpInfo = { status: string; stage: number };
type Resp = {
  player: { id: string; name: string };
  history: Session[];
  injuryWindows: Win[];
  injuryDiscrepancy: boolean;
  headInjury: boolean;
  injuryProfile?: InjuryProfile;
  rtp?: RtpInfo | null;
  currentlyInjured: boolean;
  rttStartDate: string | null;
  plannedSessionsThisWeek?: number | null;
  baseline: Record<Quality, number> & { builtFromHealthyWeeks: number; topSpeed: number };
  floor: Record<Quality, number> & { topSpeed: number };
  rampFrom?: Record<Quality, number> & { topSpeed: number };
  layoff?: { days: number | null; retainedPct: number | null; rampWeeks: number };
  asymmetry: { healthyLeftPct: number | null; currentLeftPct: number | null; imbalanced: boolean };
  plan: { verdict: string; currentWeek: number; weeks: WeekTarget[] } | null;
  adherence?: AdherenceWeek[];
  confidence: "high" | "medium" | "low";
  variant?: "ima" | "gps";
  qualityOrder?: Quality[];
  error?: string;
};
type AdherenceCell = { quality: Quality; target: number; actual: number; deltaPct: number; status: "under" | "on" | "over" };
type AdherenceWeek = { week: number; weekStart: string; sessions: number; estimatedSessions?: number; inProgress: boolean; cells: AdherenceCell[] };

const f0 = (v: number) => Math.round(v).toLocaleString("en-US");

export default function ReturnToTrainingPage({ playerId }: { playerId: string }) {
  const [lang] = useLang();
  const is = lang === "IS";
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showMatches, setShowMatches] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null); // null = follow the current plan week
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);
  // Coach's manual override of the planned sessions-this-week count. null =
  // use the Week-setup count from the server, or an estimate when this week
  // isn't structured. The per-session ("today") recommendation always divides
  // the REMAINING weekly budget by the sessions still to come.
  const [manualSessions, setManualSessions] = useState<number | null>(null);

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? "", []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/coach/return-to-training/${playerId}?window=180`, { headers: { Authorization: `Bearer ${await token()}` } });
      const j = (await res.json()) as Resp;
      if (!res.ok) { setErr(j.error ?? "Failed"); setData(null); }
      else setData(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "Network error"); }
    finally { setLoading(false); }
  }, [playerId, token]);

  useEffect(() => { void load(); }, [load]);

  async function startPlan() {
    if (!startDate) return;
    setBusy(true);
    try {
      await fetch(`/api/coach/return-to-training/${playerId}`, { method: "PUT", headers: { "content-type": "application/json", Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ rttStartDate: startDate }) });
      await load();
    } finally { setBusy(false); }
  }

  // Coach override of a recommended target — logged with a reason (audit trail).
  const saveOverride = useCallback(async (quality: Quality, week: number, from: number, to: number, reason: string) => {
    await fetch(`/api/coach/return-to-training/${playerId}`, {
      method: "PUT",
      headers: { "content-type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ override: { quality, week, from, to, reason } }),
    });
    await load();
  }, [playerId, token, load]);

  // The CURRENT plan week (the actionable "this week") — its targets, the actual
  // load he has logged against them, and that week's sessions.
  const planCurrentWeek = data?.plan?.currentWeek ?? 1;
  const totalWeeks = data?.plan ? Math.max(1, ...data.plan.weeks.map((w) => w.week)) : 1;
  const curWeek = Math.min(totalWeeks, Math.max(1, selectedWeek ?? planCurrentWeek));
  const weekNow = useMemo(() => (data?.plan ? data.plan.weeks.filter((w) => w.week === curWeek) : []), [data, curWeek]);
  const curAdh = useMemo(() => data?.adherence?.find((a) => a.week === curWeek) ?? null, [data, curWeek]);
  const actualByQ = useMemo(() => {
    const m = new Map<Quality, AdherenceCell>();
    curAdh?.cells.forEach((c) => m.set(c.quality, c));
    return m;
  }, [curAdh]);
  // Re-injury watch: actual load OVER the recommended target on one of THIS
  // injury's key re-injury qualities. Doing more than the graded ramp on those
  // qualities, too soon, is the re-injury danger — surface it at layer 0.
  const riskOvershoots = useMemo(() => {
    const risk = new Set(data?.injuryProfile?.riskQualities ?? []);
    if (!curAdh || !risk.size) return [];
    return curAdh.cells.filter((c) => risk.has(c.quality) && c.status === "over" && c.target > 0);
  }, [curAdh, data?.injuryProfile]);
  // The real sessions that fall inside the current plan week (Mon–Sun of weekStart).
  const weekSessions = useMemo(() => {
    if (!curAdh) return [];
    const start = curAdh.weekStart;
    const end = new Date(`${start}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 7);
    const endIso = end.toISOString().slice(0, 10);
    return (data?.history ?? []).filter((s) => s.date >= start && s.date < endIso).sort((a, b) => a.date.localeCompare(b.date));
  }, [data, curAdh]);

  if (loading) return <div className="p-6 text-sm text-slate-500">{is ? "Hleð…" : "Loading…"}</div>;
  if (err || !data) return <div className="p-6"><div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err ?? "No data"}</div></div>;

  const conf = data.confidence;
  const confColor = conf === "high" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : conf === "medium" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-slate-600 bg-slate-50 border-slate-200";
  // Qualities in play for this player's data variant (Pro IMA vs Core/Lite GPS).
  const order = data.qualityOrder ?? ORDER;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <RttPlayerPicker currentId={playerId} currentName={data.player.name} />
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">{is ? "Aftur í æfingar" : "Return-to-training"}</span>
            {data.currentlyInjured && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-700">{is ? "Meiddur núna" : "Currently injured"}</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${confColor}`} title={is ? "Þroski grunnlínu — fjöldi heilbrigðra vikna sem loftið er byggt á" : "Baseline maturity — how many healthy weeks the ceiling is built from"}>
              {is ? "Vissa" : "Confidence"}: {conf} · {data.baseline.builtFromHealthyWeeks} {is ? "heilbrigðar vikur" : "healthy weeks"}
            </span>
            {data.layoff?.days != null && (
              <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700" title={is ? "Lengd fjarveru ræður hversu hátt og lengi upptröppunin er — stutt fjarvera heldur mestu álagsþoli (detraining)." : "Layoff length sets how high and long the ramp is — a short layoff keeps most capacity (detraining)."}>
                {data.layoff.days} {is ? "daga frá" : "day layoff"} · ~{data.layoff.retainedPct}% {is ? "álagsþol eftir" : "capacity"} · {data.layoff.rampWeeks} {is ? "vikna plan" : "wk plan"}
              </span>
            )}
            {data.rtp && (
              <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700" title={is ? "Klínískt RTP-stig úr Meiðsli/RTP vinnuflæðinu — sama heimild og RTP-síðan." : "Clinical RTP stage from the Injuries/RTP workflow — same source as the RTP page."}>
                RTP: {is ? RTP_STATUS[data.rtp.status]?.is ?? data.rtp.status : RTP_STATUS[data.rtp.status]?.en ?? data.rtp.status} · {is ? "stig" : "stage"} {data.rtp.stage}/5{RTP_STAGE_NAME[data.rtp.stage] ? ` · ${is ? RTP_STAGE_NAME[data.rtp.stage].is : RTP_STAGE_NAME[data.rtp.stage].en}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Confirmed physio note (if any) — the clinician's authoritative read, with
          the on-pitch L/R cross-check. Renders nothing when there's no note. */}
      <PhysioNoteCard playerId={playerId} is={is} />

      {/* Layer 0 — re-injury watch: actual OVER recommended on a key re-injury quality */}
      {riskOvershoots.length > 0 && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-rose-800">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
            {is ? "Endurmeiðsla-vakt" : "Re-injury watch"}
          </div>
          <div className="mt-1 space-y-0.5 text-sm text-rose-700">
            {riskOvershoots.map((c) => (
              <div key={c.quality}>
                <span className="font-semibold">{is ? LABEL[c.quality].is : LABEL[c.quality].en}</span>{" "}
                {is ? "er" : "is"} <span className="font-semibold">+{c.deltaPct}%</span> {is ? "yfir ráðlögðu vikunnar" : "over this week's recommendation"} ({f0(c.actual)} {is ? "af" : "of"} {f0(c.target)}) — {is ? "aftur í" : "back to"} {f0(c.target)} {is ? "heldur honum á stigaðri upptröppun." : "keeps him on the graded ramp."}
              </div>
            ))}
          </div>
          {data.injuryProfile && (
            <div className="mt-1 text-[11px] text-rose-600/80">
              {is ? "Þetta eru lykil-endurmeiðsla-gæði fyrir" : "These are the key re-injury qualities for"} {is ? data.injuryProfile.label.is.split("—")[0].trim() : data.injuryProfile.label.en.split("—")[0].trim()}. {is ? "Að fara yfir stigaða álagið of snemma er helsta endurmeiðsla-hættan." : "Exceeding the graded load too soon is the main re-injury risk."}
            </div>
          )}
        </div>
      )}

      {/* Injury source disagreement (surface, don't resolve) */}
      {data.injuryDiscrepancy && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {is ? "Meiðsla-skrár eru ósammála um tegund — báðir gluggar eru notaðir (sameining). Staðfestu réttu skráninguna." : "Injury records disagree on type — both windows are used (union). Confirm the correct record."}
        </div>
      )}
      {data.headInjury && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">
          {is ? "Höfuðáverki: endurkoma er einkenna-stýrð (HIA/GRTP). Álagið er ÞAK, ekki kveikja — það má aldrei færa stig sjálfkrafa." : "Head injury: graded return is symptom-limited (HIA/GRTP). Load is a CEILING, not a trigger — it never advances a stage on its own."}
        </div>
      )}
      {/* Injury-type awareness: the injury's key re-injury qualities ramp slower. */}
      {!data.headInjury && data.injuryProfile && data.injuryProfile.riskQualities.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          <span className="font-semibold">{is ? "Meiðsla-aðlögun: " : "Injury-specific: "}</span>
          {is ? data.injuryProfile.label.is : data.injuryProfile.label.en}. {" "}
          {is ? "Þessi gæði aukast hægar (7%/viku) og eru sett inn lægra." : "These qualities ramp more slowly (7%/week) and start lower."}
          <span className="ml-1">({data.injuryProfile.riskQualities.map((q) => (is ? LABEL[q].is : LABEL[q].en)).join(", ")})</span>
        </div>
      )}

      {/* Today's recommended session load — ADAPTIVE: takes THIS week's graded
          target, subtracts what he has already logged this week, and divides the
          remainder by the sessions still to come. Planned session count comes
          from Week setup when the week is structured, else an adjustable
          estimate. GPS = Engine, IMA = Driver. Locked qualities are held. Load
          is a CEILING — the re-injury watch fires on overshoot. */}
      {data.plan && (() => {
        const setupCount = data.plannedSessionsThisWeek ?? null;
        const DEFAULT_SESSIONS = 4;
        const planned = manualSessions ?? setupCount ?? DEFAULT_SESSIONS;
        const source = manualSessions != null
          ? (is ? "handvirkt" : "manual")
          : setupCount != null
            ? (is ? "úr Week setup" : "from Week setup")
            : (is ? "áætlað" : "estimated");

        // Shared engine — the SAME math the player's Today card uses, so the
        // coach page and the player can never drift (one source). `data` carries
        // the RttResult fields via the API's `...result` spread.
        const todayRec = buildRttTodayRecommendation(data as unknown as RttResult, planned);
        if (!todayRec) return null;
        const { sessionsDone, remainingSessions, sessionType } = todayRec;

        const rec = todayRec.qualities.map((q) => ({ q: q.key, weekly: q.weekly, done: q.done, remaining: q.remaining, today: q.today, pct: q.pctOfHealthy }));
        const GPS = new Set<Quality>(["volume", "distance", "hsr", "sprint"]);
        const gps = rec.filter((r) => GPS.has(r.q));
        const ima = rec.filter((r) => !GPS.has(r.q));
        const held = todayRec.held;

        // Session-type steer copy (the math is in buildRttTodayRecommendation).
        // GPS = Engine, IMA = Driver (Niklas Virtanen); mechanical vs locomotor
        // load separation — Vanrenterghem 2017.
        const LOCO = new Set<Quality>(["distance", "hsr", "sprint"]);
        const MECH = new Set<Quality>(["accel", "decel", "decelHigh", "cod"]);
        const locoAvail = rec.some((r) => LOCO.has(r.q));
        const mechAvail = rec.some((r) => MECH.has(r.q));
        const sType: "loco" | "mech" | "mixed" =
          sessionType === "locomotive" ? "loco" : sessionType === "mechanical" ? "mech" : "mixed";
        const TYPE_META = {
          loco:  { label: is ? "Locomotive" : "Locomotive", sub: is ? "hlaup — lengri & háhraða sprettir" : "running — longer & high-speed", bg: "#e0f2fe", fg: "#0369a1", icon: "🏃" },
          mech:  { label: is ? "Mechanical" : "Mechanical", sub: is ? "stefnubreytingar & hemlun" : "change of direction & braking", bg: "#faf1de", fg: "#9a6410", icon: "🔄" },
          mixed: { label: is ? "Blandað (Mixed)" : "Mixed", sub: is ? "jafnvægi hlaups & stefnubreytinga" : "balanced running + change of direction", bg: "#efe8fb", fg: "#5b4794", icon: "⚖️" },
        } as const;
        const tm = TYPE_META[sType];
        const sWhy = sType === "loco"
          ? (mechAvail
              ? (is ? "Meira af hlaupaálagi vikunnar er eftir — gerðu daginn hlaupamiðaðan (lengri, háhraða)." : "More of this week's running load is still to come — make today locomotive (longer, high-speed).")
              : (is ? "Stefnubreytingar eru ekki komnar inn enn — haltu deginum hlaupamiðuðum." : "Change of direction isn't introduced yet — keep today running-based."))
          : sType === "mech"
            ? (locoAvail
                ? (is ? "Meira af stefnubreytingum & hemlun vikunnar er eftir — gerðu daginn mechanical (klippingar, hemlun)." : "More of this week's change-of-direction & braking is still to come — make today mechanical (cutting, braking).")
                : (is ? "Hlaupaálag er á áætlun — í dag áhersla á stefnubreytingar & hemlun." : "Running load is on track — today emphasise change of direction & braking."))
            : (is ? "Hlaup og stefnubreytingar eru bæði á áætlun — blönduð æfing hentar í dag." : "Running and change of direction are both on track — a mixed session fits today.");

        const cell = (r: { q: Quality; weekly: number; done: number; remaining: number; today: number; pct: number }) => (
          <div key={r.q} className="rounded-lg border border-violet-100 bg-white px-3 py-2">
            <div className="text-[11px] font-medium text-slate-500">{is ? LABEL[r.q].is : LABEL[r.q].en}</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">
              {r.today === 0 ? "—" : f0(r.today)}<span className="ml-0.5 text-xs font-medium text-slate-400">{LABEL[r.q].unit}</span>
            </div>
            <div className="text-[10px] text-slate-400">
              {r.today === 0
                ? (is ? "vikumarkmiði náð — hvíl" : "week target met — ease off")
                : `${f0(r.done)} ${is ? "búið" : "done"} · ${f0(r.remaining)} ${is ? "eftir" : "left"} ${is ? "af" : "of"} ${f0(r.weekly)}${LABEL[r.q].unit}`}
            </div>
          </div>
        );
        return (
          <div className="rounded-xl border-2 border-violet-200 bg-violet-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#5b4794]">{is ? "Ráðlagt álag í dag" : "Today's recommended session load"}</span>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">{is ? "Vika" : "Week"} {planCurrentWeek}/{totalWeeks}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600" title={is ? "Æfingar vikunnar — úr Week setup eða áætlað. Deilir því sem eftir er á æfingarnar sem eftir eru." : "Sessions this week — from Week setup or estimated. Divides the remaining budget across the sessions still to come."}>
                <span>{is ? "Æfingar/viku" : "Sessions/wk"}</span>
                <button type="button" onClick={() => setManualSessions(() => Math.max(1, planned - 1))} className="h-5 w-5 rounded border border-slate-300 bg-white font-bold leading-none text-slate-600 hover:bg-slate-50">−</button>
                <span className="w-4 text-center font-bold tabular-nums text-slate-800">{planned}</span>
                <button type="button" onClick={() => setManualSessions(() => Math.min(9, planned + 1))} className="h-5 w-5 rounded border border-slate-300 bg-white font-bold leading-none text-slate-600 hover:bg-slate-50">+</button>
              </div>
            </div>

            {/* Session-type steer — locomotive / mechanical / mixed. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold" style={{ background: tm.bg, color: tm.fg }}>
                <span aria-hidden>{tm.icon}</span>
                {is ? "Í dag" : "Today"}: {tm.label}
                <span className="font-medium opacity-80">· {tm.sub}</span>
              </span>
              <span className="text-[11px] leading-snug text-slate-500">{sWhy}</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {sessionsDone}/{planned} {is ? "æfingar búnar í viku" : "sessions done this week"} · {remainingSessions} {is ? "eftir" : "left"} <span className="text-slate-400">({source})</span> — {is ? "það sem eftir er af vikumarkmiðinu, deilt á æfingarnar sem eftir eru. Álagið er ÞAK." : "what's left of this week's target, split across the sessions still to come. Load is a ceiling."}
            </div>
            {gps.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{is ? "Vél — GPS álag" : "Engine — GPS load"}</div>
                <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">{gps.map(cell)}</div>
              </div>
            )}
            {ima.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{is ? "Drifkraftur — IMA álag" : "Driver — IMA load"}</div>
                <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">{ima.map(cell)}</div>
              </div>
            )}
            {held.length > 0 && (
              <div className="mt-2.5 text-[11px] text-slate-500">
                {is ? "Haldið eftir (kemur inn síðar): " : "Held for later: "}
                {held.map((w) => `${is ? LABEL[w.key].is : LABEL[w.key].en}${w.unlockWeek ? ` (${is ? "vika" : "wk"} ${w.unlockWeek})` : ""}`).join(", ")}
              </div>
            )}
          </div>
        );
      })()}

      {/* Load history timeline */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">{is ? "Álagssaga" : "Load history"}</div>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={showMatches} onChange={(e) => setShowMatches(e.target.checked)} />
            {is ? "Sýna leiki" : "Show matches"}
          </label>
        </div>
        <Timeline history={data.history} windows={data.injuryWindows} showMatches={showMatches} />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-slate-400" /> {is ? "Vegalengd (heilbrigt)" : "Distance (healthy)"}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-red-300" /> {is ? "Meiddur gluggi" : "Injury window"}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-amber-400" /> {is ? "Áætlað" : "Estimated"}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-sky-500" /> {is ? "Hæsti hraði" : "Top speed"}</span>
        </div>
      </div>

      {/* L/R change-of-direction asymmetry — monitor (not ramp), key after a one-sided injury. */}
      {data.asymmetry.currentLeftPct != null && (
        <div className={`rounded-xl border p-4 shadow-sm ${data.asymmetry.imbalanced ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">{is ? "Vinstri / hægri stefnubreytingar (jafnvægi)" : "Change-of-direction L / R balance"}</div>
            {data.asymmetry.imbalanced && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-700">{is ? "ójafnvægi" : "imbalanced"}</span>}
          </div>
          <div className="mt-2 flex items-center gap-4 text-sm">
            <div><span className="text-slate-400">{is ? "Núna" : "Now"}:</span> <span className="font-semibold text-slate-800">{data.asymmetry.currentLeftPct}% {is ? "vinstri" : "left"} / {100 - (data.asymmetry.currentLeftPct ?? 0)}% {is ? "hægri" : "right"}</span></div>
            {data.asymmetry.healthyLeftPct != null && <div className="text-slate-400">{is ? "heilbrigt" : "healthy"}: {data.asymmetry.healthyLeftPct}% {is ? "vinstri" : "left"}</div>}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            {is ? "Fylgst með — ekki stigmagnað. Eftir einhliða meiðsli getur leikmaður forðast meidda hliðina; markmið er að ná aftur hans eðlilega jafnvægi." : "Monitored, not ramped. After a one-sided injury a player can avoid the injured side; the goal is to restore his normal balance."}
          </p>
        </div>
      )}

      {/* Plan */}
      {data.currentlyInjured && !data.rttStartDate ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-800">{is ? "Meiddur núna — engin stiguð endurkoma hafin" : "Currently injured — no graded return started"}</div>
          <p className="mt-1 text-sm text-slate-600">
            {is ? "Áætlunin er verkfæri sem þjálfari/sjúkraþjálfari ræsir — hún keyrir ekki sjálfkrafa á meiddan leikmann. Veldu upphafsdag til að byrja stigaða endurkomu." : "The plan is a tool the coach/physio starts — it never auto-runs on an injured athlete. Pick a start date to begin the graded return."}
          </p>
          <p className="mt-2 flex items-start gap-1.5 text-[12px] text-slate-500">
            <span aria-hidden>📱</span>
            <span>{is ? `Þegar þú ræsir hana sér ${data.player.name.split(" ")[0]} framganginn sinn í leikmanna-appinu — vika fyrir viku.` : `Once you start it, ${data.player.name.split(" ")[0]} can follow his own progress in the player app — week by week.`}</span>
          </p>
          <div className="mt-3 flex items-center gap-2">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
            <button type="button" onClick={startPlan} disabled={!startDate || busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              {busy ? "…" : (is ? "Ræsa endurkomu" : "Start return-to-training")}
            </button>
          </div>
        </div>
      ) : data.plan ? (
        <>
          {/* Verdict (layer 0) */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-4 py-3">
            <div className="text-base font-bold text-indigo-900">{data.plan.verdict}</div>
            <div className="mt-0.5 text-xs text-indigo-700/80">{is ? "Loftið = hans eigin heilbrigða grunnlína. Hvert markmið sýnir % af henni." : "Ceiling = his own healthy baseline. Each target shows its % of it."}</div>
            <button type="button" onClick={() => setShowMethod((v) => !v)} className="mt-1.5 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900">
              {showMethod ? (is ? "Fela: á bak við tölurnar ▲" : "Hide: behind the numbers ▲") : (is ? "Á bak við tölurnar — hvernig planið er reiknað ▼" : "Behind the numbers — how the plan is computed ▼")}
            </button>
          </div>

          {/* Player-visibility confirmation — closes the loop: once a plan is
              started the player sees a simplified, encouraging version of this on
              their Today view (no raw numbers / re-injury framing). */}
          {data.rttStartDate && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <span aria-hidden>📱</span>
              <span>{is ? `${data.player.name.split(" ")[0]} sér þennan framgang í leikmanna-appinu — hvaða vika, fókus vikunnar og hvað opnast næst (einfaldað, án hrátalna).` : `${data.player.name.split(" ")[0]} can see this progress in the player app — which week, this week's focus and what unlocks next (simplified, no raw numbers).`}</span>
            </div>
          )}

          {/* Explainability layer — what each number means + the evidence. This is
              what a coach can't get elsewhere: every signal carries its provenance. */}
          {showMethod && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
              <div className="space-y-3">
                <MethodRow term={is ? "Loftið" : "The ceiling"} cite="Gabbett 2016"
                  body={is
                    ? `Loftið er HANS eigið heilbrigða vikuálag — robust hundraðshluti (85.) af heilbrigðu vikunum hans, leikir meðtaldir${data.baseline.volume > 0 ? ` (${f0(data.baseline.volume)} álag/viku)` : ""}. Aldrei liðsmeðaltal, aldrei ein stök æfing. Byggt á ${data.baseline.builtFromHealthyWeeks} heilbrigðum vikum.`
                    : `The ceiling is HIS own healthy weekly load — a robust percentile (85th) of his healthy weeks, matches included${data.baseline.volume > 0 ? ` (${f0(data.baseline.volume)} load/week)` : ""}. Never a squad average, never a single session. Built from ${data.baseline.builtFromHealthyWeeks} healthy weeks.`} />
                <MethodRow term="ACWR" cite="Gabbett 2017 · Impellizzeri 2020"
                  body={is
                    ? "Bráða:krónískt álag — hversu stórt stökk vikan er miðað við nýlegt meðaltal. Við höldum vikulegri aukningu hóflegri (~+10%). ACWR lýsir stökk-STÆRÐ / óvönu áreiti — það er EKKI meiðsla-spá."
                    : "Acute:chronic workload — how big a jump the week is vs his recent average. We keep the weekly increase gradual (~+10%). ACWR describes spike SIZE / unfamiliar load — it is NOT an injury predictor."} />
                {data.layoff?.days != null && (
                  <MethodRow term={is ? "Detraining (fjarvera)" : "Detraining (layoff)"} cite="Mujika & Padilla 2000"
                    body={is
                      ? `Álagsþol dvínar með fjarveru. Eftir ${data.layoff.days} daga heldur hann ~${data.layoff.retainedPct}% af þolinu, svo planið byrjar þaðan og tekur ${data.layoff.rampWeeks} vikur. Stutt fjarvera → byrjar hátt, fáar vikur.`
                      : `Capacity fades with time out. After ${data.layoff.days} days he retains ~${data.layoff.retainedPct}%, so the plan starts there and takes ${data.layoff.rampWeeks} weeks. A short layoff → starts high, few weeks.`} />
                )}
                <MethodRow term={is ? "Röðin (stigmögnun)" : "The order (staging)"} cite="Taberner 2019 · McBurnie 2022"
                  body={is
                    ? "Við byggjum upp rúmmál og þol fyrst; háhraðahlaup og stefnubreytingar SÍÐAST — þau eru mest endurmeiðsla-hætt. Hvert gæði opnast aðeins þegar það á undan er komið."
                    : "We rebuild volume and aerobic base first; high-speed running and change-of-direction LAST — they are the most re-injury-prone. Each quality unlocks only after the one before it."} />
                {data.injuryProfile && data.injuryProfile.riskQualities.length > 0 && !data.headInjury && (
                  <MethodRow term={is ? "Meiðsla-sértækt" : "Injury-specific"} cite=""
                    body={is
                      ? `Fyrir þetta meiðsli aukast lykil-endurmeiðsla-gæðin (${data.injuryProfile.riskQualities.map((q) => LABEL[q].is).join(", ")}) HÆGAR (7%/viku) og byrja lægra.`
                      : `For this injury the key re-injury qualities (${data.injuryProfile.riskQualities.map((q) => LABEL[q].en).join(", ")}) ramp SLOWER (7%/week) and start lower.`} />
                )}
                {data.headInjury && (
                  <MethodRow term={is ? "Höfuðáverki" : "Head injury"} cite="HIA / GRTP"
                    body={is
                      ? "Álagið er LOFT, ekki kveikja — endurkoma er einkenna-stýrð (graded return-to-play). Kerfið stigmagnar ekki sjálfkrafa."
                      : "Load is a CEILING, not a stage trigger — return is symptom-limited (graded return-to-play). The system never auto-advances a stage."} />
                )}
                <MethodRow term={is ? "Vissa" : "Confidence"} cite=""
                  body={is
                    ? `Byggð á ${data.baseline.builtFromHealthyWeeks} heilbrigðum vikum. Fleiri vikur = traustari grunnlína (${conf}).`
                    : `Based on ${data.baseline.builtFromHealthyWeeks} healthy weeks. More weeks = a more trustworthy baseline (${conf}).`} />
              </div>
              <p className="mt-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                {is ? "Reglur reikna planið; þetta lag útskýrir. Hvert merki ber sína heimild." : "Rules compute the plan; this layer explains. Every signal carries its citation."}
              </p>
            </div>
          )}

          {/* Week navigator — step back through past weeks to see how each went */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setSelectedWeek(Math.max(1, curWeek - 1))} disabled={curWeek <= 1}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label={is ? "Fyrri vika" : "Previous week"}>
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.7 5.3a1 1 0 010 1.4L9.4 10l3.3 3.3a1 1 0 01-1.4 1.4l-4-4a1 1 0 010-1.4l4-4a1 1 0 011.4 0z" clipRule="evenodd" /></svg>
              </button>
              <span className="text-sm font-semibold text-slate-800">
                {is ? "Vika" : "Week"} {curWeek} {is ? "af" : "of"} {totalWeeks}
                {curWeek < planCurrentWeek ? <span className="ml-1.5 text-[11px] font-normal text-slate-400">({is ? "liðin" : "past"})</span>
                  : curWeek === planCurrentWeek ? <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">{is ? "núna" : "now"}</span>
                  : <span className="ml-1.5 text-[11px] font-normal text-slate-400">({is ? "framundan" : "upcoming"})</span>}
              </span>
              <button type="button" onClick={() => setSelectedWeek(Math.min(totalWeeks, curWeek + 1))} disabled={curWeek >= totalWeeks}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label={is ? "Næsta vika" : "Next week"}>
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.3 5.3a1 1 0 011.4 0l4 4a1 1 0 010 1.4l-4 4a1 1 0 01-1.4-1.4l3.3-3.3-3.3-3.3a1 1 0 010-1.4z" clipRule="evenodd" /></svg>
              </button>
            </div>
            {curWeek !== planCurrentWeek && (
              <button type="button" onClick={() => setSelectedWeek(null)} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800">
                {is ? "Fara í núverandi viku" : "Jump to current week"}
              </button>
            )}
          </div>

          {/* Selected week's per-quality targets — recommended vs actual (layer 1) */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {weekNow.map((w) => (
              <QualityCard key={w.quality} w={w} floor={data.floor[w.quality]} ceiling={data.baseline[w.quality]} actual={actualByQ.get(w.quality)} onOverride={saveOverride} is={is} />
            ))}
          </div>

          {/* Actual load this week vs the recommended ramp — closes the loop */}
          {curAdh && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-800">
                  {is ? `Raunálag · vika ${curAdh.week}` : `Actual load · week ${curAdh.week}`}
                  {curAdh.inProgress && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">{is ? "í gangi" : "in progress"}</span>}
                </div>
                <div className="text-[11px] text-slate-500">{curAdh.sessions} {is ? "æfingar/leikir í vikunni" : "sessions this week"}{(curAdh.estimatedSessions ?? 0) > 0 ? ` · ${curAdh.estimatedSessions} ${is ? "áætluð" : "estimated"}` : ""}</div>
              </div>
              {/* Per-session load */}
              {weekSessions.length ? (
                <div className="mb-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-slate-400"><th className="py-1 pr-3 font-medium">{is ? "Dagur" : "Day"}</th><th className="py-1 pr-3 font-medium">{is ? "Álag" : "Load"}</th><th className="py-1 pr-3 font-medium">{is ? "Vegalengd" : "Distance"}</th><th className="py-1 pr-3 font-medium">{is ? "Háhraði" : "HSR"}</th><th className="py-1 pr-3 font-medium">{is ? "Sprettur" : "Sprint"}</th><th className="py-1 pr-3 font-medium">{is ? "Tegund" : "Type"}</th></tr></thead>
                    <tbody>
                      {weekSessions.map((s) => (
                        <tr key={s.date} className="border-t border-slate-100">
                          <td className="py-1 pr-3 tabular-nums text-slate-600">{s.date.slice(5)}</td>
                          <td className="py-1 pr-3 tabular-nums font-semibold text-slate-800">{f0(s.load)}</td>
                          <td className="py-1 pr-3 tabular-nums text-slate-600">{f0(s.distance)} m</td>
                          <td className="py-1 pr-3 tabular-nums text-slate-600">{f0(s.hsr)} m</td>
                          <td className="py-1 pr-3 tabular-nums text-slate-600">{f0(s.sprint)} m</td>
                          <td className="py-1 pr-3 text-slate-500">
                            {s.isMatch ? (is ? "leikur" : "match") : s.injured ? (is ? "meiddur" : "injured") : (is ? "æfing" : "training")}
                            {s.estimated && <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-700" title={is ? "Áætlað (gleymdi kubbnum) — telst með í raunálagi vikunnar en ekki í grunnlínunni." : "Estimated (forgot pod) — counts toward the week's actual load, not the baseline."}>{is ? "áætlað" : "est."}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mb-2 text-xs text-slate-400">{is ? "Engar æfingar skráðar í vikunni enn." : "No sessions logged this week yet."}</p>
              )}
              {/* Weekly total vs recommended, per quality */}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {curAdh.cells.filter((c) => c.target > 0 || c.actual > 0).map((c) => (
                  <AdherenceBar key={c.quality} c={c} inProgress={curAdh.inProgress} is={is} />
                ))}
              </div>
              <div className="mt-2 text-[10px] text-slate-400">{is ? "Raunverulegt vikuálag borið saman við það sem mælt var með. Í gangi-vika er hluti — „undir“ þýðir ekki á eftir." : "Actual weekly load vs what was recommended. An in-progress week is partial — “under” isn’t behind."}</div>
            </div>
          )}

          {/* Progression ladder */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-slate-800">{is ? "Framvindu-stigi" : "Progression ladder"}</div>
            <div className="space-y-1.5">
              {order.map((q, qi) => {
                const uw = data.plan!.weeks.find((w) => w.quality === q)?.unlockWeek ?? qi + 1;
                return (
                  <div key={q} className="flex items-center gap-3 text-sm">
                    <span className="w-6 text-right text-xs text-slate-400">{qi + 1}</span>
                    <span className="flex-1 font-medium text-slate-700">{is ? LABEL[q].is : LABEL[q].en}{q === "cod" ? <span className="ml-1 text-[10px] text-rose-500">({is ? "síðast — mest meiðsla-hætta" : "last — most re-injury-prone"})</span> : null}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{is ? `opnast viku ${uw}` : `unlocks week ${uw}`}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Layer 2 — raw plan grid + history */}
          <button type="button" onClick={() => setShowDetails((v) => !v)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
            {showDetails ? (is ? "Fela smáatriði ▲" : "Hide details ▲") : (is ? "Sýna smáatriði (full áætlun · hrá saga) ▼" : "Show details (full plan · raw history) ▼")}
          </button>
          {showDetails && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500"><th className="py-1 pr-2">{is ? "Vika" : "Week"}</th>{order.map((q) => <th key={q} className="py-1 pr-2">{is ? LABEL[q].is : LABEL[q].en}</th>)}</tr></thead>
                <tbody>
                  {Array.from(new Set(data.plan.weeks.map((w) => w.week))).map((wk) => {
                    const adh = data.adherence?.find((a) => a.week === wk);
                    return (
                    <tr key={wk} className="border-t">
                      <td className="py-1 pr-2 font-medium text-slate-700">{wk}{adh ? <span className="ml-1 text-[9px] text-slate-400">{adh.inProgress ? (is ? "· nú" : "· now") : "✓"}</span> : null}</td>
                      {order.map((q) => {
                        const cell = data.plan!.weeks.find((w) => w.week === wk && w.quality === q)!;
                        const act = adh?.cells.find((c) => c.quality === q);
                        return (
                          <td key={q} className={`py-1 pr-2 tabular-nums ${cell.locked ? "text-slate-300" : "text-slate-700"}`}>
                            {cell.locked ? "—" : `${f0(cell.target)} (${cell.acwr.toFixed(2)})`}
                            {act && (act.actual > 0 || act.target > 0) && !cell.locked && (
                              <span className={`ml-1 ${act.status === "over" ? "text-rose-600" : act.status === "under" ? "text-slate-400" : "text-emerald-600"}`}>· {f0(act.actual)}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-2 text-[10px] text-slate-400">{is ? "Markmið (ACWR) · raunálag. ACWR = bráða:krónískt álag (Gabbett/Williams) — lýsir stökk-stærð, ekki meiðsla-spá. Reglur reikna." : "target (ACWR) · actual. ACWR = acute:chronic workload (Gabbett/Williams) — a spike-size descriptor, not an injury predictor. Rules compute."}</div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

/** One explainability row: term + evidence citation + plain-language meaning. */
function MethodRow({ term, body, cite }: { term: string; body: string; cite: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="text-[13px] font-semibold text-slate-800">{term}</span>
        {cite && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500">{cite}</span>}
      </div>
      <p className="mt-0.5 text-[12px] leading-snug text-slate-600">{body}</p>
    </div>
  );
}

function QualityCard({ w, floor, ceiling, actual, onOverride, is }: { w: WeekTarget; floor: number; ceiling: number; actual?: AdherenceCell; onOverride: (quality: Quality, week: number, from: number, to: number, reason: string) => Promise<void>; is: boolean }) {
  const label = is ? LABEL[w.quality].is : LABEL[w.quality].en;
  const acwrColor = w.acwr > 1.3 ? "bg-red-100 text-red-700" : w.acwr >= 0.8 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600";
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(String(Math.round(w.target)));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const to = Number(target);
    if (!Number.isFinite(to) || to < 0 || !reason.trim()) return;
    setBusy(true);
    try { await onOverride(w.quality, w.week, w.target, to, reason.trim()); setEditing(false); setReason(""); }
    finally { setBusy(false); }
  }

  return (
    <div className={`rounded-xl border p-3 shadow-sm ${w.overridden ? "border-violet-200 bg-violet-50/40" : w.locked ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          {label}
          {w.caution && <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-orange-700" title={is ? "Lykil-endurmeiðsla-gæði fyrir þetta meiðsli — hægari aðlögun" : "Key re-injury quality for this injury — slower ramp"}>{is ? "gát" : "caution"}</span>}
          {w.overridden && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-700" title={w.overrideReason}>{is ? "aðlagað" : "adjusted"}</span>}
        </div>
        {w.locked ? (
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{is ? `læst · vika ${w.unlockWeek}` : `hold · wk ${w.unlockWeek}`}</span>
        ) : (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${acwrColor}`} title={is ? "Bráða:krónískt álag (Gabbett 2017) — lýsir stökk-stærð vikunnar, ekki meiðsla-spá." : "Acute:chronic workload (Gabbett 2017) — describes the week's spike size, not an injury prediction."}>ACWR {w.acwr.toFixed(2)}</span>
        )}
      </div>
      {!w.locked && ceiling <= 0 ? (
        <p className="mt-1 text-[11px] text-slate-400">{is ? "Engin heilbrigð grunnlína fyrir þessa breytu (t.d. ekkert IMA)." : "No healthy baseline for this quality (e.g. no IMA captured)."}</p>
      ) : !w.locked ? (
        <>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums text-slate-900">{f0(w.target)}</span>
            <span className="text-xs text-slate-400">{LABEL[w.quality].unit}</span>
            <span className="ml-auto text-[11px] text-slate-500">{is ? "af" : "of"} {f0(ceiling)} ({w.pctOfHealthy}%)</span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">{w.why}</p>
          <div className="mt-1 text-[10px] text-slate-400">{is ? "núna" : "now"} {f0(floor)} → {f0(w.target)}{w.wow ? ` · ${w.wow > 0 ? "+" : ""}${w.wow}%` : ""}</div>
          {actual && (actual.actual > 0 || actual.target > 0) && (
            <div className="mt-1.5 flex items-center gap-1.5 border-t border-slate-100 pt-1.5 text-[11px]">
              <span className="text-slate-400">{is ? "raun" : "actual"}</span>
              <span className="font-semibold tabular-nums text-slate-800">{f0(actual.actual)}</span>
              <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${actual.status === "over" ? "bg-rose-100 text-rose-700" : actual.status === "under" ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"}`}>
                {actual.status === "over" ? (is ? "yfir" : "over") : actual.status === "under" ? (is ? "undir" : "under") : (is ? "á áætlun" : "on plan")} {actual.deltaPct > 0 ? "+" : ""}{actual.deltaPct}%
              </span>
            </div>
          )}
          {w.overridden && w.overrideReason && (
            <p className="mt-1.5 border-t border-violet-100 pt-1.5 text-[10px] text-violet-700">{is ? "Aðlögun þjálfara" : "Coach adjustment"}: {w.overrideReason}</p>
          )}
          {editing ? (
            <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
              <div className="flex items-center gap-1.5">
                <input type="number" value={target} onChange={(e) => setTarget(e.target.value)} className="h-7 w-24 rounded border border-slate-300 px-2 text-xs tabular-nums" aria-label={is ? "Nýtt markmið" : "New target"} />
                <span className="text-[10px] text-slate-400">{LABEL[w.quality].unit || (is ? "markmið" : "target")}</span>
              </div>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={is ? "Ástæða (skráð)…" : "Reason (logged)…"} className="h-7 w-full rounded border border-slate-300 px-2 text-xs" />
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={submit} disabled={busy || !reason.trim()} className="rounded bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-violet-700 disabled:opacity-40">{busy ? "…" : (is ? "Vista" : "Save")}</button>
                <button type="button" onClick={() => { setEditing(false); setReason(""); setTarget(String(Math.round(w.target))); }} className="text-[11px] text-slate-500 hover:text-slate-700">{is ? "Hætta við" : "Cancel"}</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="mt-1.5 text-[10px] font-semibold text-violet-600 hover:text-violet-800">{is ? "Aðlaga markmið" : "Adjust target"}</button>
          )}
        </>
      ) : (
        <p className="mt-1 text-[11px] leading-snug text-slate-500">{w.why}</p>
      )}
    </div>
  );
}

/** Actual vs recommended for one quality this week — a bar filled to actual/target. */
function AdherenceBar({ c, inProgress, is }: { c: AdherenceCell; inProgress: boolean; is: boolean }) {
  const label = is ? LABEL[c.quality].is : LABEL[c.quality].en;
  const pct = c.target > 0 ? Math.min(140, Math.round((c.actual / c.target) * 100)) : c.actual > 0 ? 140 : 0;
  // "under" is sky (in-progress / accumulating — not a problem mid-week), "on"
  // emerald, "over" rose. Three distinct, high-contrast hues so the fill always
  // reads against the track.
  const color = c.status === "over" ? "bg-rose-500" : c.status === "under" ? "bg-sky-500" : "bg-emerald-500";
  const fillWidth = c.actual > 0 ? Math.max(4, Math.min(100, pct)) : 0; // keep a visible sliver for tiny values
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="truncate font-medium text-slate-600" title={label}>{label}</span>
        <span className="tabular-nums text-slate-500">{f0(c.actual)} / {f0(c.target)}</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200">
        <div className={`h-full rounded-full ${color} transition-[width]`} style={{ width: `${fillWidth}%` }} />
      </div>
      <div className="mt-0.5 text-right text-[10px] text-slate-400">
        {c.target > 0 ? <>{c.deltaPct > 0 ? "+" : ""}{c.deltaPct}% {inProgress && c.status === "under" ? (is ? "hingað til" : "so far") : ""}</> : (is ? "engin viðmiðun" : "no target")}
      </div>
    </div>
  );
}

/** Compact injury-shaded timeline: distance bars + top-speed line (pure SVG). */
function Timeline({ history, windows, showMatches }: { history: Session[]; windows: Win[]; showMatches: boolean }) {
  const rows = history.filter((s) => showMatches || !s.isMatch);
  if (!rows.length) return <div className="py-8 text-center text-xs text-slate-400">No sessions</div>;
  const W = 900, H = 180, padL = 8, padR = 8, padT = 8, padB = 18;
  const innerW = W - padL - padR;
  const DAY = 86400000;
  const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const firstD = rows[0].date, lastD = rows[rows.length - 1].date;
  const t0 = ms(firstD), t1 = Math.max(ms(lastD), t0 + DAY);
  const span = t1 - t0;
  // Position by CALENDAR DATE, not session index — so a no-training layoff shows
  // as a real gap instead of collapsing to nothing.
  const x = (d: string) => padL + ((ms(d) - t0) / span) * innerW;
  const bw = Math.max(2, Math.min(10, innerW / (span / DAY) - 0.5));
  const maxDist = Math.max(1, ...rows.map((s) => s.distance));
  const maxSpeed = Math.max(1, ...rows.map((s) => s.topSpeed));
  const yD = (v: number) => H - padB - (v / maxDist) * (H - padT - padB);
  const yS = (v: number) => H - padB - (v / maxSpeed) * (H - padT - padB);

  // Injury windows as shaded background bands (clipped to the data range).
  const bands = windows
    .map((w) => { const s = w.start > firstD ? w.start : firstD; const e = w.end < lastD ? w.end : lastD; return s <= e ? { s, e } : null; })
    .filter((b): b is { s: string; e: string } => b !== null);

  // Top-speed line, broken across gaps > 10 days so it doesn't bridge the layoff.
  const segs: string[][] = [];
  let cur: string[] = [];
  rows.forEach((s, i) => {
    if (i > 0 && (ms(s.date) - ms(rows[i - 1].date)) / DAY > 10) { if (cur.length) segs.push(cur); cur = []; }
    cur.push(`${x(s.date).toFixed(1)},${(s.topSpeed > 0 ? yS(s.topSpeed) : H - padB).toFixed(1)}`);
  });
  if (cur.length) segs.push(cur);

  // Calendar month ticks.
  const ticks: string[] = [];
  const dt = new Date(t0); dt.setUTCDate(1);
  while (dt.getTime() <= t1) { const iso = dt.toISOString().slice(0, 10); if (ms(iso) >= t0) ticks.push(iso); dt.setUTCMonth(dt.getUTCMonth() + 1); }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
      {bands.map((b, i) => (
        <rect key={"b" + i} x={x(b.s)} y={padT} width={Math.max(1, x(b.e) - x(b.s))} height={H - padT - padB} fill="#d68e77" opacity={0.18} />
      ))}
      {rows.map((s, i) => {
        const injured = bands.some((b) => s.date >= b.s && s.date <= b.e);
        const fill = s.estimated ? "#de9328" : injured ? "#d68e77" : s.isMatch ? "#c4b5fd" : "#a9a493";
        return <rect key={s.date + i} x={x(s.date) - bw / 2} y={yD(s.distance)} width={bw} height={Math.max(0, H - padB - yD(s.distance))} fill={fill} rx={1} />;
      })}
      {segs.map((pts, i) => <polyline key={"sp" + i} points={pts.join(" ")} fill="none" stroke="#0ea5e9" strokeWidth={1.5} />)}
      {ticks.map((d, i) => <text key={"t" + i} x={x(d)} y={H - 4} fontSize={9} fill="#a9a493">{d.slice(5)}</text>)}
    </svg>
  );
}
