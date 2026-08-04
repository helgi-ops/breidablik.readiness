"use client";

/**
 * Coach view — Lateral (inversion) ankle sprain, Grade I–II: criteria-based
 * staged functional loading.
 *
 * Sibling of the tendinopathy / groin modules, sharing the tab shell, Silbernagel
 * pain gate, collagen adjunct and Stage-3 symmetry gate
 * (src/components/rehab/tendonLoading.tsx). Ankle-specific:
 *   • This is a LIGAMENT sprain (ATFL ± CFL), not a tendinopathy — early
 *     functional loading beats rest, and BALANCE/proprioception is its own
 *     pillar (it's what lowers re-sprain risk).
 *   • Ottawa Ankle Rules first (rule out fracture); Grade III / gross instability
 *     is out of scope — refer.
 *   • Grade I / II toggle adjusts the early protected phase.
 *   • FAAM outcome; hop + Y-balance LSI ≥ 90% gate for return to agility.
 *
 * EDUCATIONAL protocol reference — decisions belong to the treating clinician.
 * Clinical doses in English; the shell is bilingual IS/EN. Nothing here touches
 * the readiness verdict/colour.
 *
 * Sources: Dubois & Esculier 2020 (PEACE & LOVE), Vuurberg 2018 (ankle-sprain
 * guideline), Doherty 2017 (systematic review), Ottawa Ankle Rules (Stiell),
 * FAAM / CAIT, control-chaos continuum.
 */

import React from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang";
import { supabase } from "@/lib/supabaseClient";
import SendProtocolToPlayerButton from "@/components/recovery/SendProtocolToPlayerButton";
import { ExerciseTable, PainGate, CollagenSupport, LsiGate, type Row, type Reported } from "@/components/rehab/tendonLoading";
import { StageSessionLibrary } from "@/components/rehab/StageSessionLibrary";
import { STAGE_CODES, STAGE_LABEL, type StageId } from "@/lib/rehab/stageTemplates";

const BREIDABLIK_TEAM_ID = "94b52a06-0b83-48da-8664-639ec3486a0c";

const PROVOCATION_FULL = { en: "Single-leg balance / hop", is: "Einfætt jafnvægi / hopp" };
const PROVOCATION_SHORT = { en: "loading pain", is: "álags-verkur" };
const HOP_LSI = { en: "Hop LSI", is: "Hopp LSI" };
const YBAL = { en: "Y-balance %", is: "Y-jafnvægi %" };
const LSI_HINT = { en: "involved ÷ uninvolved × 100", is: "meidd ÷ heilbrigð × 100" };

type Tab = "overview" | "s1" | "s2" | "s3" | "s4" | "testing" | "videos";
type Grade = "I" | "II";

const S1 = (g: Grade): Row[] => [
  { ex: "Protected weight-bearing + normal gait", dose: "as tolerated", notes: g === "II" ? "GRADE II: brief brace/tape support the first days; weight-bear as pain allows toward a normal heel-to-toe pattern." : "Weight-bear as pain allows — aim for a normal heel-to-toe pattern early." },
  { ex: "Pain-free ankle ROM (ankle alphabet, dorsi/plantarflexion, gentle eversion)", dose: "3–5 min · several×/day", notes: "Pain-free range only. Avoid forced end-range inversion early." },
  { ex: "Isometric eversion / inversion / calf (pain-free)", dose: "5 × 20–30 s", notes: "Push against a wall or band, hold, breathe. Analgesic + early peroneal activation." },
  { ex: "Swelling control — compression, elevation, movement", dose: "ongoing", notes: "Movement pumps swelling out — don't just rest and ice (PEACE & LOVE)." },
];
const S2 = (g: Grade): Row[] => [
  { ex: "Calf raises (double → single) + theraband eversion / inversion / dorsi / plantarflexion", dose: "3 × 15 · progressive", notes: "Eversion (peroneal) emphasis — the peroneals are the dynamic ankle stabilisers." },
  { ex: "Single-leg balance progression (eyes open → eyes closed → firm → foam)", dose: "3–5 × 30–45 s", notes: "Start the proprioception pillar early — it's what lowers re-sprain risk." + (g === "II" ? " Grade II: ensure full pain-free weight-bearing first; progress a touch slower." : "") },
];
const S3: Row[] = [
  { ex: "Reactive balance — wobble board / BOSU, perturbations, Y-balance reaches", dose: "progressive · every 2nd–3rd day", notes: "Single-leg; add head turns / ball catches / eyes closed. Dynamic control before dynamic load." },
  { ex: "Progressive hopping — bilateral → single-leg → multidirectional", dose: "progressive", notes: "Land soft and controlled, no wobble. Progress by symmetry, not by feel." },
];
const S4: Row[] = [
  { ex: "Control → chaos agility (planned → reactive cutting, low → high speed)", dose: "graded", notes: "Add deceleration and change-of-direction volume before intensity." },
  { ex: "Sport-specific return with a brace/tape early", dose: "graded return to full training", notes: "Bracing/taping for the first weeks back lowers re-sprain risk. Pain-monitored throughout." },
];

const CITATIONS: { label: string; source: string }[] = [
  { label: "Dubois & Esculier 2020 — PEACE & LOVE (soft-tissue injury management)", source: "Br J Sports Med" },
  { label: "Vuurberg et al. 2018 — Diagnosis, treatment & prevention of ankle sprains (evidence-based guideline update)", source: "Br J Sports Med" },
  { label: "Doherty et al. 2017 — Treatment & prevention of acute & recurrent ankle sprain (systematic review)", source: "Br J Sports Med" },
  { label: "Stiell et al. — Ottawa Ankle Rules (rule out fracture)", source: "JAMA / BMJ" },
  { label: "FAAM (Foot & Ankle Ability Measure) + CAIT (Cumberland Ankle Instability Tool)", source: "outcome measures" },
  { label: "Baar 2019 / Shaw et al. 2017 — Load timing + collagen synthesis nutrition for tendon/ligament (adjunct)", source: "Sports Med / Am J Clin Nutr" },
];

type InjuryRow = { id: string; injury_type: string; severity: string; status: string; injury_date: string; notes: string | null };

const TABS: { id: Tab; en: string; is: string }[] = [
  { id: "overview", en: "Overview", is: "Yfirlit" },
  { id: "s1", en: "Stage 1 · Protect & load", is: "Fasi 1 · Vernda & hlaða" },
  { id: "s2", en: "Stage 2 · Strength + balance", is: "Fasi 2 · Styrkur + jafnvægi" },
  { id: "s3", en: "Stage 3 · Proprioception", is: "Fasi 3 · Proprioception" },
  { id: "s4", en: "Stage 4 · Return to sport", is: "Fasi 4 · Aftur í íþrótt" },
  { id: "testing", en: "Testing", is: "Próf" },
  { id: "videos", en: "Technique", is: "Tækni" },
];

export default function AnkleSprainPage() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const [tab, setTab] = React.useState<Tab>("overview");
  const [allowed, setAllowed] = React.useState<boolean | null>(null);
  const [grade, setGrade] = React.useState<Grade>("I");

  const [players, setPlayers] = React.useState<{ id: string; full_name: string | null }[]>([]);
  const [playerId, setPlayerId] = React.useState("");
  const [userId, setUserId] = React.useState<string | null>(null);
  const [teamId, setTeamId] = React.useState<string | null>(null);
  const [checkins, setCheckins] = React.useState<{ entry_date: string; provocation_vas: number | null; morning_stiffness_vas: number | null }[]>([]);

  const [hopLsi, setHopLsi] = React.useState<number | null>(null);
  const [yBal, setYBal] = React.useState<number | null>(null);

  const [injury, setInjury] = React.useState<InjuryRow | null>(null);
  const [injurySeverity, setInjurySeverity] = React.useState<"mild" | "moderate" | "severe">("moderate");
  const [injurySide, setInjurySide] = React.useState<"left" | "right">("left");
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
        .eq("region", "ankle")
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
      .or("injury_type.ilike.%ankle%,injury_type.ilike.%sprain%")
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
    if (!window.confirm(isEN ? `Flag ${selectedName ?? "this player"} as managing a Grade ${grade} lateral ankle sprain (${injurySide})?` : `Merkja ${selectedName ?? "þennan leikmann"} sem með Grade ${grade} ökkla-tognun (${injurySide})?`)) return;
    setInjuryBusy(true); setInjuryMsg(null);
    const { error } = await supabase.from("player_injuries").insert({
      player_id: playerId,
      team_id: teamId,
      injury_date: new Date().toISOString().slice(0, 10),
      body_part: "Ankle",
      injury_type: `Lateral ankle sprain (Grade ${grade})`,
      severity: injurySeverity,
      status: "injured",
      rtp_stage: 0,
      notes: `Ankle sprain — Grade ${grade} · ${injurySide} · Stage ${injuryStage}`,
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
    const base = injury.notes?.replace(/\s*·?\s*Stage\s*\d/i, "") ?? `Ankle sprain — Grade ${grade} · ${injurySide}`;
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
    if (!window.confirm(isEN ? "Mark this ankle flag as cleared?" : "Merkja þetta ökkla-flagg sem uppgert?")) return;
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
  const stageLib = (stage: StageId) => (
    <StageSessionLibrary isEN={isEN} teamId={teamId} codes={STAGE_CODES.ankle[stage]} playerId={playerId} playerName={selectedName} programLabel={`Ankle Sprain — ${STAGE_LABEL[stage]}`} />
  );
  const lsiMetrics = [
    { label: HOP_LSI, value: hopLsi, onChange: setHopLsi },
    { label: YBAL, value: yBal, onChange: setYBal },
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
          {isEN ? "Lateral Ankle Sprain (Grade I–II) — Staged Loading" : "Ökkla-tognun út á við (Grade I–II) — Þrepaskipt álag"}
        </h1>
        <SendProtocolToPlayerButton slug="lateral_ankle_sprain_staged_loading" lang={isEN ? "EN" : "IS"} />
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        {isEN
          ? "Criteria-based, pain-monitored functional loading for a Grade I–II lateral (inversion) ankle sprain. Load early — don't rest — and treat balance as its own pillar; that's what lowers re-sprain risk."
          : "Viðmiðuð, verkja-vöktuð starfræn hleðsla fyrir Grade I–II ökkla-tognun út á við. Hlaðið snemma — ekki hvíla — og meðhöndlið jafnvægi sem eigin stoð; það lækkar endurtognunar-áhættu."}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {isEN ? "Sources: " : "Heimildir: "}
        PEACE &amp; LOVE (Dubois 2020) · Vuurberg 2018 guideline · Doherty 2017 · Ottawa Ankle Rules · FAAM / CAIT
      </p>

      {/* Medical disclaimer — Ottawa + Grade III out of scope */}
      <div className="mt-4 rounded-lg border-l-4 border-red-400 bg-red-50 p-4 text-sm text-slate-700">
        <b className="text-red-700">{isEN ? "Read first: " : "Lestu fyrst: "}</b>
        {isEN
          ? "Educational protocol reference — not medical advice. Rule out a fracture with the Ottawa Ankle Rules first: image if the player can't weight-bear 4 steps (immediately and in clinic) OR has bony tenderness at the posterior edge/tip of either malleolus, the navicular, or the base of the 5th metatarsal. Grade III (complete rupture / gross instability, marked swelling, positive anterior drawer) is out of scope — refer. Progression is criteria-based, never calendar-based."
          : "Fræðslu-prótókoll — ekki læknisráð. Útiloka brot með Ottawa Ankle Rules fyrst: myndataka ef leikmaður getur ekki borið þunga 4 skref (strax og í móttöku) EÐA hefur beineymsli aftan á/á enda hvorugs ökklahnútu, á báti (navicular) eða við grunn 5. miðfótarbeins. Grade III (fullt rif / mikil óstöðugleiki, mikil bólga, jákvætt anterior drawer) er utan umfangs — vísa áfram. Framgangur er viðmiðaður, aldrei dagatals."}
      </div>

      {/* Grade classifier */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{isEN ? "Grade — sets the early protected phase" : "Grade — ræður snemma verndaða fasanum"}</div>
        <div className="mt-2 inline-flex rounded-lg border border-slate-300 p-0.5">
          {(["I", "II"] as Grade[]).map((g) => (
            <button key={g} type="button" onClick={() => setGrade(g)}
              className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors ${grade === g ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {isEN ? `Grade ${g}` : `Grade ${g}`}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {grade === "II"
            ? (isEN ? "Grade II (partial tear): a short protected phase (brace/tape) and a slightly slower early progression; typical timeline ~3–6 weeks (indicative only — criteria decide)." : "Grade II (hlutarif): stuttur verndaður fasi (spelka/teip) og aðeins hægari byrjun; dæmigerð tímalína ~3–6 vikur (aðeins til viðmiðunar — viðmið ráða).")
            : (isEN ? "Grade I (stretch): minimal protection, load early; typical timeline ~1–3 weeks (indicative only — criteria decide)." : "Grade I (tognun): lítil vörn, hlaða snemma; dæmigerð tímalína ~1–3 vikur (aðeins til viðmiðunar — viðmið ráða).")}
        </p>
      </div>

      {/* Player context */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{isEN ? "Player (optional)" : "Leikmaður (valfrjálst)"}</span>
        <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">{isEN ? "— none —" : "— enginn —"}</option>
          {players.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? "—"}</option>)}
        </select>
        <span className="text-xs text-slate-500">{isEN ? "Pick a player to flag the injury and read their daily ankle check-in." : "Veldu leikmann til að merkja meiðslið og lesa daglega ökkla-skráningu."}</span>
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
                <select value={injurySide} onChange={(e) => setInjurySide(e.target.value as "left" | "right")} className="ml-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
                  <option value="left">{isEN ? "Left" : "Vinstri"}</option>
                  <option value="right">{isEN ? "Right" : "Hægri"}</option>
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
                {injuryBusy ? (isEN ? "Saving…" : "Vista…") : (isEN ? `Flag as Grade ${grade} ankle sprain` : `Merkja sem Grade ${grade} ökkla-tognun`)}
              </button>
            </div>
          )}
          <div className="mt-2 border-t border-slate-100 pt-2">
            <Link href={`/coach/rtp/${playerId}`} className="text-xs font-medium text-primary hover:underline">
              {injury
                ? (isEN ? "Open Force-Plate RTP clearance for this player →" : "Opna Kraftplötu RTP-mat fyrir þennan leikmann →")
                : (isEN ? "Open Force-Plate assessment for this player →" : "Opna Kraftplötu-mat fyrir þennan leikmann →")}
            </Link>
          </div>
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
                  ? "Four staged phases of early functional loading. Progression is criteria-based (pain within limits + hop/balance symmetry), never the calendar. Balance/proprioception is trained from Stage 2 and kept as prevention."
                  : "Fjórir fasar af snemmbúinni starfrænni hleðslu. Framgangur er viðmiðaður (verkur innan marka + hopp/jafnvægis-samhverfa), aldrei dagatalið. Jafnvægi/proprioception er þjálfað frá Fasa 2 og haldið sem forvörn."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { id: "s1" as Tab, t: isEN ? "1 · Protect & load" : "1 · Vernda & hlaða", s: isEN ? "pain/swelling + ROM" : "verkur/bólga + ROM" },
                { id: "s2" as Tab, t: isEN ? "2 · Strength + balance" : "2 · Styrkur + jafnvægi", s: isEN ? "peroneals + proprioception" : "peroneal + proprioception" },
                { id: "s3" as Tab, t: isEN ? "3 · Proprioception" : "3 · Proprioception", s: isEN ? "hop / balance LSI ≥ 90%" : "hopp / jafnvægi LSI ≥ 90%" },
                { id: "s4" as Tab, t: isEN ? "4 · Return to sport" : "4 · Aftur í íþrótt", s: isEN ? "agility + brace early" : "snerpa + spelka snemma" },
              ].map((p) => (
                <button key={p.id} onClick={() => setTab(p.id)} className="rounded-lg border border-slate-200 border-t-4 border-t-violet-500 bg-white p-3 text-left transition-transform hover:-translate-y-0.5 hover:border-violet-400">
                  <b className="block text-sm text-slate-900">{p.t}</b>
                  <span className="text-xs text-slate-500">{p.s}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { h: isEN ? "Load early — don't rest" : "Hlaða snemma — ekki hvíla", b: isEN ? "Early functional loading (PEACE & LOVE) beats immobilisation for Grade I–II. Protect briefly, then move and weight-bear as pain allows." : "Snemmbúin starfræn hleðsla (PEACE & LOVE) slær kyrrsetningu fyrir Grade I–II. Verndaðu stutt, hreyfðu svo og berðu þunga eftir verk." },
                { h: isEN ? "Balance is the missing pillar" : "Jafnvægi er stoðin sem gleymist", b: isEN ? "Proprioceptive / neuromuscular training is the single biggest lever on re-sprain risk. Start it in Stage 2 and keep it as prevention after return." : "Proprioceptive / taugavöðva-þjálfun er stærsti einstaki þátturinn í endurtognunar-áhættu. Byrjaðu í Fasa 2 og haltu því sem forvörn eftir endurkomu." },
                { h: isEN ? "Symmetry unlocks agility" : "Samhverfa opnar snerpu", b: isEN ? "Stage 4 cutting waits for hop LSI ≥ 90% and symmetric Y-balance vs the uninjured side." : "Fasi 4 (skurðir) bíður eftir hopp-LSI ≥ 90% og samhverfu Y-jafnvægi vs heilbrigða hlið." },
                { h: isEN ? "Track FAAM weekly" : "Fylgstu með FAAM vikulega", b: isEN ? "The Foot & Ankle Ability Measure (0–100%, higher = better). Use CAIT to screen residual instability." : "Foot & Ankle Ability Measure (0–100%, hærra = betra). Notaðu CAIT til að skima óstöðugleika." },
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
            <StageHead isEN={isEN} title={isEN ? "Stage 1 — Protect & early load" : "Fasi 1 — Vernda & hlaða snemma"} tag={isEN ? "pain/swelling control + ROM" : "verkur/bólga + ROM"}
              goal={isEN ? "control pain and swelling, restore pain-free range and start loading early. Protect briefly (more for Grade II), then move — rest deconditions the ankle." : "stjórna verk og bólgu, endurheimta verkjalaust ferli og byrja hleðslu snemma. Verndaðu stutt (meira fyrir Grade II), hreyfðu svo — hvíld afþjálfar ökklann."} />
            <ExerciseTable rows={S1(grade)} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: PEACE & LOVE (Dubois 2020); Vuurberg 2018 guideline." : "Heimild: PEACE & LOVE (Dubois 2020); Vuurberg 2018 leiðbeiningar."}</p>
            <PainGate isEN={isEN} reported={reported} provocationFull={PROVOCATION_FULL} provocationShort={PROVOCATION_SHORT} />
          </div>
        )}

        {/* ── STAGE 2 ── */}
        {tab === "s2" && (
          <div className="space-y-4">
            <StageHead isEN={isEN} title={isEN ? "Stage 2 — Strength + early balance" : "Fasi 2 — Styrkur + snemma jafnvægi"} tag={isEN ? "peroneals + proprioception" : "peroneal + proprioception"}
              goal={isEN ? "build calf + peroneal strength (eversion emphasis) and start the balance pillar. Both restore the ankle's active stability." : "byggja kálfa- + peroneal-styrk (eversion áhersla) og byrja jafnvægis-stoðina. Bæði endurheimta virka stöðugleika ökklans."} />
            <ExerciseTable rows={S2(grade)} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: Vuurberg 2018; Doherty 2017 (strength + balance). Balance training lowers recurrence." : "Heimild: Vuurberg 2018; Doherty 2017 (styrkur + jafnvægi). Jafnvægis-þjálfun lækkar endurtognun."}</p>
            <PainGate isEN={isEN} reported={reported} provocationFull={PROVOCATION_FULL} provocationShort={PROVOCATION_SHORT} />
          </div>
        )}

        {/* ── STAGE 3 ── (LSI gated) */}
        {tab === "s3" && (
          <div className="space-y-4">
            <StageHead isEN={isEN} title={isEN ? "Stage 3 — Proprioception + energy storage" : "Fasi 3 — Proprioception + orkugeymsla"} tag={isEN ? "reintroduce dynamic control" : "endurvekja kvika stjórn"}
              goal={isEN ? "restore reactive balance and the spring with progressive hopping — only once pain is controlled and hop/balance symmetry is building." : "endurheimta viðbragðs-jafnvægi og fjöðrun með stigvaxandi hoppi — aðeins þegar verkur er í skefjum og hopp/jafnvægis-samhverfa byggist upp."} />
            <LsiGate isEN={isEN} unitHint={LSI_HINT} metrics={lsiMetrics} />
            <ExerciseTable rows={S3} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: neuromuscular / balance progression + hop-test symmetry." : "Heimild: taugavöðva- / jafnvægis-framgangur + hopp-prófa samhverfa."}</p>
            <PainGate isEN={isEN} reported={reported} provocationFull={PROVOCATION_FULL} provocationShort={PROVOCATION_SHORT} />
          </div>
        )}

        {/* ── STAGE 4 ── */}
        {tab === "s4" && (
          <div className="space-y-4">
            <StageHead isEN={isEN} title={isEN ? "Stage 4 — Return to sport (agility)" : "Fasi 4 — Aftur í íþrótt (snerpa)"} tag={isEN ? "control → chaos" : "stýrt → óreiða"}
              goal={isEN ? "sport-specific cutting, pivoting and deceleration, graded back to full training. Brace/tape early to lower re-sprain risk." : "íþrótta-sértækir skurðir, snúningar og hraðaminnkun, þrepað aftur í fullar æfingar. Spelka/teip snemma til að lækka endurtognun."} />
            <ExerciseTable rows={S4} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: control-chaos continuum; bracing/taping for early return (Doherty/Vuurberg)." : "Heimild: stýrða-óreiðu ásinn; spelka/teip fyrir snemma endurkomu (Doherty/Vuurberg)."}</p>
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
                    { m: "FAAM (0–100%) + CAIT for instability", c: isEN ? "weekly" : "vikulega", w: isEN ? "The ankle outcome score — higher = better. CAIT flags residual instability. The 'are we winning?' number." : "Ökkla-útkomu-skor — hærra = betra. CAIT sýnir eftirstandandi óstöðugleika. 'Erum við að vinna?' talan." },
                    { m: "Loading / single-leg balance pain (VAS 0–10)", c: isEN ? "daily" : "daglega", w: isEN ? "The daily provocation test. Feeds the pain-monitoring gate." : "Daglega provokations-prófið. Fæðir verkja-vöktunar-hliðið." },
                    { m: "Morning stiffness / swelling", c: isEN ? "daily" : "daglega", w: isEN ? "Primary day-to-day marker — must not rise week to week." : "Aðal-daglegi mælikvarðinn — má ekki vaxa milli vikna." },
                    { m: "Hop-test LSI + Y-balance (SEBT) symmetry", c: isEN ? "before Stage 3/4, then monitoring" : "fyrir Fasa 3/4, svo vöktun", w: isEN ? "Objective gate: hop LSI ≥ 90% and symmetric Y-balance unlock agility / return to sport." : "Hlutlægt hlið: hopp-LSI ≥ 90% og samhverft Y-jafnvægi opna snerpu / endurkomu." },
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
              <h3 className="text-sm font-semibold text-violet-700">{isEN ? "Hop / balance symmetry gate" : "Hopp / jafnvægis-samhverfu-hlið"}</h3>
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
              { h: "Early ROM (Stage 1)", b: isEN ? "Ankle 'alphabet', pain-free dorsi/plantarflexion, gentle eversion. Keep out of forced inversion early — that's the injured direction." : "Ökkla-'stafróf', verkjalaus dorsi/plantarflexion, mild eversion. Haltu frá þvingaðri inversion snemma — það er meidda áttin." },
              { h: "Peroneal strength (Stage 2)", b: isEN ? "Band eversion (turn the sole outward) is the priority — the peroneals are the dynamic guard against another inversion roll." : "Teygju-eversion (snúðu il út) er forgangur — peroneal-vöðvarnir eru kvika vörnin gegn annarri inversion." },
              { h: "Balance progression (Stage 2–3)", b: isEN ? "Single-leg: eyes open → eyes closed → firm → foam → add head turns / ball catches. Little wobble = good control." : "Einfætt: augu opin → augu lokuð → fast → svampur → bæta við höfuð-snúningum / bolta. Lítið riðl = góð stjórn." },
              { h: "Soft, controlled landings (Stage 3)", b: isEN ? "Hop and stick — land quiet, knee over toes, no ankle wobble. Progress bilateral → single-leg → multidirectional." : "Hoppa og stöðva — lentu hljóðlega, hné yfir tám, ekkert ökkla-riðl. Þróaðu tvífætt → einfætt → fjöláttir." },
              { h: "Brace for early return (Stage 4)", b: isEN ? "A lace-up brace or tape for the first weeks back measurably lowers re-sprain — not a crutch, a safeguard while control catches up." : "Reim-spelka eða teip fyrstu vikurnar aftur lækkar endurtognun mælanlega — ekki hækja, heldur vörn á meðan stjórn nær sér." },
            ].map((c, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-violet-700">{c.h}</h3>
                <p className="mt-1 text-sm text-slate-600">{c.b}</p>
              </div>
            ))}
          </div>
        )}
        {(["s1", "s2", "s3", "s4"] as string[]).includes(tab) && (
          <div className="mt-4">{stageLib(tab as StageId)}</div>
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
          ? "Educational protocol reference for a Grade I–II lateral ankle sprain — decisions belong to the treating clinician. Criteria-based, never calendar-based. Rule out fracture (Ottawa) and Grade III first. Nothing here changes the player's readiness verdict."
          : "Fræðslu-prótókoll fyrir Grade I–II ökkla-tognun — ákvarðanir tilheyra meðhöndlandi klíníker. Viðmiðað, aldrei dagatals. Útiloka brot (Ottawa) og Grade III fyrst. Ekkert hér breytir readiness-niðurstöðu leikmannsins."}
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
