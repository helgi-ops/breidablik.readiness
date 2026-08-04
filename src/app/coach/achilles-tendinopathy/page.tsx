"use client";

/**
 * Coach view — Achilles tendinopathy: criteria-based staged tendon loading.
 *
 * Sibling of the Jumper's Knee module (src/app/coach/jumpers-knee/page.tsx),
 * sharing the tab shell + Silbernagel pain-monitoring gate
 * (src/components/rehab/tendonLoading.tsx). Achilles-specific swaps:
 *   • midportion vs insertional toggle — insertional avoids dorsiflexion / the
 *     step (loading into dorsiflexion compresses the insertion and flares it).
 *   • calf / heel-raise loading (HSR + Alfredson eccentric, midportion only).
 *   • VISA-A outcome (not VISA-P); single-leg heel-raise daily marker.
 *   • Stage 3 gate = single-leg heel-raise / hop LSI ≥ 90% (coach-entered).
 *
 * EDUCATIONAL protocol reference — progression decisions belong to the treating
 * clinician. Clinical doses in English; the shell is bilingual IS/EN. Nothing
 * here touches the readiness verdict/colour.
 *
 * Sources (research/): Silbernagel (pain gate + VISA-A), "Achilles Tendinopathy:
 * Evaluation, Rehabilitation, and Prevention" (midportion vs insertional,
 * Alfredson), Achilles & Patellar loading systematic review (HSR vs eccentric),
 * midportion RTS program, control-chaos continuum.
 */

import React from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang";
import { supabase } from "@/lib/supabaseClient";
import SendProtocolToPlayerButton from "@/components/recovery/SendProtocolToPlayerButton";
import { ExerciseTable, PainGate, CollagenSupport, LsiGate, type Row, type Reported } from "@/components/rehab/tendonLoading";

import { StageSessionLibrary } from "@/components/rehab/StageSessionLibrary";
import { STAGE_CODES, STAGE_LABEL, type StageId } from "@/lib/rehab/stageTemplates";

// Heel-raise + hop LSI metrics for the shared Stage-3 symmetry gate.
const HEEL_LSI = { en: "Heel-raise LSI", is: "Tá-lyftu LSI" };
const HOP_LSI = { en: "Hop LSI", is: "Hopp LSI" };
const LSI_HINT = { en: "involved ÷ uninvolved × 100", is: "meidd ÷ heilbrigð × 100" };

const BREIDABLIK_TEAM_ID = "94b52a06-0b83-48da-8664-639ec3486a0c";

// The daily provocation test for the Achilles.
const PROVOCATION_FULL = { en: "Single-leg heel-raise", is: "Einfætt tá-lyfta" };
const PROVOCATION_SHORT = { en: "heel-raise pain", is: "tá-lyftu verkur" };

type Tab = "overview" | "s1" | "s2" | "s3" | "s4" | "testing" | "videos";
type Variant = "midportion" | "insertional";

// ── Stage exercise tables (English clinical doses) — variant-aware ──────────
const S1 = (v: Variant): Row[] => [
  { ex: "Isometric heel-raise hold (double → single leg), mid-range", dose: "5 × 45 s · 2–3×/day", notes: v === "insertional" ? "INSERTIONAL: hold on the FLOOR at neutral — no step, no dorsiflexion. Acceptable pain (≤5/10)." : "Off a step or floor, mid-range. Analgesic window (~45 min). Acceptable pain (≤5/10)." },
  { ex: "Non-provocative strength — knee, hip, trunk, uninjured side", dose: "normal load", notes: "Keep training everything that doesn't provoke the tendon. Don't detrain the rest of the body." },
  { ex: "Bike / cross-trainer (low resistance)", dose: "15–30 min easy", notes: "Maintain aerobic base, pain-free only." },
];
const S2 = (v: Variant): Row[] => [
  { ex: "HSR calf raises — seated (soleus, bent knee) + standing (gastroc, straight knee)", dose: "3–4 sets · slow 6 s tempo (3 s up / 3 s down)", notes: "3×/week on alternate days. Progressive load: 15RM → 6RM over ~12 weeks. " + (v === "insertional" ? "Range: floor to neutral only — do NOT drop below neutral." : "Full range allowed.") },
  v === "midportion"
    ? { ex: "Alfredson eccentric heel-drop (MIDPORTION only)", dose: "3 × 15 · twice daily · 7 d/wk · 12 wk", notes: "Straight-knee and bent-knee, off a step BELOW neutral. Progress load with a loaded backpack." }
    : { ex: "Floor-to-neutral heel raises (insertional — replaces the eccentric step-drop)", dose: "3 × 15 · slow, controlled", notes: "NO step, NO dorsiflexion. Loading into dorsiflexion compresses the tendon against the calcaneus and flares it." },
  { ex: "Minimum programme length", dose: "≥ 12 weeks", notes: "Tendon adaptation is slow — this is not a two-week fix. Morning stiffness is the key day-to-day marker." },
];
const S3: Row[] = [
  { ex: "Bilateral pogo / skip → single-leg hops → bounding → progressive running", dose: "progressive · every 3rd day", notes: "Low → high stretch-shortening demand. Land soft and quiet. Respect tendon recovery between sessions." },
  { ex: "Track intensity via CMJ RSI-modified + single-leg hop symmetry", dose: "monitor", notes: "Progress by limb symmetry, not by feel." },
];
const S4: Row[] = [
  { ex: "Control → chaos progression (planned → reactive drills)", dose: "graded", notes: "Low → high speed and volume. Move along the control-chaos continuum toward game-realistic decisions." },
  { ex: "Acceleration / deceleration & cutting exposure", dose: "built gradually", notes: "Add volume then intensity, pain-monitored throughout." },
  { ex: "Sport-specific running & repeated-effort work", dose: "graded return to full training", notes: "Reduced minutes first, building back over 2–3 weeks." },
];

const CITATIONS: { label: string; source: string }[] = [
  { label: "Silbernagel et al. — Continued sports activity using a pain-monitoring model in Achilles tendinopathy (pain gate + VISA-A)", source: "Am J Sports Med 2007" },
  { label: "Achilles Tendinopathy: Evaluation, Rehabilitation, and Prevention (midportion vs insertional, Alfredson eccentric protocol)", source: "review" },
  { label: "Achilles and Patellar Tendinopathy Loading Programmes — A Systematic Review (HSR vs eccentric)", source: "Sports Med" },
  { label: "A Proposed Return-to-Sport Program for Midportion Achilles Tendinopathy (Stage 4 RTS template)", source: "IJSPT" },
  { label: "Physical therapies for Achilles tendinopathy: systematic review and meta-analysis", source: "systematic review" },
  { label: "Baar 2019 — Load, collagen synthesis & nutrition for tendon/ligament (load timing + gelatin protocol)", source: "Sports Med" },
  { label: "Shaw et al. 2017 — Vitamin C-enriched gelatin ~1 h before loading doubles collagen synthesis", source: "Am J Clin Nutr" },
];

// Active Achilles-tendinopathy flag (player_injuries — authoritative for RTP/RTT).
type InjuryRow = { id: string; injury_type: string; severity: string; status: string; injury_date: string; notes: string | null };

const TABS: { id: Tab; en: string; is: string }[] = [
  { id: "overview", en: "Overview", is: "Yfirlit" },
  { id: "s1", en: "Stage 1 · Isometric", is: "Fasi 1 · Ísómetrísk" },
  { id: "s2", en: "Stage 2 · HSR / eccentric", is: "Fasi 2 · HSR / eccentric" },
  { id: "s3", en: "Stage 3 · Energy storage", is: "Fasi 3 · Orkugeymsla" },
  { id: "s4", en: "Stage 4 · Return to sport", is: "Fasi 4 · Aftur í íþrótt" },
  { id: "testing", en: "Testing", is: "Próf" },
  { id: "videos", en: "Technique", is: "Tækni" },
];

export default function AchillesTendinopathyPage() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const [tab, setTab] = React.useState<Tab>("overview");
  const [allowed, setAllowed] = React.useState<boolean | null>(null);
  const [variant, setVariant] = React.useState<Variant>("midportion");

  const [players, setPlayers] = React.useState<{ id: string; full_name: string | null }[]>([]);
  const [playerId, setPlayerId] = React.useState("");
  const [userId, setUserId] = React.useState<string | null>(null);
  const [teamId, setTeamId] = React.useState<string | null>(null);
  const [checkins, setCheckins] = React.useState<{ entry_date: string; provocation_vas: number | null; morning_stiffness_vas: number | null }[]>([]);

  // Stage 3 objective gate — coach-entered single-leg heel-raise / hop LSI (%).
  const [heelLsi, setHeelLsi] = React.useState<number | null>(null);
  const [hopLsi, setHopLsi] = React.useState<number | null>(null);

  // Injury flag for the selected player.
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

  // Recent player-reported Achilles check-ins (region = 'achilles').
  React.useEffect(() => {
    if (!playerId) { setCheckins([]); return; }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("tendon_checkins")
        .select("entry_date, provocation_vas, morning_stiffness_vas")
        .eq("player_id", playerId)
        .eq("region", "achilles")
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
      .ilike("injury_type", "%achilles%")
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
    if (!window.confirm(isEN ? `Flag ${selectedName ?? "this player"} as managing ${variant} Achilles tendinopathy (${injurySide})?` : `Merkja ${selectedName ?? "þennan leikmann"} sem með ${variant} Achilles-sinabólgu (${injurySide})?`)) return;
    setInjuryBusy(true); setInjuryMsg(null);
    const { error } = await supabase.from("player_injuries").insert({
      player_id: playerId,
      team_id: teamId,
      injury_date: new Date().toISOString().slice(0, 10),
      body_part: "Achilles",
      injury_type: `Achilles tendinopathy (${variant})`,
      severity: injurySeverity,
      status: "injured",
      rtp_stage: 0,
      notes: `Achilles staged loading — ${variant} · ${injurySide} · Stage ${injuryStage}`,
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
    // Preserve the variant · side prefix already in notes; just swap the stage.
    const base = injury.notes?.replace(/\s*·?\s*Stage\s*\d/i, "") ?? `Achilles staged loading — ${variant} · ${injurySide}`;
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
    if (!window.confirm(isEN ? "Mark this tendon flag as cleared?" : "Merkja þetta sina-flagg sem uppgert?")) return;
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
  const isInsertional = variant === "insertional";
  const stageLib = (stage: StageId) => (
    <StageSessionLibrary isEN={isEN} teamId={teamId} codes={STAGE_CODES.achilles[stage]} playerId={playerId} playerName={selectedName} programLabel={`Achilles Tendinopathy — ${STAGE_LABEL[stage]}`} />
  );

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
          {isEN ? "Achilles Tendinopathy — Staged Tendon Loading" : "Achilles-sinabólga — Þrepaskipt sinaálag"}
        </h1>
        <SendProtocolToPlayerButton slug="achilles_tendinopathy_staged_loading" lang={isEN ? "EN" : "IS"} />
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        {isEN
          ? "Criteria-based, pain-monitored staged loading for Achilles tendinopathy. The Achilles responds to progressive load, not rest — the fix is the right dose at the right stage, with pain allowed but bounded."
          : "Viðmiðuð, verkja-vöktuð þrepaskipt hleðsla fyrir Achilles-sinabólgu. Achilles bregst við stigvaxandi álagi, ekki hvíld — lausnin er réttur skammtur á réttum fasa, með verk sem er leyfður en innan marka."}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {isEN ? "Sources: " : "Heimildir: "}
        Silbernagel (pain gate + VISA-A) · Alfredson eccentric · HSR vs eccentric systematic review · midportion RTS program
      </p>

      {/* Medical disclaimer — always visible */}
      <div className="mt-4 rounded-lg border-l-4 border-red-400 bg-red-50 p-4 text-sm text-slate-700">
        <b className="text-red-700">{isEN ? "Read first: " : "Lestu fyrst: "}</b>
        {isEN
          ? "Educational protocol reference — not medical advice. Classify midportion vs insertional first (below) — it changes the allowed range. Rule out an Achilles tear, retrocalcaneal bursitis, Sever's, or a systemic cause. Progression is criteria-based, never calendar-based; every recommendation is overridable and belongs to the treating clinician."
          : "Fræðslu-prótókoll — ekki læknisráð. Flokkaðu midportion vs insertional fyrst (að neðan) — það breytir leyfðu hreyfiferli. Útiloka Achilles-rif, bursitis, Sever's eða kerfislæga orsök. Framgangur er viðmiðaður, aldrei dagatals; sérhver ábending er yfirtakanleg og tilheyrir meðhöndlandi klíníker."}
      </div>

      {/* Midportion / insertional classifier — drives the allowed range */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{isEN ? "Classify first — this changes the exercises" : "Flokkaðu fyrst — þetta breytir æfingunum"}</div>
        <div className="mt-2 inline-flex rounded-lg border border-slate-300 p-0.5">
          {(["midportion", "insertional"] as Variant[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVariant(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${variant === v ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {v === "midportion" ? (isEN ? "Midportion" : "Midportion") : (isEN ? "Insertional" : "Insertional")}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {isInsertional
            ? (isEN
                ? "Insertional (pain at the heel bone): AVOID dorsiflexion beyond neutral — heel raises floor-to-neutral only, no step, no decline. Loading into dorsiflexion compresses the insertion and flares it."
                : "Insertional (verkur við hælbein): FORÐASTU dorsiflexion umfram neutral — tá-lyftur floor-to-neutral eingöngu, ekkert þrep, engin halli. Álag í dorsiflexion þjappar festuna og eykur bólgu.")
            : (isEN
                ? "Midportion (pain 2–6 cm above the heel): full range allowed, including heel drops below neutral off a step (the classic eccentric/decline position)."
                : "Midportion (verkur 2–6 cm ofan við hæl): fullt hreyfiferli leyft, þ.m.t. hæl-drop undir neutral af þrepi (klassíska eccentric/decline staðan).")}
        </p>
      </div>

      {/* Player context (optional) */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{isEN ? "Player (optional)" : "Leikmaður (valfrjálst)"}</span>
        <select
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">{isEN ? "— none —" : "— enginn —"}</option>
          {players.map((p) => <option key={p.id} value={p.id}>{p.full_name ?? "—"}</option>)}
        </select>
        <span className="text-xs text-slate-500">
          {isEN ? "Pick a player to flag the injury and read their daily heel-raise check-in." : "Veldu leikmann til að merkja meiðslið og lesa daglega tá-lyftu skráningu."}
        </span>
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
              <p className="mt-1 text-xs text-slate-500">
                {isEN ? "Appears on RTP / Return-to-training surfaces. A clinical flag — it does not change the readiness colour." : "Birtist á RTP / Aftur-í-æfingar flötum. Klínískt flagg — það breytir ekki readiness-litnum."}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="text-xs text-slate-600">{isEN ? "Active stage" : "Virkur fasi"}
                  <select value={injuryStage} onChange={(e) => updateStage(Number(e.target.value))} disabled={injuryBusy} className="ml-1 rounded-md border border-slate-300 px-2 py-1 text-xs">
                    {[1, 2, 3, 4].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <button type="button" onClick={clearInjury} disabled={injuryBusy} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {isEN ? "Mark cleared" : "Merkja uppgert"}
                </button>
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
                {injuryBusy ? (isEN ? "Saving…" : "Vista…") : (isEN ? `Flag as ${variant} Achilles tendinopathy` : `Merkja sem ${variant} Achilles-sinabólgu`)}
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
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-violet-400"
            }`}
          >
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
                  ? "Four staged loading phases for the plantarflexors. Classify midportion vs insertional first — it changes the allowed range. Progression is criteria-based (pain within limits + heel-raise/hop symmetry), never the calendar."
                  : "Fjórir hleðslufasar fyrir plantarflexora. Flokkaðu midportion vs insertional fyrst — það breytir leyfðu hreyfiferli. Framgangur er viðmiðaður (verkur innan marka + tá-lyftu/hopp samhverfa), aldrei dagatalið."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { id: "s1" as Tab, t: isEN ? "1 · Isometric" : "1 · Ísómetrísk", s: isEN ? "pain relief + load tolerance" : "verkjastilling + þol" },
                { id: "s2" as Tab, t: isEN ? "2 · HSR / eccentric" : "2 · HSR / eccentric", s: isEN ? "tendon remodeling (≥12 wk)" : "sina-endurmótun (≥12 vk)" },
                { id: "s3" as Tab, t: isEN ? "3 · Energy storage" : "3 · Orkugeymsla", s: isEN ? "plyometrics — LSI ≥ 90%" : "plyometrics — LSI ≥ 90%" },
                { id: "s4" as Tab, t: isEN ? "4 · Return to sport" : "4 · Aftur í íþrótt", s: isEN ? "control → chaos" : "stýrt → óreiða" },
              ].map((p) => (
                <button key={p.id} onClick={() => setTab(p.id)} className="rounded-lg border border-slate-200 border-t-4 border-t-violet-500 bg-white p-3 text-left transition-transform hover:-translate-y-0.5 hover:border-violet-400">
                  <b className="block text-sm text-slate-900">{p.t}</b>
                  <span className="text-xs text-slate-500">{p.s}</span>
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { h: isEN ? "Classify first" : "Flokkaðu fyrst", b: isEN ? "Midportion allows full range (heel drops below neutral). Insertional avoids dorsiflexion — floor-to-neutral only, no step. Getting this wrong is the most common way an Achilles program fails." : "Midportion leyfir fullt hreyfiferli (hæl-drop undir neutral). Insertional forðast dorsiflexion — floor-to-neutral, ekkert þrep. Að fá þetta rangt er algengasta ástæða þess að Achilles-prógramm mistekst." },
                { h: isEN ? "Pain is allowed — within limits" : "Verkur er leyfður — innan marka", b: isEN ? "Continued running/jumping is safe up to 5/10 pain that settles by the next morning. Rest deconditions the tendon." : "Áframhaldandi hlaup/stökk er öruggt upp að 5/10 verk sem sjatnar fyrir næsta morgun. Hvíld afþjálfar sinina." },
                { h: isEN ? "Symmetry unlocks the spring" : "Samhverfa opnar fjöðrunina", b: isEN ? "Stage 3 plyometrics wait for single-leg heel-raise / hop LSI ≥ 90% vs the uninjured side." : "Fasi 3 plyometrics bíða eftir einfættri tá-lyftu / hoppi LSI ≥ 90% vs heilbrigða hlið." },
                { h: isEN ? "Track VISA-A weekly" : "Fylgstu með VISA-A vikulega", b: isEN ? "The 0–100 Achilles outcome score (higher = better). It's the 'are we winning?' number." : "0–100 Achilles útkomu-skor (hærra = betra). Þetta er 'erum við að vinna?' talan." },
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
                ? "This screen is descriptive — the tendon stage and pain scores never move the player's green/amber/red readiness colour. Rehab load still flows into load/RPE as usual; the tendon stage is its own labelled signal."
                : "Þetta skjár er lýsandi — sina-fasinn og verkja-skorin hreyfa aldrei græna/gula/rauða readiness-litinn. Endurhæfingar-álag flæðir enn í álag/RPE eins og venjulega; sina-fasinn er sitt eigið merkta merki."}
            </div>
          </div>
        )}

        {/* ── STAGE 1 ── */}
        {tab === "s1" && (
          <div className="space-y-4">
            <StageHead isEN={isEN} title={isEN ? "Stage 1 — Isometric loading" : "Fasi 1 — Ísómetrísk hleðsla"} tag={isEN ? "pain relief + load tolerance" : "verkjastilling + þol"}
              goal={isEN ? "settle an irritable tendon and build load tolerance. Isometric plantarflexion gives an analgesic window and starts loading." : "róa pirraða sin og byggja upp þol. Ísómetrísk plantarflexion gefur verkja-glugga og byrjar hleðslu."} />
            {isInsertional && <InsertionalNote isEN={isEN} />}
            <ExerciseTable rows={S1(variant)} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: Silbernagel + isometric-analgesia tendon evidence, research/." : "Heimild: Silbernagel + ísómetrísk verkjastilling, research/."}</p>
            <PainGate isEN={isEN} reported={reported} provocationFull={PROVOCATION_FULL} provocationShort={PROVOCATION_SHORT} />
          </div>
        )}

        {/* ── STAGE 2 ── */}
        {tab === "s2" && (
          <div className="space-y-4">
            <StageHead isEN={isEN} title={isEN ? "Stage 2 — Isotonic / HSR + eccentric heel raises" : "Fasi 2 — Isótónísk / HSR + eccentric tá-lyftur"} tag={isEN ? "the core — ≥ 12 weeks" : "kjarninn — ≥ 12 vikur"}
              goal={isEN ? "remodel the tendon with heavy slow resistance and (midportion) eccentric heel drops. Both routes work — pick per clinician/equipment." : "endurmóta sinina með þungri hægri mótstöðu og (midportion) eccentric hæl-drop. Báðar leiðir virka — veldu eftir klíníker/búnaði."} />
            {isInsertional && <InsertionalNote isEN={isEN} />}
            <ExerciseTable rows={S2(variant)} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: Kongsgaard/HSR + Alfredson eccentric protocol + systematic reviews, research/." : "Heimild: Kongsgaard/HSR + Alfredson eccentric + yfirlitsgreinar, research/."}</p>
            <PainGate isEN={isEN} reported={reported} provocationFull={PROVOCATION_FULL} provocationShort={PROVOCATION_SHORT} />
          </div>
        )}

        {/* ── STAGE 3 ── (LSI gated) */}
        {tab === "s3" && (
          <div className="space-y-4">
            <StageHead isEN={isEN} title={isEN ? "Stage 3 — Energy-storage loading" : "Fasi 3 — Orkugeymslu-hleðsla"} tag={isEN ? "reintroduce the spring" : "endurvekja fjöðrunina"}
              goal={isEN ? "reload the stretch-shortening cycle with progressive plyometrics — only once pain is controlled at Stage 2 loads and heel-raise/hop symmetry is restored." : "endurhlaða teygju-styttingar-hringinn með stigvaxandi plyometrics — aðeins þegar verkur er í skefjum við Fasa 2 og tá-lyftu/hopp samhverfa er endurheimt."} />
            <LsiGate isEN={isEN} unitHint={LSI_HINT} metrics={[{ label: HEEL_LSI, value: heelLsi, onChange: setHeelLsi }, { label: HOP_LSI, value: hopLsi, onChange: setHopLsi }]} />
            <ExerciseTable rows={S3} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: plyometric programming in soccer + energy-storage progression, research/." : "Heimild: plyometric forritun í fótbolta + orkugeymslu-framgangur, research/."}</p>
            <PainGate isEN={isEN} reported={reported} provocationFull={PROVOCATION_FULL} provocationShort={PROVOCATION_SHORT} />
          </div>
        )}

        {/* ── STAGE 4 ── */}
        {tab === "s4" && (
          <div className="space-y-4">
            <StageHead isEN={isEN} title={isEN ? "Stage 4 — Energy storage + release / Return to sport" : "Fasi 4 — Orkugeymsla + losun / Aftur í íþrótt"} tag={isEN ? "control → chaos" : "stýrt → óreiða"}
              goal={isEN ? "sport-specific running, acceleration/deceleration and cutting, graded back to full training along the control-chaos continuum." : "íþrótta-sértækt hlaup, hröðun/hraðaminnkun og skurðir, þrepað aftur í fullar æfingar eftir stýrða-óreiðu ásnum."} />
            <ExerciseTable rows={S4} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: midportion return-to-sport program + control-chaos continuum, research/." : "Heimild: midportion return-to-sport prógramm + stýrða-óreiðu ásinn, research/."}</p>
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
                    { m: "VISA-A questionnaire (0–100)", c: isEN ? "weekly" : "vikulega", w: isEN ? "The Achilles-tendinopathy outcome score — higher = better. Track the trend: it's the 'are we winning?' number." : "Achilles útkomu-skor — hærra = betra. Fylgstu með þróun: 'erum við að vinna?' talan." },
                    { m: "Single-leg heel-raise pain (VAS 0–10)", c: isEN ? "daily" : "daglega", w: isEN ? "The standard daily provocation test. Feeds the pain-monitoring gate." : "Staðlaða daglega provokations-prófið. Fæðir verkja-vöktunar-hliðið." },
                    { m: "Morning stiffness", c: isEN ? "daily" : "daglega", w: isEN ? "Primary day-to-day tendon marker — must not rise week to week." : "Aðal-daglegi sina-mælikvarðinn — má ekki vaxa milli vikna." },
                    { m: "Single-leg heel-raise reps / height + hop LSI", c: isEN ? "before Stage 3, then monitoring" : "fyrir Fasa 3, svo vöktun", w: isEN ? "Objective symmetry gate: LSI ≥ 90% vs the uninjured side (and restored calf endurance) unlocks energy-storage loading." : "Hlutlægt samhverfu-hlið: LSI ≥ 90% vs heilbrigða hlið (og endurheimt kálfa-úthald) opnar orkugeymslu-hleðslu." },
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
              <h3 className="text-sm font-semibold text-violet-700">{isEN ? "Heel-raise / hop symmetry gate" : "Tá-lyftu / hopp samhverfu-hlið"}</h3>
              <div className="mt-2"><LsiGate isEN={isEN} unitHint={LSI_HINT} metrics={[{ label: HEEL_LSI, value: heelLsi, onChange: setHeelLsi }, { label: HOP_LSI, value: hopLsi, onChange: setHopLsi }]} /></div>
            </div>
          </div>
        )}

        {/* ── TECHNIQUE ── */}
        {tab === "videos" && (
          <div className="space-y-3">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Technique cues" : "Tækni-punktar"}</h2>
            <p className="text-sm text-slate-600">{isEN ? "Key set-up cues per stage. The full evidence base lives in the club's research/ folder." : "Helstu uppsetningar-punktar per fasa. Öll sönnunar-gögnin eru í research/ möppu félagsins."}</p>
            {[
              { h: "Midportion vs insertional", b: isEN ? "Midportion pain sits 2–6 cm above the heel — full range, step drops OK. Insertional pain is at the heel bone — floor-to-neutral only, never below neutral." : "Midportion verkur er 2–6 cm ofan við hæl — fullt ferli, þrep-drop OK. Insertional verkur er við hælbein — floor-to-neutral, aldrei undir neutral." },
              { h: "Isometric heel-raise (Stage 1)", b: isEN ? "Rise to mid-range and hold — slow, controlled, no bouncing. Progress double → single leg as pain allows." : "Lyftu í mið-ferli og haltu — hægt, stýrt, ekkert skopp. Þróaðu tvífætt → einfætt eftir verk." },
              { h: "HSR tempo (Stage 2)", b: isEN ? "3 s up, 3 s down — 6 s per rep, seated (soleus) and standing (gastroc). Control both directions." : "3 s upp, 3 s niður — 6 s per endurtekning, sitjandi (soleus) og standandi (gastroc). Stýrðu báðum áttum." },
              { h: "Alfredson heel-drop (midportion only)", b: isEN ? "Off a step, drop the heel below neutral, straight- and bent-knee. Insertional: skip the step — floor to neutral only." : "Af þrepi, láttu hælinn síga undir neutral, bein og bogin hné. Insertional: slepptu þrepinu — floor to neutral eingöngu." },
              { h: "Soft landing (Stage 3)", b: isEN ? "Land quiet through the whole foot/chain — a loud landing is too much intensity. Progress by hop symmetry, not feel." : "Lentu hljóðlega gegnum allan fót/keðju — hávær lending er of mikill styrkur. Framgangur eftir hopp-samhverfu, ekki tilfinningu." },
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
          ? "Educational protocol reference for Achilles tendinopathy — progression decisions belong to the treating clinician. Criteria-based, never calendar-based. Nothing here changes the player's readiness verdict."
          : "Fræðslu-prótókoll fyrir Achilles-sinabólgu — framgangs-ákvarðanir tilheyra meðhöndlandi klíníker. Viðmiðað, aldrei dagatals. Ekkert hér breytir readiness-niðurstöðu leikmannsins."}
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

function InsertionalNote({ isEN }: { isEN: boolean }) {
  return (
    <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-slate-700">
      <b className="text-amber-700">{isEN ? "Insertional: " : "Insertional: "}</b>
      {isEN
        ? "no dorsiflexion beyond neutral — heel raises floor-to-neutral only, no step, no decline. The step/eccentric-drop rows are removed."
        : "engin dorsiflexion umfram neutral — tá-lyftur floor-to-neutral, ekkert þrep, engin halli. Þrep/eccentric-drop raðir eru fjarlægðar."}
    </div>
  );
}

