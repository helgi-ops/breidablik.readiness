"use client";

/**
 * Coach view — Adductor-related groin pain: criteria-based staged loading.
 *
 * Sibling of the Jumper's Knee / Achilles modules, sharing the tab shell,
 * Silbernagel pain gate, collagen adjunct and Stage-3 symmetry gate
 * (src/components/rehab/tendonLoading.tsx). Adductor-specific:
 *   • Doha-agreement classification (confirm adductor-related; rule out
 *     iliopsoas / inguinal / pubic / hip-related groin pain).
 *   • Isometric squeeze -> Copenhagen Adduction + HSR -> energy-storage /
 *     change-of-direction -> return to sport (cutting + kicking).
 *   • HAGOS outcome; adductor squeeze test as the daily marker.
 *   • Stage 3 gate = adductor squeeze LSI + adduction:abduction ratio ≥ 90%.
 *
 * EDUCATIONAL protocol reference — progression decisions belong to the treating
 * clinician. Clinical doses in English; the shell is bilingual IS/EN. Nothing
 * here touches the readiness verdict/colour.
 *
 * Sources (research/ + literature): Hölmich 1999 (active-training RCT),
 * Copenhagen Adduction (Serner/Harøy), squeeze test + HAGOS (Thorborg),
 * adduction:abduction ratio (Tyler), Doha agreement (Weir 2015), control-chaos.
 */

import React from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang";
import { supabase } from "@/lib/supabaseClient";
import SendProtocolToPlayerButton from "@/components/recovery/SendProtocolToPlayerButton";
import { ExerciseTable, PainGate, CollagenSupport, LsiGate, type Row, type Reported } from "@/components/rehab/tendonLoading";

const BREIDABLIK_TEAM_ID = "94b52a06-0b83-48da-8664-639ec3486a0c";

const PROVOCATION_FULL = { en: "Adductor squeeze test", is: "Aðleiðara-kreistupróf" };
const PROVOCATION_SHORT = { en: "squeeze pain", is: "kreistu verkur" };
const SQUEEZE_LSI = { en: "Squeeze LSI", is: "Kreistu LSI" };
const ADD_ABD = { en: "Adduction:abduction %", is: "Aðleiðsla:fráleiðsla %" };
const LSI_HINT = { en: "involved ÷ uninvolved × 100 · ratio as %", is: "meidd ÷ heilbrigð × 100 · hlutfall sem %" };

type Tab = "overview" | "s1" | "s2" | "s3" | "s4" | "testing" | "videos";

const S1: Row[] = [
  { ex: "Isometric ball/cushion squeeze — supine, short lever (knees bent 90°) → long lever (knees extended)", dose: "5 × 30–45 s · 2–3×/day", notes: "Submaximal → progressive. Start short-lever when very irritable; progress to long-lever. Acceptable pain (≤5/10). This doubles as the daily squeeze test." },
  { ex: "Non-provocative strength — posterior chain, trunk, uninjured side", dose: "normal load", notes: "Keep training everything that doesn't provoke the groin. Don't detrain the rest of the body." },
  { ex: "Bike / cross-trainer", dose: "15–30 min easy", notes: "Maintain aerobic base, pain-free only." },
];
const S2: Row[] = [
  { ex: "Copenhagen Adduction progression — short lever (knee on bench) → long lever (foot on bench) → full", dose: "3 sets · progressive reps & range", notes: "3×/week on alternate days. High adductor EMG; control the lower-down (eccentric)." },
  { ex: "HSR hip adduction (cable / machine / band) — standing + side-lying", dose: "3–4 sets · slow 6 s tempo (3 s in / 3 s out)", notes: "Progressive load: 15RM → 6RM over ~8–12 weeks." },
  { ex: "Minimum programme length", dose: "~8–12 weeks", notes: "Adductor loading takes time (Hölmich program ran ~8–12 wk). Morning soreness is the key day-to-day marker." },
];
const S3: Row[] = [
  { ex: "Lateral bounds → skater hops → deceleration → controlled change of direction", dose: "progressive · every 2nd–3rd day", notes: "Low → high demand. Land soft and control the plant leg. Respect recovery between sessions." },
  { ex: "Track adductor squeeze strength symmetry + change-of-direction tolerance", dose: "monitor", notes: "Progress by squeeze symmetry, not by feel." },
];
const S4: Row[] = [
  { ex: "Graded kicking progression (short → long, controlled → match intensity)", dose: "graded", notes: "Kicking is a large adductor demand in football — build volume then intensity." },
  { ex: "Control → chaos cutting & repeated-effort work", dose: "graded return to full training", notes: "Low → high speed and volume. Reduced minutes first, building over 2–3 weeks." },
];

const CITATIONS: { label: string; source: string }[] = [
  { label: "Hölmich et al. 1999 — Active physical training for long-standing adductor-related groin pain (RCT)", source: "Lancet" },
  { label: "Serner / Harøy 2019 — Copenhagen Adduction (adductor strengthening & groin-injury prevention)", source: "Br J Sports Med" },
  { label: "Thorborg et al. — Adductor squeeze test + HAGOS (Copenhagen Hip & Groin Outcome Score)", source: "Br J Sports Med" },
  { label: "Tyler et al. — Adduction:abduction strength ratio and groin-injury risk", source: "Am J Sports Med" },
  { label: "Weir et al. — Doha agreement on terminology for groin pain in athletes", source: "Br J Sports Med 2015" },
  { label: "Baar 2019 / Shaw et al. 2017 — Load timing + collagen synthesis nutrition (adjunct)", source: "Sports Med / Am J Clin Nutr" },
];

type InjuryRow = { id: string; injury_type: string; severity: string; status: string; injury_date: string; notes: string | null };

const TABS: { id: Tab; en: string; is: string }[] = [
  { id: "overview", en: "Overview", is: "Yfirlit" },
  { id: "s1", en: "Stage 1 · Isometric", is: "Fasi 1 · Ísómetrísk" },
  { id: "s2", en: "Stage 2 · Copenhagen / HSR", is: "Fasi 2 · Copenhagen / HSR" },
  { id: "s3", en: "Stage 3 · Energy storage", is: "Fasi 3 · Orkugeymsla" },
  { id: "s4", en: "Stage 4 · Return to sport", is: "Fasi 4 · Aftur í íþrótt" },
  { id: "testing", en: "Testing", is: "Próf" },
  { id: "videos", en: "Technique", is: "Tækni" },
];

export default function AdductorGroinPage() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const [tab, setTab] = React.useState<Tab>("overview");
  const [allowed, setAllowed] = React.useState<boolean | null>(null);

  const [players, setPlayers] = React.useState<{ id: string; full_name: string | null }[]>([]);
  const [playerId, setPlayerId] = React.useState("");
  const [userId, setUserId] = React.useState<string | null>(null);
  const [teamId, setTeamId] = React.useState<string | null>(null);
  const [checkins, setCheckins] = React.useState<{ entry_date: string; provocation_vas: number | null; morning_stiffness_vas: number | null }[]>([]);

  // Stage 3 gate — coach-entered squeeze LSI + adduction:abduction ratio (%).
  const [squeezeLsi, setSqueezeLsi] = React.useState<number | null>(null);
  const [addAbd, setAddAbd] = React.useState<number | null>(null);

  const [injury, setInjury] = React.useState<InjuryRow | null>(null);
  const [injurySeverity, setInjurySeverity] = React.useState<"mild" | "moderate" | "severe">("moderate");
  const [injurySide, setInjurySide] = React.useState<"left" | "right" | "both">("left");
  const [injuryStage, setInjuryStage] = React.useState(1);
  const [injuryBusy, setInjuryBusy] = React.useState(false);
  const [injuryMsg, setInjuryMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (active) setAllowed(false); return; }
      const { data } = await supabase.from("profiles").select("team_id").eq("id", user.id).maybeSingle();
      const tid = (data as { team_id?: string } | null)?.team_id ?? null;
      if (!active) return;
      setUserId(user.id);
      setTeamId(tid);
      const ok = tid === BREIDABLIK_TEAM_ID;
      setAllowed(ok);
      if (ok) {
        const { data: roster } = await supabase
          .from("players").select("id, full_name")
          .eq("team_id", tid).eq("is_active", true).order("full_name");
        if (active) setPlayers((roster ?? []) as { id: string; full_name: string | null }[]);
      }
    })();
    return () => { active = false; };
  }, []);

  React.useEffect(() => {
    if (!playerId) { setCheckins([]); return; }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("tendon_checkins")
        .select("entry_date, provocation_vas, morning_stiffness_vas")
        .eq("player_id", playerId)
        .eq("region", "adductor")
        .order("entry_date", { ascending: false })
        .limit(21);
      if (active) setCheckins((data ?? []) as { entry_date: string; provocation_vas: number | null; morning_stiffness_vas: number | null }[]);
    })();
    return () => { active = false; };
  }, [playerId]);

  const reported = React.useMemo<Reported>(() => {
    if (!playerId || checkins.length === 0) return null;
    const latest = checkins[0];
    const stiff = checkins.filter((c) => c.morning_stiffness_vas != null).map((c) => c.morning_stiffness_vas as number);
    const recent = stiff.slice(0, 7);
    const prior = stiff.slice(7, 14);
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    let trend: "lower" | "same" | "higher" | null = null;
    if (recent.length && prior.length) {
      const d = mean(recent) - mean(prior);
      trend = d > 0.5 ? "higher" : d < -0.5 ? "lower" : "same";
    }
    return { provocationVas: latest.provocation_vas, stiffnessVas: latest.morning_stiffness_vas, trend, date: latest.entry_date };
  }, [playerId, checkins]);

  const loadInjury = React.useCallback(async (pid: string) => {
    const { data } = await supabase
      .from("player_injuries")
      .select("id, injury_type, severity, status, injury_date, notes")
      .eq("player_id", pid)
      .neq("status", "cleared")
      .or("injury_type.ilike.%adductor%,injury_type.ilike.%groin%")
      .order("injury_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = (data as InjuryRow | null) ?? null;
    setInjury(row);
    const m = row?.notes?.match(/Stage\s*(\d)/i);
    if (m) setInjuryStage(Number(m[1]));
  }, []);

  React.useEffect(() => {
    if (!playerId) { setInjury(null); setInjuryMsg(null); return; }
    loadInjury(playerId);
  }, [playerId, loadInjury]);

  const flagInjury = async () => {
    if (!playerId || !teamId) return;
    if (!window.confirm(isEN ? `Flag ${selectedName ?? "this player"} as managing adductor-related groin pain (${injurySide})?` : `Merkja ${selectedName ?? "þennan leikmann"} sem með aðleiðara-nárasverk (${injurySide})?`)) return;
    setInjuryBusy(true); setInjuryMsg(null);
    const { error } = await supabase.from("player_injuries").insert({
      player_id: playerId,
      team_id: teamId,
      injury_date: new Date().toISOString().slice(0, 10),
      body_part: "Groin",
      injury_type: "Adductor-related groin pain",
      severity: injurySeverity,
      status: "injured",
      rtp_stage: 0,
      notes: `Adductor staged loading — ${injurySide} · Stage ${injuryStage}`,
      recorded_by: userId,
    });
    setInjuryBusy(false);
    if (error) { setInjuryMsg(error.message); return; }
    setInjuryMsg(isEN ? "Flagged ✓" : "Merkt ✓");
    await loadInjury(playerId);
  };

  const updateStage = async (stage: number) => {
    if (!injury) return;
    setInjuryBusy(true); setInjuryMsg(null);
    const base = injury.notes?.replace(/\s*·?\s*Stage\s*\d/i, "") ?? `Adductor staged loading — ${injurySide}`;
    const { error } = await supabase.from("player_injuries")
      .update({ notes: `${base} · Stage ${stage}`, updated_at: new Date().toISOString() })
      .eq("id", injury.id);
    setInjuryBusy(false);
    if (error) { setInjuryMsg(error.message); return; }
    setInjuryStage(stage);
    await loadInjury(playerId);
  };

  const clearInjury = async () => {
    if (!injury) return;
    if (!window.confirm(isEN ? "Mark this groin flag as cleared?" : "Merkja þetta nára-flagg sem uppgert?")) return;
    setInjuryBusy(true); setInjuryMsg(null);
    const { error } = await supabase.from("player_injuries")
      .update({ status: "cleared", actual_return_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() })
      .eq("id", injury.id);
    setInjuryBusy(false);
    if (error) { setInjuryMsg(error.message); return; }
    setInjuryMsg(isEN ? "Cleared ✓" : "Uppgert ✓");
    await loadInjury(playerId);
  };

  if (allowed === null) {
    return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-500">{isEN ? "Loading…" : "Sæki…"}</div>;
  }
  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-slate-900">{isEN ? "Not available for this team" : "Ekki í boði fyrir þetta lið"}</h1>
        <p className="mt-2 text-sm text-slate-600">{isEN ? "This rehab protocol is configured for Breiðablik only." : "Þetta endurhæfingar-prótókoll er stillt fyrir Breiðablik eingöngu."}</p>
        <Link href="/coach" className="mt-4 inline-block text-sm text-primary hover:underline">← {isEN ? "Back to dashboard" : "Til baka á mælaborð"}</Link>
      </div>
    );
  }

  const selectedName = players.find((p) => p.id === playerId)?.full_name ?? null;
  const lsiMetrics = [
    { label: SQUEEZE_LSI, value: squeezeLsi, onChange: setSqueezeLsi },
    { label: ADD_ABD, value: addAbd, onChange: setAddAbd },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Link href="/coach" className="hover:text-slate-700">Coach</Link>
        <span>›</span>
        <span>{isEN ? "Injury / RTP" : "Meiðsli / RTP"}</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">
          {isEN ? "Adductor-Related Groin — Staged Loading" : "Aðleiðara-nári — Þrepaskipt álag"}
        </h1>
        <SendProtocolToPlayerButton slug="adductor_related_groin_staged_loading" lang={isEN ? "EN" : "IS"} />
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        {isEN
          ? "Criteria-based, pain-monitored staged loading for adductor-related groin pain. The groin responds to progressive adductor load — the fix is the right dose at the right stage, with pain allowed but bounded."
          : "Viðmiðuð, verkja-vöktuð þrepaskipt hleðsla fyrir aðleiðara-nárasverk. Nárinn bregst við stigvaxandi aðleiðara-álagi — lausnin er réttur skammtur á réttum fasa, með verk sem er leyfður en innan marka."}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {isEN ? "Sources: " : "Heimildir: "}
        Hölmich 1999 (active-training RCT) · Copenhagen Adduction (Serner/Harøy) · squeeze test + HAGOS (Thorborg) · Doha agreement (Weir 2015)
      </p>

      {/* Medical disclaimer */}
      <div className="mt-4 rounded-lg border-l-4 border-red-400 bg-red-50 p-4 text-sm text-slate-700">
        <b className="text-red-700">{isEN ? "Read first: " : "Lestu fyrst: "}</b>
        {isEN
          ? "Educational protocol reference — not medical advice. Confirm the entity first (below): groin pain has several sources and adductor-related is only one. Rule out a hernia, hip joint / FAI, and stress fractures. Progression is criteria-based, never calendar-based; every recommendation is overridable and belongs to the treating clinician."
          : "Fræðslu-prótókoll — ekki læknisráð. Staðfestu greininguna fyrst (að neðan): nárasverkur á sér margar orsakir og aðleiðara-tengt er aðeins ein. Útiloka kviðslit, mjaðmarlið / FAI og álagsbrot. Framgangur er viðmiðaður, aldrei dagatals; sérhver ábending er yfirtakanleg og tilheyrir meðhöndlandi klíníker."}
      </div>

      {/* Doha classification note */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{isEN ? "Classify first (Doha agreement)" : "Flokkaðu fyrst (Doha)"}</div>
        <p className="mt-1 text-sm text-slate-600">
          {isEN
            ? "This module is for adductor-related groin pain: tenderness at the adductor origin AND pain on resisted adduction (the squeeze test). Rule out the other Doha entities — iliopsoas-, inguinal-, pubic- and hip-related groin pain — which load differently."
            : "Þessi módúll er fyrir aðleiðara-tengdan nárasverk: eymsli við aðleiðara-festu OG verkur við mótstöðu-aðleiðslu (kreistuprófið). Útiloka aðrar Doha-greiningar — iliopsoas-, inguinal-, pubic- og mjaðma-tengdan nárasverk — sem hlaðast öðruvísi."}
        </p>
      </div>

      {/* Player context */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{isEN ? "Player (optional)" : "Leikmaður (valfrjálst)"}</span>
        <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">{isEN ? "— none —" : "— enginn —"}</option>
          {players.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? "—"}</option>)}
        </select>
        <span className="text-xs text-slate-500">{isEN ? "Pick a player to flag the injury and read their daily squeeze check-in." : "Veldu leikmann til að merkja meiðslið og lesa daglega kreistu-skráningu."}</span>
      </div>

      {/* Injury flag */}
      {playerId && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{isEN ? "Injury flag" : "Meiðsla-flagg"}</div>
          {injury ? (
            <div className="mt-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">{isEN ? "Managing" : "Í meðferð:"} {injury.injury_type}</span>
                <span className="text-xs text-slate-500">{isEN ? "since" : "síðan"} {injury.injury_date} · {injury.severity}</span>
              </div>
              {injury.notes && <p className="mt-1 text-xs text-slate-500">{injury.notes}</p>}
              <p className="mt-1 text-xs text-slate-500">{isEN ? "Appears on RTP / Return-to-training surfaces. A clinical flag — it does not change the readiness colour." : "Birtist á RTP / Aftur-í-æfingar flötum. Klínískt flagg — það breytir ekki readiness-litnum."}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="text-xs text-slate-600">{isEN ? "Active stage" : "Virkur fasi"}
                  <select value={injuryStage} onChange={(e) => updateStage(Number(e.target.value))} disabled={injuryBusy} className="ml-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
                    {[1, 2, 3, 4].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <button type="button" onClick={clearInjury} disabled={injuryBusy} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{isEN ? "Mark cleared" : "Merkja uppgert"}</button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-end gap-3 text-sm">
              <label className="text-xs text-slate-600">{isEN ? "Side" : "Hlið"}
                <select value={injurySide} onChange={(e) => setInjurySide(e.target.value as "left" | "right" | "both")} className="ml-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
                  <option value="left">{isEN ? "Left" : "Vinstri"}</option>
                  <option value="right">{isEN ? "Right" : "Hægri"}</option>
                  <option value="both">{isEN ? "Both" : "Báðar"}</option>
                </select>
              </label>
              <label className="text-xs text-slate-600">{isEN ? "Severity" : "Alvarleiki"}
                <select value={injurySeverity} onChange={(e) => setInjurySeverity(e.target.value as "mild" | "moderate" | "severe")} className="ml-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
                  <option value="mild">{isEN ? "Mild" : "Vægt"}</option>
                  <option value="moderate">{isEN ? "Moderate" : "Miðlungs"}</option>
                  <option value="severe">{isEN ? "Severe" : "Alvarlegt"}</option>
                </select>
              </label>
              <label className="text-xs text-slate-600">{isEN ? "Starting stage" : "Byrjunar-fasi"}
                <select value={injuryStage} onChange={(e) => setInjuryStage(Number(e.target.value))} className="ml-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
                  {[1, 2, 3, 4].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <button type="button" onClick={flagInjury} disabled={injuryBusy} className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                {injuryBusy ? (isEN ? "Saving…" : "Vista…") : (isEN ? "Flag as adductor-related groin pain" : "Merkja sem aðleiðara-nárasverk")}
              </button>
            </div>
          )}
          {injuryMsg && <div className="mt-1.5 text-xs text-slate-600">{injuryMsg}</div>}
        </div>
      )}

      {/* Tabs */}
      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${tab === t.id ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-violet-400"}`}>
            {isEN ? t.en : t.is}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className="space-y-5">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "The model" : "Líkanið"}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {isEN
                  ? "Four staged loading phases for the adductors. Progression is criteria-based (pain within limits + squeeze symmetry), never the calendar. Built on the Hölmich active-training RCT and the Copenhagen Adduction."
                  : "Fjórir hleðslufasar fyrir aðleiðara. Framgangur er viðmiðaður (verkur innan marka + kreistu-samhverfa), aldrei dagatalið. Byggt á Hölmich active-training RCT og Copenhagen Adduction."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { id: "s1" as Tab, t: isEN ? "1 · Isometric squeeze" : "1 · Ísómetrísk kreista", s: isEN ? "pain relief + load tolerance" : "verkjastilling + þol" },
                { id: "s2" as Tab, t: isEN ? "2 · Copenhagen / HSR" : "2 · Copenhagen / HSR", s: isEN ? "remodeling (~8–12 wk)" : "endurmótun (~8–12 vk)" },
                { id: "s3" as Tab, t: isEN ? "3 · Energy storage" : "3 · Orkugeymsla", s: isEN ? "CoD — squeeze LSI ≥ 90%" : "CoD — kreistu LSI ≥ 90%" },
                { id: "s4" as Tab, t: isEN ? "4 · Return to sport" : "4 · Aftur í íþrótt", s: isEN ? "cutting + kicking" : "skurðir + spörk" },
              ].map((p) => (
                <button key={p.id} onClick={() => setTab(p.id)} className="rounded-lg border border-slate-200 border-t-4 border-t-violet-500 bg-white p-3 text-left transition-transform hover:-translate-y-0.5 hover:border-violet-400">
                  <b className="block text-sm text-slate-900">{p.t}</b>
                  <span className="text-xs text-slate-500">{p.s}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { h: isEN ? "The squeeze test is the marker" : "Kreistuprófið er mælikvarðinn", b: isEN ? "Adductor squeeze (ball between the knees or ankles) is both the daily provocation test and a strength measure. Track its pain and its symmetry." : "Aðleiðara-kreista (bolti milli hnjáa eða ökkla) er bæði daglega provokations-prófið og styrktarmæling. Fylgstu með verk og samhverfu." },
                { h: isEN ? "Pain is allowed — within limits" : "Verkur er leyfður — innan marka", b: isEN ? "Continued training is safe up to 5/10 pain that settles by the next morning. Rest deconditions the adductors." : "Áframhaldandi æfing er örugg upp að 5/10 verk sem sjatnar fyrir næsta morgun. Hvíld afþjálfar aðleiðara." },
                { h: isEN ? "Symmetry unlocks the spring" : "Samhverfa opnar fjöðrunina", b: isEN ? "Stage 3 change-of-direction waits for adductor squeeze LSI ≥ 90% and an adduction:abduction ratio near 1.0." : "Fasi 3 (stefnubreytingar) bíður eftir aðleiðara-kreistu LSI ≥ 90% og aðleiðslu:fráleiðslu hlutfalli nálægt 1.0." },
                { h: isEN ? "Track HAGOS weekly" : "Fylgstu með HAGOS vikulega", b: isEN ? "The Copenhagen Hip & Groin Outcome Score (0–100, higher = better) — the groin outcome measure and the 'are we winning?' number." : "Copenhagen Hip & Groin Outcome Score (0–100, hærra = betra) — nára-útkomu-mælikvarðinn og 'erum við að vinna?' talan." },
              ].map((c, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-violet-700">{c.h}</h3>
                  <p className="mt-1 text-sm text-slate-600">{c.b}</p>
                </div>
              ))}
            </div>

            <CollagenSupport isEN={isEN} />

            <div className="rounded-lg border-l-4 border-violet-400 bg-violet-50/50 p-4 text-sm text-slate-600">
              {isEN
                ? "This screen is descriptive — the injury stage and pain scores never move the player's green/amber/red readiness colour. Rehab load still flows into load/RPE as usual; the injury stage is its own labelled signal."
                : "Þetta skjár er lýsandi — meiðsla-fasinn og verkja-skorin hreyfa aldrei græna/gula/rauða readiness-litinn. Endurhæfingar-álag flæðir enn í álag/RPE eins og venjulega; meiðsla-fasinn er sitt eigið merkta merki."}
            </div>
          </div>
        )}

        {/* ── STAGE 1 ── */}
        {tab === "s1" && (
          <div className="space-y-4">
            <StageHead isEN={isEN} title={isEN ? "Stage 1 — Isometric adduction" : "Fasi 1 — Ísómetrísk aðleiðsla"} tag={isEN ? "pain relief + load tolerance" : "verkjastilling + þol"}
              goal={isEN ? "settle an irritable groin and build load tolerance. Isometric adduction gives an analgesic window, activates the adductors and starts loading." : "róa pirraðan nára og byggja upp þol. Ísómetrísk aðleiðsla gefur verkja-glugga, virkjar aðleiðara og byrjar hleðslu."} />
            <ExerciseTable rows={S1} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: Hölmich (isometric adduction) + squeeze test (Thorborg/Serner)." : "Heimild: Hölmich (ísómetrísk aðleiðsla) + kreistupróf (Thorborg/Serner)."}</p>
            <PainGate isEN={isEN} reported={reported} provocationFull={PROVOCATION_FULL} provocationShort={PROVOCATION_SHORT} />
          </div>
        )}

        {/* ── STAGE 2 ── */}
        {tab === "s2" && (
          <div className="space-y-4">
            <StageHead isEN={isEN} title={isEN ? "Stage 2 — Copenhagen Adduction + HSR" : "Fasi 2 — Copenhagen Adduction + HSR"} tag={isEN ? "the core — ~8–12 weeks" : "kjarninn — ~8–12 vikur"}
              goal={isEN ? "remodel the adductors with the Copenhagen Adduction (high EMG, eccentric-biased) plus heavy slow resistance. Both build strength through range." : "endurmóta aðleiðara með Copenhagen Adduction (hátt EMG, eccentric) auk þungrar hægrar mótstöðu. Bæði byggja styrk gegnum ferilinn."} />
            <ExerciseTable rows={S2} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: Hölmich 1999 (RCT) + Copenhagen Adduction (Serner/Harøy/Ishøi)." : "Heimild: Hölmich 1999 (RCT) + Copenhagen Adduction (Serner/Harøy/Ishøi)."}</p>
            <PainGate isEN={isEN} reported={reported} provocationFull={PROVOCATION_FULL} provocationShort={PROVOCATION_SHORT} />
          </div>
        )}

        {/* ── STAGE 3 ── (LSI gated) */}
        {tab === "s3" && (
          <div className="space-y-4">
            <StageHead isEN={isEN} title={isEN ? "Stage 3 — Energy-storage / change-of-direction" : "Fasi 3 — Orkugeymsla / stefnubreytingar"} tag={isEN ? "reintroduce the spring" : "endurvekja fjöðrunina"}
              goal={isEN ? "reload reactive change-of-direction — only once pain is controlled at Stage 2 loads and squeeze symmetry is restored." : "endurhlaða viðbragðs-stefnubreytingar — aðeins þegar verkur er í skefjum við Fasa 2 og kreistu-samhverfa er endurheimt."} />
            <LsiGate isEN={isEN} unitHint={LSI_HINT} metrics={lsiMetrics} />
            <ExerciseTable rows={S3} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: change-of-direction progression + adduction:abduction ratio (Tyler)." : "Heimild: stefnubreytinga-framgangur + aðleiðslu:fráleiðslu hlutfall (Tyler)."}</p>
            <PainGate isEN={isEN} reported={reported} provocationFull={PROVOCATION_FULL} provocationShort={PROVOCATION_SHORT} />
          </div>
        )}

        {/* ── STAGE 4 ── */}
        {tab === "s4" && (
          <div className="space-y-4">
            <StageHead isEN={isEN} title={isEN ? "Stage 4 — Return to sport (cutting & kicking)" : "Fasi 4 — Aftur í íþrótt (skurðir & spörk)"} tag={isEN ? "control → chaos" : "stýrt → óreiða"}
              goal={isEN ? "sport-specific cutting, deceleration and a graded kicking progression, back to full training along the control-chaos continuum." : "íþrótta-sértækir skurðir, hraðaminnkun og þrepað spark-prógramm, aftur í fullar æfingar eftir stýrða-óreiðu ásnum."} />
            <ExerciseTable rows={S4} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: control-chaos continuum + groin return-to-sport." : "Heimild: stýrða-óreiðu ásinn + nára return-to-sport."}</p>
            <PainGate isEN={isEN} reported={reported} provocationFull={PROVOCATION_FULL} provocationShort={PROVOCATION_SHORT} />
          </div>
        )}

        {/* ── TESTING ── */}
        {tab === "testing" && (
          <div className="space-y-4">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Testing & outcome tracking" : "Próf & útkomu-vöktun"}</h2>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-2">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">{isEN ? "Measure" : "Mæling"}</th>
                    <th className="px-3 py-2 font-semibold">{isEN ? "Cadence" : "Tíðni"}</th>
                    <th className="px-3 py-2 font-semibold">{isEN ? "What it tells you" : "Hvað það segir"}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { m: "HAGOS questionnaire (0–100)", c: isEN ? "weekly" : "vikulega", w: isEN ? "The Copenhagen Hip & Groin Outcome Score — higher = better. Track the trend: it's the 'are we winning?' number." : "Copenhagen Hip & Groin Outcome Score — hærra = betra. Fylgstu með þróun: 'erum við að vinna?' talan." },
                    { m: "Adductor squeeze pain (VAS 0–10)", c: isEN ? "daily" : "daglega", w: isEN ? "The standard daily provocation test. Feeds the pain-monitoring gate." : "Staðlaða daglega provokations-prófið. Fæðir verkja-vöktunar-hliðið." },
                    { m: "Morning soreness / stiffness", c: isEN ? "daily" : "daglega", w: isEN ? "Primary day-to-day marker — must not rise week to week." : "Aðal-daglegi mælikvarðinn — má ekki vaxa milli vikna." },
                    { m: "Adductor squeeze strength LSI + adduction:abduction ratio", c: isEN ? "before Stage 3, then monitoring" : "fyrir Fasa 3, svo vöktun", w: isEN ? "Objective symmetry gate: squeeze LSI ≥ 90% and ratio near 1.0 unlock change-of-direction loading." : "Hlutlægt samhverfu-hlið: kreistu LSI ≥ 90% og hlutfall nálægt 1.0 opna stefnubreytinga-hleðslu." },
                  ].map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-2 font-medium text-slate-900">{r.m}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">{r.c}</td>
                      <td className="px-3 py-2 text-slate-600">{r.w}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-violet-700">{isEN ? "Squeeze symmetry gate" : "Kreistu-samhverfu-hlið"}</h3>
              <div className="mt-2"><LsiGate isEN={isEN} unitHint={LSI_HINT} metrics={lsiMetrics} /></div>
            </div>
          </div>
        )}

        {/* ── TECHNIQUE ── */}
        {tab === "videos" && (
          <div className="space-y-3">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Technique cues" : "Tækni-punktar"}</h2>
            <p className="text-sm text-slate-600">{isEN ? "Key set-up cues per stage. The full evidence base lives in the club's research/ folder." : "Helstu uppsetningar-punktar per fasa. Öll sönnunar-gögnin eru í research/ möppu félagsins."}</p>
            {[
              { h: "Squeeze test / isometric (Stage 1)", b: isEN ? "Ball or fist between the knees (short lever) or ankles (long lever). Squeeze evenly, hold, breathe. Short lever first when very sore." : "Bolti eða hnefi milli hnjáa (stutt vogarstöng) eða ökkla (löng). Kreistu jafnt, haltu, andaðu. Stutt vogarstöng fyrst þegar mjög aumt." },
              { h: "Copenhagen Adduction (Stage 2)", b: isEN ? "Side plank with the top leg on a bench/partner; lift the bottom leg to meet it, lower slowly. Start knee-on-bench, progress to foot-on-bench." : "Hliðar-planki með efri fót á bekk/félaga; lyftu neðri fæti upp að honum, síga hægt niður. Byrjaðu hné-á-bekk, þróaðu í fót-á-bekk." },
              { h: "HSR tempo (Stage 2)", b: isEN ? "3 s in, 3 s out — 6 s per rep on cable/band adduction. Control both directions." : "3 s inn, 3 s út — 6 s per endurtekning á kaðli/teygju-aðleiðslu. Stýrðu báðum áttum." },
              { h: "Plant-leg control (Stage 3)", b: isEN ? "On skater hops / cuts, land soft with the knee tracking over the foot and the pelvis level — no collapse inward." : "Í skautahoppi / skurðum, lentu mjúkt með hné yfir fæti og mjaðmagrind í jafnvægi — ekkert innfall." },
              { h: "Kicking progression (Stage 4)", b: isEN ? "Short passes first, then longer, then match-intensity strikes. Kicking is a big eccentric adductor demand — the last box to tick." : "Stuttar sendingar fyrst, svo lengri, svo leik-ákefð. Spark er mikið eccentric aðleiðara-álag — síðasti reiturinn." },
            ].map((c, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-violet-700">{c.h}</h3>
                <p className="mt-1 text-sm text-slate-600">{c.b}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Citations */}
      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">{isEN ? "Evidence base" : "Sönnunar-grunnur"}</h3>
        <ul className="mt-2 space-y-1 text-xs text-slate-500">
          {CITATIONS.map((c, i) => (
            <li key={i}>• {c.label} <span className="text-slate-400">— {c.source}</span></li>
          ))}
        </ul>
      </div>

      <footer className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
        {isEN
          ? "Educational protocol reference for adductor-related groin pain — progression decisions belong to the treating clinician. Criteria-based, never calendar-based. Nothing here changes the player's readiness verdict."
          : "Fræðslu-prótókoll fyrir aðleiðara-nárasverk — framgangs-ákvarðanir tilheyra meðhöndlandi klíníker. Viðmiðað, aldrei dagatals. Ekkert hér breytir readiness-niðurstöðu leikmannsins."}
      </footer>
    </div>
  );
}

function StageHead({ isEN, title, tag, goal }: { isEN: boolean; title: string; tag: string; goal: string }) {
  return (
    <div>
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{title} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{tag}</span></h2>
      <p className="mt-1 text-sm text-slate-600"><b>{isEN ? "Goal:" : "Markmið:"}</b> {goal}</p>
    </div>
  );
}
