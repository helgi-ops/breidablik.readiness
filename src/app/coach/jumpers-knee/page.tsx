"use client";

/**
 * Coach view — Jumper's Knee (patellar tendinopathy): criteria-based staged
 * tendon loading.
 *
 * Four evidence-based tendon-loading stages (Cook & Purdam continuum /
 * Malliaras 2015), gated by a pain-monitoring model (Silbernagel / Thomeé) and
 * by objective force-plate symmetry — never by the calendar. Mirrors the
 * Hamstring Rehab page (src/app/coach/hamstring-rehab/page.tsx).
 *
 * Sources (all in research/): Kongsgaard 2009 (HSR core), Silbernagel 2007
 * (pain-monitoring model), Rio 2015 (isometric analgesia), Malliaras 2015
 * (staged loading), plus the plyometric / control-chaos / RTS papers cited per
 * stage below.
 *
 * EDUCATIONAL protocol reference — progression decisions belong to the treating
 * clinician. Clinical doses stay in English (source language, medical
 * precision); the shell (headings, summaries, disclaimer) is bilingual IS/EN.
 *
 * Nothing on this screen touches the readiness verdict/colour — the tendon
 * stage and pain scores are a descriptive, labelled layer, exactly like every
 * other descriptive surface in the system.
 */

import React from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang";
import { supabase, getSupabaseClient } from "@/lib/supabaseClient";
import SendProtocolToPlayerButton from "@/components/recovery/SendProtocolToPlayerButton";

// Club-specific resource: configured for Breiðablik only. The sidebar hides the
// link for other teams; this guard also blocks direct-URL access.
const BREIDABLIK_TEAM_ID = "94b52a06-0b83-48da-8664-639ec3486a0c";

type Tab = "overview" | "s1" | "s2" | "s3" | "s4" | "testing" | "videos";
type Row = { ex: string; dose: string; notes: string };

// ── Stage exercise tables (English clinical doses) ──────────────────────────
const S1: Row[] = [
  { ex: "Spanish squat / wall-sit / leg-extension isometric hold (~60° knee flexion)", dose: "5 × 45 s · 2–3×/day", notes: "~70% MVC. Rest ~2 min between holds. Gives an analgesic window (~45 min). Stay at an acceptable pain level (≤5/10)." },
  { ex: "Isometric single-leg decline-squat hold (once tolerated)", dose: "5 × 30–45 s", notes: "Progress from double- to single-leg. Controlled, no bouncing." },
  { ex: "Non-provocative strength — posterior chain, calf, trunk, uninjured leg", dose: "normal load", notes: "Keep training everything that doesn't provoke the tendon. Don't detrain the rest of the body." },
  { ex: "Bike / cross-trainer", dose: "15–30 min easy", notes: "Maintain aerobic base, pain-free only." },
];
const S2: Row[] = [
  { ex: "Leg press · squat · hack squat · decline squat", dose: "3–4 sets · slow 6 s tempo (3 s up / 3 s down)", notes: "3×/week on alternate days. Progressive load: 15RM (wk 1) → 12 → 10 → 8 → 6RM (wk ~12)." },
  { ex: "Keep Stage 1 isometric holds on high-pain days", dose: "as needed", notes: "Use the analgesic window before training." },
  { ex: "Minimum programme length", dose: "≥ 12 weeks", notes: "Tendon adaptation is slow — this is not a two-week fix. Morning stiffness is the key day-to-day marker." },
];
const S3: Row[] = [
  { ex: "Progressive SSC: pogos → box jumps (land soft) → CMJ → depth drops → single-leg hops", dose: "progressive · every 3rd day", notes: "Low → high stretch-shortening demand. Land soft and quiet. Respect tendon recovery between sessions." },
  { ex: "Track intensity via RSI-modified from the Force-Plate CMJ", dose: "monitor", notes: "Progress by limb symmetry, not by feel." },
];
const S4: Row[] = [
  { ex: "Control → chaos progression (planned → reactive drills)", dose: "graded", notes: "Low → high speed and volume. Move along the control-chaos continuum toward game-realistic decisions." },
  { ex: "Deceleration & cutting exposure", dose: "built gradually", notes: "The re-provocation risk — add volume then intensity, pain-monitored throughout." },
  { ex: "Sport-specific jumping & repeated-effort work", dose: "graded return to full training", notes: "Reduced minutes first, building back over 2–3 weeks." },
];

const CITATIONS: { label: string; source: string }[] = [
  { label: "Kongsgaard et al. 2009 — Corticosteroid injections, eccentric decline squat & heavy slow resistance in patellar tendinopathy", source: "Scand J Med Sci Sports" },
  { label: "Silbernagel et al. — Continued sports activity using a pain-monitoring model", source: "Am J Sports Med 2007" },
  { label: "Rio et al. 2015 — Isometric exercise reduces patellar tendon pain", source: "Br J Sports Med" },
  { label: "Malliaras et al. 2015 — Patellar tendinopathy: clinical diagnosis, load management & staged loading", source: "J Orthop Sports Phys Ther" },
  { label: "Blanch & Gabbett / Taberner — control-chaos continuum (Stage 4 return grading)", source: "Br J Sports Med" },
];

function ExerciseTable({ rows, isEN }: { rows: Row[]; isEN: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="px-3 py-2 font-semibold">{isEN ? "Exercise" : "Æfing"}</th>
            <th className="px-3 py-2 font-semibold">{isEN ? "Dose" : "Skammtur"}</th>
            <th className="px-3 py-2 font-semibold">{isEN ? "Notes" : "Athugasemdir"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-100 align-top">
              <td className="px-3 py-2 font-medium text-slate-900">{r.ex}</td>
              <td className="px-3 py-2 whitespace-nowrap text-slate-700">{r.dose}</td>
              <td className="px-3 py-2 text-slate-600">{r.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Player-reported markers (from the daily tendon check-in) that inform the gate.
type Reported = { declineVas: number | null; stiffnessVas: number | null; trend: "lower" | "same" | "higher" | null; date: string } | null;

// ── The pain-monitoring gate (Silbernagel / Thomeé) — shown on EVERY stage ───
// The safety rail. Loading is safe within a bounded pain range; this encodes the
// rule and turns three markers into a clear progress / hold / drop-back state.
function PainGate({ isEN, reported }: { isEN: boolean; reported?: Reported }) {
  const [pain, setPain] = React.useState<number | null>(null);
  const [settled, setSettled] = React.useState<"yes" | "no" | null>(null);
  const [stiffness, setStiffness] = React.useState<"lower" | "same" | "higher" | null>(null);

  const answered = pain !== null && settled !== null && stiffness !== null;
  const overLimit = pain !== null && pain > 5;
  const tolerated = answered && !overLimit && settled === "yes" && stiffness !== "higher";

  let verdict: { tone: "ok" | "bad" | "neutral"; head: string; body: string };
  if (!answered) {
    verdict = {
      tone: "neutral",
      head: isEN ? "Log today's markers" : "Skráðu mælingar dagsins",
      body: isEN
        ? "Enter the three markers to get a hold / progress / drop-back read."
        : "Sláðu inn mælingarnar þrjár til að fá hald / áfram / bakka niður.",
    };
  } else if (tolerated) {
    verdict = {
      tone: "ok",
      head: isEN ? "Loading tolerated — hold or progress" : "Álag þolað — haltu eða haltu áfram",
      body: isEN
        ? "Pain within limits, settled by morning, stiffness not rising. The dose is appropriate — hold this stage or progress once the stage's own criteria are met."
        : "Verkur innan marka, sjatnaði í morgun, stífleiki ekki vaxandi. Skammturinn er réttur — haltu þessum fasa eða haltu áfram þegar viðmið fasans standast.",
    };
  } else {
    verdict = {
      tone: "bad",
      head: isEN ? "Back off — reduce load / drop back a stage" : "Bakka — minnka álag / fara niður um fasa",
      body: isEN
        ? `The dose was too high: ${[overLimit ? "pain above 5/10" : null, settled === "no" ? "did not settle by next morning" : null, stiffness === "higher" ? "morning stiffness rising week to week" : null].filter(Boolean).join(" · ")}.`
        : `Skammturinn var of hár: ${[overLimit ? "verkur yfir 5/10" : null, settled === "no" ? "sjatnaði ekki fyrir næsta morgun" : null, stiffness === "higher" ? "morgunstífleiki vaxandi milli vikna" : null].filter(Boolean).join(" · ")}.`,
    };
  }

  const toneCls =
    verdict.tone === "ok"
      ? "border-emerald-300 bg-emerald-50"
      : verdict.tone === "bad"
        ? "border-red-300 bg-red-50"
        : "border-slate-300 bg-slate-50";

  return (
    <div className="rounded-lg border border-violet-300 bg-violet-50/60 p-4">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-700">
          {isEN ? "Pain-monitoring gate — every session" : "Verkja-vöktunar-hlið — hver session"}
        </h4>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500">Silbernagel · Thomeé</span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {isEN
          ? "Pain up to 5/10 during loading is acceptable · must settle to baseline by the next morning · morning stiffness must not rise week to week. Single-leg decline-squat (VAS 0–10) is the daily provocation test."
          : "Verkur allt að 5/10 við álag er í lagi · verður að sjatna í grunnlínu fyrir næsta morgun · morgunstífleiki má ekki vaxa milli vikna. Einfætt decline-squat (VAS 0–10) er daglega provokations-prófið."}
      </p>

      {reported && (reported.declineVas != null || reported.stiffnessVas != null) && (
        <div className="mt-2 rounded-md border border-violet-200 bg-white px-3 py-2 text-xs text-slate-600">
          <b className="text-violet-700">{isEN ? "Player-reported" : "Leikmaður skráði"}</b>{" "}
          <span className="text-slate-400">({reported.date})</span> ·{" "}
          {reported.declineVas != null && <>{isEN ? "decline-squat pain" : "decline-squat verkur"} {reported.declineVas}/10</>}
          {reported.declineVas != null && reported.stiffnessVas != null && " · "}
          {reported.stiffnessVas != null && <>{isEN ? "morning stiffness" : "morgunstífleiki"} {reported.stiffnessVas}/10</>}
          {reported.trend && <> · {isEN ? "stiffness trend" : "stífleika-þróun"} {isEN ? reported.trend : reported.trend === "higher" ? "meiri" : reported.trend === "lower" ? "minni" : "sami"}</>}
          {(reported.declineVas != null && reported.declineVas > 5) || reported.trend === "higher" ? (
            <span className="mt-1 block font-medium text-red-700">{isEN ? "→ player-reported markers say back off" : "→ skráðar mælingar segja: bakka"}</span>
          ) : reported.declineVas != null ? (
            <span className="mt-1 block font-medium text-emerald-700">{isEN ? "→ player-reported markers within limits" : "→ skráðar mælingar innan marka"}</span>
          ) : null}
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-600">{isEN ? "Pain during loading (0–10)" : "Verkur við álag (0–10)"}</span>
          <select
            value={pain ?? ""}
            onChange={(e) => setPain(e.target.value === "" ? null : Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-600">{isEN ? "Settled to baseline by next morning?" : "Sjatnaði í grunnlínu í morgun?"}</span>
          <select
            value={settled ?? ""}
            onChange={(e) => setSettled((e.target.value || null) as "yes" | "no" | null)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            <option value="yes">{isEN ? "Yes" : "Já"}</option>
            <option value="no">{isEN ? "No" : "Nei"}</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-slate-600">{isEN ? "Morning stiffness vs last week" : "Morgunstífleiki vs. síðasta vika"}</span>
          <select
            value={stiffness ?? ""}
            onChange={(e) => setStiffness((e.target.value || null) as "lower" | "same" | "higher" | null)}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            <option value="lower">{isEN ? "Lower" : "Minni"}</option>
            <option value="same">{isEN ? "Same" : "Sami"}</option>
            <option value="higher">{isEN ? "Higher" : "Meiri"}</option>
          </select>
        </label>
      </div>

      <div className={`mt-3 rounded-md border p-3 ${toneCls}`}>
        <b className="block text-sm text-slate-900">{verdict.head}</b>
        <span className="text-sm text-slate-600">{verdict.body}</span>
      </div>
    </div>
  );
}

// ── Force-plate readiness for a selected player (Stage 3 objective gate) ──────
type CmjGate = { asymmetryPct: number | null; jumpHeightCm: number | null; rsiMod: number | null; testDate: string | null } | null;

// Active patellar-tendinopathy flag (player_injuries — authoritative for RTP/RTT).
type InjuryRow = { id: string; injury_type: string; severity: string; status: string; injury_date: string; notes: string | null };

const TABS: { id: Tab; en: string; is: string }[] = [
  { id: "overview", en: "Overview", is: "Yfirlit" },
  { id: "s1", en: "Stage 1 · Isometric", is: "Fasi 1 · Ísómetrísk" },
  { id: "s2", en: "Stage 2 · HSR", is: "Fasi 2 · HSR" },
  { id: "s3", en: "Stage 3 · Energy storage", is: "Fasi 3 · Orkugeymsla" },
  { id: "s4", en: "Stage 4 · Return to sport", is: "Fasi 4 · Aftur í íþrótt" },
  { id: "testing", en: "Testing", is: "Próf" },
  { id: "videos", en: "Technique", is: "Tækni" },
];

export default function JumpersKneePage() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const [tab, setTab] = React.useState<Tab>("overview");
  const [allowed, setAllowed] = React.useState<boolean | null>(null);

  // Optional player context — powers the Stage 3 force-plate gate + the send button.
  const [players, setPlayers] = React.useState<{ id: string; full_name: string | null }[]>([]);
  const [playerId, setPlayerId] = React.useState("");
  const [cmj, setCmj] = React.useState<CmjGate>(null);
  const [cmjLoading, setCmjLoading] = React.useState(false);
  const [cmjError, setCmjError] = React.useState<string | null>(null);
  const [checkins, setCheckins] = React.useState<{ entry_date: string; decline_squat_vas: number | null; morning_stiffness_vas: number | null }[]>([]);
  const [userId, setUserId] = React.useState<string | null>(null);
  const [teamId, setTeamId] = React.useState<string | null>(null);

  // Injury flag (patellar tendinopathy) for the selected player.
  const [injury, setInjury] = React.useState<InjuryRow | null>(null);
  const [injurySeverity, setInjurySeverity] = React.useState<"mild" | "moderate" | "severe">("moderate");
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

  // Fetch the RTP assessment for the selected player; read only the CMJ block.
  React.useEffect(() => {
    if (!playerId) { setCmj(null); setCmjError(null); return; }
    let active = true;
    (async () => {
      setCmjLoading(true); setCmjError(null);
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const res = await fetch(`/api/coach/rtp/${playerId}`, {
          headers: { Authorization: `Bearer ${sess.session?.access_token ?? ""}` },
        });
        const json = (await res.json()) as { ok?: boolean; assessment?: { cmj?: CmjGate }; error?: string };
        if (!active) return;
        if (!res.ok || !json.ok) { setCmjError(json.error ?? `HTTP ${res.status}`); setCmj(null); return; }
        setCmj(json.assessment?.cmj ?? null);
      } catch {
        if (active) setCmjError(isEN ? "Could not load force-plate data" : "Gat ekki sótt kraftplötu-gögn");
      } finally {
        if (active) setCmjLoading(false);
      }
    })();
    return () => { active = false; };
  }, [playerId, isEN]);

  // Recent player-reported tendon check-ins (RLS lets a coach read own-team rows).
  React.useEffect(() => {
    if (!playerId) { setCheckins([]); return; }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("patellar_tendon_checkins")
        .select("entry_date, decline_squat_vas, morning_stiffness_vas")
        .eq("player_id", playerId)
        .order("entry_date", { ascending: false })
        .limit(21);
      if (active) setCheckins((data ?? []) as { entry_date: string; decline_squat_vas: number | null; morning_stiffness_vas: number | null }[]);
    })();
    return () => { active = false; };
  }, [playerId]);

  // Latest reported markers + week-over-week morning-stiffness trend.
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
    return { declineVas: latest.decline_squat_vas, stiffnessVas: latest.morning_stiffness_vas, trend, date: latest.entry_date };
  }, [playerId, checkins]);

  // Active patellar-tendinopathy flag for the selected player.
  const loadInjury = React.useCallback(async (pid: string) => {
    const { data } = await supabase
      .from("player_injuries")
      .select("id, injury_type, severity, status, injury_date, notes")
      .eq("player_id", pid)
      .neq("status", "cleared")
      .or("injury_type.ilike.%patellar%,injury_type.ilike.%tendinop%,injury_type.ilike.%jumper%")
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
    if (!window.confirm(isEN ? `Flag ${selectedName ?? "this player"} as managing patellar tendinopathy?` : `Merkja ${selectedName ?? "þennan leikmann"} sem með sinabólgu í hnéskel?`)) return;
    setInjuryBusy(true); setInjuryMsg(null);
    const { error } = await supabase.from("player_injuries").insert({
      player_id: playerId,
      team_id: teamId,
      injury_date: new Date().toISOString().slice(0, 10),
      body_part: "Knee",
      injury_type: "Patellar tendinopathy (jumper's knee)",
      severity: injurySeverity,
      status: "injured",
      rtp_stage: 0,
      notes: `Jumper's Knee staged loading — Stage ${injuryStage}`,
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
    const { error } = await supabase.from("player_injuries")
      .update({ notes: `Jumper's Knee staged loading — Stage ${stage}`, updated_at: new Date().toISOString() })
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
          {isEN ? "Jumper's Knee — Staged Tendon Loading" : "Stökkhné — Þrepaskipt sinaálag"}
        </h1>
        <SendProtocolToPlayerButton slug="jumpers_knee_staged_loading" lang={isEN ? "EN" : "IS"} />
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        {isEN
          ? "Criteria-based, pain-monitored staged loading for patellar tendinopathy. Progression unlocks on pain + symmetry — never the calendar. Jumper's knee is a load-management problem, not a rest problem."
          : "Viðmiðuð, verkja-vöktuð þrepaskipt hleðsla fyrir sinabólgu í hnéskel. Framgangur opnast á verk + samhverfu — aldrei dagatalinu. Stökkhné er álagsstjórnunar-vandi, ekki hvíldarvandi."}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {isEN ? "Sources: " : "Heimildir: "}
        Cook &amp; Purdam continuum · Malliaras 2015 · Kongsgaard 2009 (HSR) · Silbernagel (pain gate) · Rio 2015 (isometric analgesia)
      </p>

      {/* Medical disclaimer — always visible */}
      <div className="mt-4 rounded-lg border-l-4 border-red-400 bg-red-50 p-4 text-sm text-slate-700">
        <b className="text-red-700">{isEN ? "Read first: " : "Lestu fyrst: "}</b>
        {isEN
          ? "Educational protocol reference — not medical advice. Have the tendon diagnosed by a clinician first (rule out patellar fat-pad, patellofemoral pain, Osgood-Schlatter, a partial tear). Progression is criteria-based, never calendar-based — week ranges are indicative only. Progression decisions belong to the treating clinician; every recommendation here is overridable."
          : "Fræðslu-prótókoll — ekki læknisráð. Láttu klíníker greina sinina fyrst (útiloka fitupúða, patellofemoral verki, Osgood-Schlatter, hlutarif). Framgangur er viðmiðaður, aldrei dagatals — vikubil eru aðeins til viðmiðunar. Framgangs-ákvarðanir tilheyra meðhöndlandi klíníker; sérhver ábending hér er yfirtakanleg."}
      </div>

      {/* Player context (optional) — drives the Stage 3 force-plate gate */}
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
          {isEN
            ? "Pick a player to check their Force-Plate CMJ symmetry against the Stage 3 gate."
            : "Veldu leikmann til að athuga CMJ-samhverfu úr kraftplötu gegn Fasa 3 hliðinu."}
        </span>
      </div>

      {/* Injury flag — surfaces the player on RTP / Return-to-training. Descriptive; never touches readiness. */}
      {playerId && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{isEN ? "Injury flag" : "Meiðsla-flagg"}</div>
          {injury ? (
            <div className="mt-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">{isEN ? "Managing patellar tendinopathy" : "Í meðferð: sinabólga í hnéskel"}</span>
                <span className="text-xs text-slate-500">{isEN ? "since" : "síðan"} {injury.injury_date} · {injury.severity}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {isEN ? "Appears on RTP / Return-to-training surfaces. This is a clinical flag — it does not change the readiness colour." : "Birtist á RTP / Aftur-í-æfingar flötum. Þetta er klínískt flagg — það breytir ekki readiness-litnum."}
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
                {injuryBusy ? (isEN ? "Saving…" : "Vista…") : (isEN ? "Flag as managing patellar tendinopathy" : "Merkja sem sinabólgu í hnéskel")}
              </button>
            </div>
          )}
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
              tab === t.id
                ? "border-violet-600 bg-violet-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-violet-400"
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
                  ? "Four staged loading phases on the Cook & Purdam tendon continuum. The right dose of load at the right stage — tracked against pain that is allowed but bounded. Progression is criteria-based (pain within limits + strength/symmetry restored), shown as a tab set."
                  : "Fjórir hleðslufasar á Cook & Purdam sina-samfellunni. Réttur álagsskammtur á réttum fasa — mældur gegn verk sem er leyfður en innan marka. Framgangur er viðmiðaður (verkur innan marka + styrkur/samhverfa endurheimt)."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { id: "s1" as Tab, t: isEN ? "1 · Isometric" : "1 · Ísómetrísk", s: isEN ? "pain relief + load tolerance" : "verkjastilling + þol" },
                { id: "s2" as Tab, t: isEN ? "2 · HSR / isotonic" : "2 · HSR / isótónísk", s: isEN ? "tendon remodeling (≥12 wk)" : "sina-endurmótun (≥12 vk)" },
                { id: "s3" as Tab, t: isEN ? "3 · Energy storage" : "3 · Orkugeymsla", s: isEN ? "plyometrics — force-plate gated" : "plyometrics — kraftplötu-hlið" },
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
                { h: isEN ? "Pain is allowed — within limits" : "Verkur er leyfður — innan marka", b: isEN ? "Loading (and even play) is safe up to 5/10 pain that settles by the next morning. Rest deconditions the tendon; the fix is graded load, not offloading." : "Álag (og jafnvel leikur) er öruggt upp að 5/10 verk sem sjatnar fyrir næsta morgun. Hvíld afþjálfar sinina; lausnin er þrepaskipt álag, ekki að létta af." },
                { h: isEN ? "Morning stiffness is the marker" : "Morgunstífleiki er mælikvarðinn", b: isEN ? "The primary day-to-day tendon marker. If it rises week to week, the dose was too high — drop back." : "Aðal-daglegi sina-mælikvarðinn. Ef hann vex milli vikna var skammturinn of hár — bakkaðu." },
                { h: isEN ? "Symmetry unlocks the spring" : "Samhverfa opnar fjöðrunina", b: isEN ? "Stage 3 plyometrics wait for Force-Plate CMJ limb asymmetry < 10% — progress by symmetry, not by feel." : "Fasi 3 plyometrics bíða eftir CMJ-ósamhverfu < 10% — framgangur eftir samhverfu, ekki tilfinningu." },
                { h: isEN ? "Track VISA-P weekly" : "Fylgstu með VISA-P vikulega", b: isEN ? "The 0–100 patellar-tendinopathy outcome score (higher = better). It's the 'are we winning?' number." : "0–100 útkomu-skor fyrir sinabólgu (hærra = betra). Þetta er 'erum við að vinna?' talan." },
              ].map((c, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-violet-700">{c.h}</h3>
                  <p className="mt-1 text-sm text-slate-600">{c.b}</p>
                </div>
              ))}
            </div>

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
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Stage 1 — Isometric loading" : "Fasi 1 — Ísómetrísk hleðsla"} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{isEN ? "pain relief + load tolerance" : "verkjastilling + þol"}</span></h2>
              <p className="mt-1 text-sm text-slate-600"><b>{isEN ? "Goal:" : "Markmið:"}</b> {isEN ? "settle an irritable, high-pain tendon and build load tolerance. Isometric quad loading gives an analgesic window (reduced tendon pain for up to ~45 min) and lets the player keep training around it." : "róa pirraða, verkjaða sin og byggja upp þol. Ísómetrísk quad-hleðsla gefur verkja-glugga (~45 mín) og leyfir leikmanni að æfa í kringum það."}</p>
            </div>
            <ExerciseTable rows={S1} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: Rio et al. 2015 (isometric analgesia) + the isometric-dosing tendon set in research/." : "Heimild: Rio et al. 2015 (ísómetrísk verkjastilling) + ísómetríska skammta-settið í research/."}</p>
            <PainGate isEN={isEN} reported={reported} />
          </div>
        )}

        {/* ── STAGE 2 ── */}
        {tab === "s2" && (
          <div className="space-y-4">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Stage 2 — Isotonic / Heavy Slow Resistance" : "Fasi 2 — Isótónísk / Heavy Slow Resistance"} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{isEN ? "the core — ≥ 12 weeks" : "kjarninn — ≥ 12 vikur"}</span></h2>
              <p className="mt-1 text-sm text-slate-600"><b>{isEN ? "Goal:" : "Markmið:"}</b> {isEN ? "remodel the tendon with heavy slow resistance. HSR matches eccentric decline-squat for symptoms but with the best long-term satisfaction and elevated collagen turnover in the head-to-head RCT." : "endurmóta sinina með þungri hægri mótstöðu. HSR jafnast á við eccentric decline-squat en með bestu langtíma-ánægju og aukinni collagen-veltu í samanburðar-RCT."}</p>
            </div>
            <ExerciseTable rows={S2} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: Kongsgaard et al. 2009 (HSR core evidence); systematic reviews of Achilles & patellar tendinopathy loading in research/." : "Heimild: Kongsgaard et al. 2009 (HSR kjarna-sönnun); yfirlitsgreinar um Achilles & patellar sinaálag í research/."}</p>
            <PainGate isEN={isEN} reported={reported} />
          </div>
        )}

        {/* ── STAGE 3 ── (force-plate gated) */}
        {tab === "s3" && (
          <div className="space-y-4">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Stage 3 — Energy-storage loading" : "Fasi 3 — Orkugeymslu-hleðsla"} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{isEN ? "reintroduce the spring" : "endurvekja fjöðrunina"}</span></h2>
              <p className="mt-1 text-sm text-slate-600"><b>{isEN ? "Goal:" : "Markmið:"}</b> {isEN ? "reload the stretch-shortening cycle with progressive plyometrics — only once pain is controlled at Stage 2 loads and force-plate symmetry is restored." : "endurhlaða teygju-styttingar-hringinn með stigvaxandi plyometrics — aðeins þegar verkur er í skefjum við Fasa 2 álag og kraftplötu-samhverfa er endurheimt."}</p>
            </div>

            {/* Force-plate objective gate — no-data never passes */}
            <ForcePlateGate isEN={isEN} playerId={playerId} playerName={selectedName} cmj={cmj} loading={cmjLoading} error={cmjError} />

            <ExerciseTable rows={S3} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: plyometric-intensity papers (RSI-mod, RFD & GRF) + plyometric programming in soccer, research/." : "Heimild: plyometric-styrkleika greinar (RSI-mod, RFD & GRF) + plyometric forritun í fótbolta, research/."}</p>
            <PainGate isEN={isEN} reported={reported} />
          </div>
        )}

        {/* ── STAGE 4 ── */}
        {tab === "s4" && (
          <div className="space-y-4">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Stage 4 — Energy storage + release / Return to sport" : "Fasi 4 — Orkugeymsla + losun / Aftur í íþrótt"} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{isEN ? "control → chaos" : "stýrt → óreiða"}</span></h2>
              <p className="mt-1 text-sm text-slate-600"><b>{isEN ? "Goal:" : "Markmið:"}</b> {isEN ? "sport-specific jumping, cutting and deceleration, graded back to full training along the control-chaos continuum (planned → reactive, low → high speed/volume)." : "íþrótta-sértækt stökk, skurðir og hraðaminnkun, þrepað aftur í fullar æfingar eftir stýrða-óreiðu ásnum (skipulagt → viðbragð, lágt → hátt hraði/magn)."}</p>
            </div>
            <ExerciseTable rows={S4} isEN={isEN} />
            <p className="text-xs text-slate-500">{isEN ? "Source: control-chaos continuum + a proposed return-to-sport program, applied to patellar, research/." : "Heimild: stýrða-óreiðu ásinn + return-to-sport prógramm, heimfært á patellar, research/."}</p>
            <PainGate isEN={isEN} reported={reported} />
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
                    { m: "VISA-P questionnaire (0–100)", c: isEN ? "weekly" : "vikulega", w: isEN ? "The patellar-tendinopathy outcome score — higher = better. Track the trend: it's the 'are we winning?' number." : "Útkomu-skor sinabólgu — hærra = betra. Fylgstu með þróun: 'erum við að vinna?' talan." },
                    { m: "Single-leg decline-squat pain (VAS 0–10)", c: isEN ? "daily" : "daglega", w: isEN ? "The standard daily provocation test. Feeds the pain-monitoring gate." : "Staðlaða daglega provokations-prófið. Fæðir verkja-vöktunar-hliðið." },
                    { m: "Morning stiffness", c: isEN ? "daily" : "daglega", w: isEN ? "Primary day-to-day tendon marker — must not rise week to week." : "Aðal-daglegi sina-mælikvarðinn — má ekki vaxa milli vikna." },
                    { m: "Force-Plate CMJ — limb asymmetry, jump height, RSI-mod", c: isEN ? "before Stage 3, then monitoring" : "fyrir Fasa 3, svo vöktun", w: isEN ? "Objective symmetry gate: asymmetry < 10% (and restored height / RSI-mod) unlocks energy-storage loading." : "Hlutlægt samhverfu-hlið: ósamhverfa < 10% (og endurheimt hæð / RSI-mod) opnar orkugeymslu-hleðslu." },
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
              <h3 className="text-sm font-semibold text-violet-700">{isEN ? "Force-plate readiness (selected player)" : "Kraftplötu-staða (valinn leikmaður)"}</h3>
              <div className="mt-2">
                <ForcePlateGate isEN={isEN} playerId={playerId} playerName={selectedName} cmj={cmj} loading={cmjLoading} error={cmjError} />
              </div>
            </div>
          </div>
        )}

        {/* ── TECHNIQUE ── */}
        {tab === "videos" && (
          <div className="space-y-3">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Technique cues" : "Tækni-punktar"}</h2>
            <p className="text-sm text-slate-600">{isEN ? "Key set-up cues per stage. The full evidence base (dosing papers, systematic reviews) lives in the club's research/ folder." : "Helstu uppsetningar-punktar per fasa. Öll sönnunar-gögnin (skammta-greinar, yfirlit) eru í research/ möppu félagsins."}</p>
            {[
              { h: "Spanish squat (Stage 1)", b: isEN ? "Band behind the knees, shins vertical, sit back to ~60° knee flexion and hold. Long lever loads the quad/tendon without the ankle limiting depth." : "Teygja aftan við hné, sköflungar lóðréttir, sestu aftur í ~60° hnébeygju og haltu. Langur vogarstöng hleður quad/sin án þess að ökkli takmarki dýpt." },
              { h: "HSR tempo (Stage 2)", b: isEN ? "3 s down, 3 s up — 6 s per rep. Control both directions; the slow eccentric-concentric is what drives collagen turnover, not bouncing." : "3 s niður, 3 s upp — 6 s per endurtekning. Stýrðu báðum áttum; hæga eccentric-concentric er það sem knýr collagen-veltu, ekki að skoppa." },
              { h: "Decline-squat angle (Stage 2)", b: isEN ? "25° decline board increases patellar-tendon load vs a flat squat by dropping the heel and shifting load forward onto the knee." : "25° halla-bretti eykur patellar-sina-álag vs flöt hnébeygja með því að lækka hælinn og færa álag fram á hnéð." },
              { h: "Soft landing (Stage 3)", b: isEN ? "Land quiet, hips back, knees tracking over toes — no valgus collapse. Absorb through the whole chain; a loud landing is too much intensity." : "Lentu hljóðlega, mjaðmir aftur, hné yfir tám — ekkert valgus-hrun. Taktu á móti gegnum alla keðjuna; hávær lending er of mikill styrkur." },
              { h: "Control → chaos (Stage 4)", b: isEN ? "Start planned and slow (cones you know), progress to reactive and fast (respond to a signal). Add deceleration and cutting volume before intensity." : "Byrjaðu skipulagt og hægt (keilur sem þú þekkir), þróaðu í viðbragð og hratt (svaraðu merki). Bættu hraðaminnkun og skurð-magni við á undan styrk." },
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
          ? "Educational protocol reference for patellar tendinopathy — progression decisions belong to the treating clinician. Criteria-based, never calendar-based. Nothing here changes the player's readiness verdict."
          : "Fræðslu-prótókoll fyrir sinabólgu í hnéskel — framgangs-ákvarðanir tilheyra meðhöndlandi klíníker. Viðmiðað, aldrei dagatals. Ekkert hér breytir readiness-niðurstöðu leikmannsins."}
      </footer>
    </div>
  );
}

// ── Stage-3 force-plate gate component ──────────────────────────────────────
function ForcePlateGate({
  isEN, playerId, playerName, cmj, loading, error,
}: {
  isEN: boolean;
  playerId: string;
  playerName: string | null;
  cmj: CmjGate;
  loading: boolean;
  error: string | null;
}) {
  // No player picked, still loading, error, or no CMJ on file → pending, never a pass.
  if (!playerId) {
    return (
      <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50/60 p-4 text-sm text-slate-600">
        🔒 {isEN ? "Stage 3 locked — pick a player above to check Force-Plate CMJ symmetry." : "Fasi 3 læstur — veldu leikmann að ofan til að athuga CMJ-samhverfu."}
      </div>
    );
  }
  if (loading) {
    return <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">{isEN ? "Loading force-plate data…" : "Sæki kraftplötu-gögn…"}</div>;
  }
  if (error) {
    return <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50/60 p-4 text-sm text-slate-600">🔒 {isEN ? "Stage 3 locked — could not read force-plate data" : "Fasi 3 læstur — gat ekki lesið kraftplötu-gögn"} ({error}).</div>;
  }
  const asym = cmj?.asymmetryPct ?? null;
  if (asym == null) {
    return (
      <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50/60 p-4 text-sm text-slate-600">
        🔒 {isEN ? `Stage 3 locked — no Force-Plate CMJ asymmetry on file for ${playerName ?? "this player"}. No data is not a pass — run a CMJ first.` : `Fasi 3 læstur — engin CMJ-ósamhverfa til fyrir ${playerName ?? "þennan leikmann"}. Engin gögn er ekki grænt ljós — taktu CMJ fyrst.`}
      </div>
    );
  }
  const met = asym < 10;
  const gap = (asym - 10).toFixed(1);
  return (
    <div className={`rounded-lg border p-4 text-sm ${met ? "border-emerald-300 bg-emerald-50" : "border-amber-400 bg-amber-50"}`}>
      <b className="block text-slate-900">
        {met ? "🔓 " : "🔒 "}
        {met
          ? (isEN ? "Stage 3 unlocked — symmetry criterion met" : "Fasi 3 opnaður — samhverfu-viðmið uppfyllt")
          : (isEN ? "Stage 3 locked — symmetry criterion not met" : "Fasi 3 læstur — samhverfu-viðmið ekki uppfyllt")}
      </b>
      <span className="mt-1 block text-slate-600">
        {met
          ? (isEN
              ? `CMJ limb asymmetry ${asym.toFixed(1)}% < 10% ✓ for ${playerName ?? "player"}. Confirm pain is controlled at Stage 2 loads, then progress to energy-storage plyometrics.`
              : `CMJ-ósamhverfa ${asym.toFixed(1)}% < 10% ✓ fyrir ${playerName ?? "leikmann"}. Staðfestu að verkur sé í skefjum við Fasa 2 álag, haltu svo áfram í orkugeymslu-plyometrics.`)
          : (isEN
              ? `Counterfactual: asymmetry ${asym.toFixed(1)}% → needs < 10% to progress to Stage 3 (${gap} points over). Hold at Stage 2 and keep building symmetry.`
              : `Gagnstæða: ósamhverfa ${asym.toFixed(1)}% → þarf < 10% til að fara í Fasa 3 (${gap} stig yfir). Haltu í Fasa 2 og haltu áfram að byggja samhverfu.`)}
      </span>
      {cmj && (cmj.jumpHeightCm != null || cmj.rsiMod != null) && (
        <span className="mt-1 block text-xs text-slate-500">
          {isEN ? "Also restore: " : "Endurheimtu líka: "}
          {cmj.jumpHeightCm != null ? `jump height ${cmj.jumpHeightCm.toFixed(1)} cm` : ""}
          {cmj.jumpHeightCm != null && cmj.rsiMod != null ? " · " : ""}
          {cmj.rsiMod != null ? `RSI-mod ${cmj.rsiMod.toFixed(2)}` : ""}
          {cmj.testDate ? ` · ${cmj.testDate}` : ""}
        </span>
      )}
    </div>
  );
}
