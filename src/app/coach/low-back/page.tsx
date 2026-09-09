"use client";

/**
 * Coach view — Low Back (non-specific mechanical LBP): a criteria-gated staged
 * track (clearance → settle+foundation → mobility → loaded strengthening →
 * power/rotational → running/RTS). Parallel to the calf / Achilles / adductor
 * rehab pages, but the low back carries the sport's most important RED-FLAG gate
 * (cauda equina is an emergency).
 *
 * Honest framing: most LBP is non-specific (Maher 2017); exercise helps
 * (Hayden 2021 Cochrane) but no single type is clearly superior (Saragiotto 2016);
 * the McGill big-3 is a reasonable trunk-endurance base, not proven-best.
 * EDUCATIONAL reference — a clinician clears red flags / radicular / directional
 * preference and gates loaded progression. Nothing here touches the readiness colour.
 */
import React from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang";
import { supabase } from "@/lib/supabaseClient";
import SendProtocolToPlayerButton from "@/components/recovery/SendProtocolToPlayerButton";
import { ExerciseTable, type Row } from "@/components/rehab/tendonLoading";

const BREIDABLIK_TEAM_ID = "94b52a06-0b83-48da-8664-639ec3486a0c";

const FOUNDATION: Row[] = [
  { ex: "Settle provocation + normalise the daily pattern (sitting / hinge)", dose: "as needed", notes: "Reduce the aggravating loads; restore pain-free range before progressing." },
  { ex: "Trunk-endurance base — McGill big-3 (curl-up, side bridge, bird-dog)", dose: "endurance holds, not max reps", notes: "~8 s holds, several reps, most days. A reasonable base — coach-overridable, not proven superior (Saragiotto 2016)." },
  { ex: "Breathing / bracing", dose: "daily", notes: "Learn to brace without breath-holding; carry it into the hinge." },
];
const MOBILITY: Row[] = [
  { ex: "Hip internal-rotation mobilisation (90/90)", dose: "2 × 8 / side", notes: "Regional interdependence — reduced hip IR loads the lumbar spine." },
  { ex: "Thoracic rotation (open-book / quadruped)", dose: "2 × 8 / side", notes: "T-spine stiffness pushes motion into the low back — free it up." },
  { ex: "Hip-hinge patterning (dowel: head / mid-back / sacrum)", dose: "3 × 8", notes: "A competent hinge spares the spine; it is also the OHSA forward-lean driver." },
];
const STRENGTH: Row[] = [
  { ex: "Progressive hip-hinge loading (RDL / hip thrust / KB)", dose: "3 × 6–10", notes: "Load the pattern, not the spine. Build tolerance gradually." },
  { ex: "Anti-flexion / anti-rotation carries (Pallof, suitcase carry)", dose: "3 × 8–10 / side · 3 × 20–30 m", notes: "Loaded trunk endurance under real demands." },
  { ex: "Posterior-chain capacity", dose: "progressive", notes: "Football emphasis = strength-endurance + rotational tolerance." },
];
const POWER: Row[] = [
  { ex: "Energy-storage + rotational power (med-ball throws, chops)", dose: "criteria-based", notes: "Only once strength benchmarks are met. Quality over volume." },
];
const RUNNING: Row[] = [
  { ex: "Graded running → sprint / cutting → sport-specific", dose: "criteria-gated", notes: "Meet criteria first; prior-LBP players are higher risk — manage load, don't predict." },
  { ex: "Ongoing load-management", dose: "ongoing", notes: "Avoid sudden training-load spikes (ACWR-style monitoring, for management not prediction)." },
];

const CITATIONS: { label: string; source: string }[] = [
  { label: "Maher, Underwood & Buchbinder 2017 — Non-specific low back pain (landmark Lancet LBP series)", source: "Lancet" },
  { label: "Hayden et al. 2021 — Exercise therapy for chronic low back pain (reduces pain + disability)", source: "Cochrane Database Syst Rev" },
  { label: "Saragiotto et al. 2016 — Motor-control exercise for chronic LBP (≈ other exercise, > minimal intervention)", source: "Cochrane Database Syst Rev" },
  { label: "McGill — Low Back Disorders (trunk-endurance 'big-3' model; practitioner-standard, cited not reproduced)", source: "Human Kinetics" },
  { label: "Regional interdependence — hip IR + thoracic-spine mobility load-share off the lumbar spine", source: "clinical framework" },
];

export default function LowBackPage() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const [allowed, setAllowed] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (active) setAllowed(false); return; }
      const { data } = await supabase.from("profiles").select("team_id").eq("id", user.id).maybeSingle();
      if (active) setAllowed((data as { team_id?: string } | null)?.team_id === BREIDABLIK_TEAM_ID);
    })();
    return () => { active = false; };
  }, []);

  if (allowed === null) return <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-slate-500">{isEN ? "Loading…" : "Sæki…"}</div>;
  if (!allowed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-slate-900">{isEN ? "Not available for this team" : "Ekki í boði fyrir þetta lið"}</h1>
        <p className="mt-2 text-sm text-slate-600">{isEN ? "This rehab protocol is configured for Breiðablik only." : "Þetta endurhæfingar-prótókoll er stillt fyrir Breiðablik eingöngu."}</p>
        <Link href="/coach/rehab-protocols" className="mt-4 inline-block text-sm text-primary hover:underline">← {isEN ? "Back to rehab protocols" : "Til baka í endurhæfingar-prótókoll"}</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Link href="/coach/rehab-protocols" className="hover:text-slate-700">{isEN ? "Rehab protocols" : "Endurhæfingar-prótókoll"}</Link>
        <span>›</span><span>{isEN ? "Low back" : "Mjóbak"}</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">{isEN ? "Low Back — Staged Track" : "Mjóbak — Þrepaskiptur ferill"}</h1>
        <SendProtocolToPlayerButton slug="low_back_staged_loading" lang={isEN ? "EN" : "IS"} />
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        {isEN
          ? "For clinician-cleared NON-SPECIFIC mechanical low-back pain (+ asymptomatic capacity prehab). Capacity + motor control + mobility + load management — not a named lesion. Progression is criteria-based and clinician-gated."
          : "Fyrir klíníker-heimilaðan ÓSÉRTÆKAN vélrænan mjóbaksverk (+ einkennalausa getu-prehab). Geta + hreyfistjórn + hreyfanleiki + álagsstjórn — ekki nefnd meinsemd. Framgangur er viðmiðaður og klíníker-stýrður."}
      </p>

      {/* RED-FLAG GATE — the single most important step, prominent above everything. */}
      <div className="mt-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-4 text-sm text-slate-800">
        <b className="text-red-700">⛔ {isEN ? "STOP — red flags → clinician immediately: " : "STOPP — rauð flögg → klíníker strax: "}</b>
        {isEN
          ? "leg pain / numbness or radicular signs, saddle anaesthesia, bladder / bowel change, night pain, significant trauma, or systemic features (fever, unexplained weight loss). Cauda equina is an emergency. This track is ONLY for non-specific mechanical LBP a clinician has cleared. Directional preference (centralisation / McKenzie) is clinician-assessed — not a coach default."
          : "fótverkur / dofi eða radicular einkenni, hnakk-deyfing (saddle), breyting á þvag- / þarmastarfsemi, næturverkur, umtalsvert áfall, eða almenn einkenni (hiti, óútskýrt þyngdartap). Cauda equina er neyðartilvik. Þessi ferill er AÐEINS fyrir ósértækan vélrænan mjóbaksverk sem klíníker hefur heimilað. Stefnu-val (centralisation / McKenzie) er metið af klíníker — ekki sjálfgefið hjá þjálfara."}
      </div>

      {/* Honest evidence framing */}
      <div className="mt-3 rounded-lg border-l-4 border-amber-400 bg-amber-50/70 p-4 text-sm text-slate-700">
        <b className="text-amber-800">{isEN ? "Evidence — read first: " : "Sönnun — lestu fyrst: "}</b>
        {isEN
          ? "Most LBP is non-specific — no identifiable pain-generating structure (Maher 2017), so this targets capacity, motor control and load, not a named disc/facet lesion. Exercise helps (Hayden 2021 Cochrane) but no single type is clearly superior (Saragiotto 2016) — the McGill big-3 is a reasonable trunk-endurance base, coach-overridable, not proven-best."
          : "Flestur mjóbaksverkur er ósértækur — engin greinanleg verkjagjafa-bygging (Maher 2017), svo þetta beinist að getu, hreyfistjórn og álagi, ekki nefndri disk-/facet meinsemd. Æfing hjálpar (Hayden 2021 Cochrane) en engin ein tegund er skýrt betri (Saragiotto 2016) — McGill big-3 er sanngjarn búk-þol grunnur, hnekkjanlegur, ekki sannaður bestur."}
      </div>

      {/* Phase 1 — clearance + outcome measure */}
      <section className="mt-5">
        <div className="rounded-lg border border-slate-200 border-t-4 border-t-emerald-500 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">{isEN ? "Phase 1 · Screen / clearance (clinician)" : "Fasi 1 · Skimun / heimild (klíníker)"}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {isEN
              ? "A clinician confirms non-specific mechanical LBP — red flags & radicular signs ruled out; directional-preference and structural calls are clinician territory. Record a baseline outcome measure — Oswestry Disability Index (ODI) or Roland-Morris (RMDQ) — and re-measure to track change."
              : "Klíníker staðfestir ósértækan vélrænan mjóbaksverk — rauð flögg & radicular einkenni útilokuð; stefnu-val og byggingar-mat er klíníker-svæði. Skráðu grunn-útkomumælingu — Oswestry (ODI) eða Roland-Morris (RMDQ) — og endurmældu til að fylgjast með breytingu."}
          </p>
          <p className="mt-2 inline-block rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">{isEN ? "Outcome measure: ODI or RMDQ (baseline + re-measure)" : "Útkomumæling: ODI eða RMDQ (grunnur + endurmæling)"}</p>
        </div>
      </section>

      {/* Phase 2 */}
      <section className="mt-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Phase 2 — Settle + foundation (trunk endurance / motor control)" : "Fasi 2 — Róa + grunnur (búk-þol / hreyfistjórn)"}</h2>
        <div className="mt-2"><ExerciseTable rows={FOUNDATION} isEN={isEN} /></div>
      </section>

      {/* Phase 2b */}
      <section className="mt-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Phase 2b — Mobility contributors (hip IR + T-spine + hinge)" : "Fasi 2b — Hreyfanleika-þættir (mjaðma-IR + brjósthryggur + hinge)"}<span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{isEN ? "regional interdependence" : "regional interdependence"}</span></h2>
        <div className="mt-2"><ExerciseTable rows={MOBILITY} isEN={isEN} /></div>
      </section>

      {/* Phase 3 */}
      <section className="mt-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Phase 3 — Loaded strengthening (clinician-gated)" : "Fasi 3 — Hlaðin styrking (klíníker-stýrt)"}</h2>
        <div className="mt-2"><ExerciseTable rows={STRENGTH} isEN={isEN} /></div>
      </section>

      {/* Phase 4 */}
      <section className="mt-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Phase 4 — Power / plyometric + rotational" : "Fasi 4 — Afl / plyometric + snúningur"}</h2>
        <div className="mt-2"><ExerciseTable rows={POWER} isEN={isEN} /></div>
      </section>

      {/* Phase 5 */}
      <section className="mt-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Phase 5 — Running / sport reintegration → RTS" : "Fasi 5 — Hlaup / endurkoma í íþrótt → RTS"}</h2>
        <div className="mt-2"><ExerciseTable rows={RUNNING} isEN={isEN} /></div>
      </section>

      {/* Load-link note */}
      <div className="mt-5 rounded-lg border-l-4 border-emerald-400 bg-emerald-50/50 p-4 text-sm text-slate-600">
        {isEN
          ? "Sudden training-load spikes associate with LBP, and a prior episode raises risk — a higher-risk player to watch. Prevention is load-management, not prediction: individualise, keep trunk + hip capacity high, and manage sudden running / sprint / workload spikes. This screen is descriptive — it never moves the readiness colour."
          : "Skyndilegir álags-toppar tengjast mjóbaksverk, og fyrri kafli eykur áhættu — leikmaður í meiri áhættu. Forvörn er álagsstjórn, ekki spá: einstaklingsmiðaðu, haltu búk- + mjaðma-getu hárri og stýrðu skyndilegum hlaupa- / spretti- / álags-toppum. Þetta skjár er lýsandi — hreyfir aldrei readiness-litinn."}
      </div>

      {/* Citations */}
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">{isEN ? "Evidence base" : "Sönnunar-grunnur"}</h3>
        <ul className="mt-2 space-y-1 text-xs text-slate-500">
          {CITATIONS.map((c, i) => <li key={i}>• {c.label} <span className="text-slate-400">— {c.source}</span></li>)}
        </ul>
      </div>

      <footer className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
        {isEN
          ? "Educational rehab-support reference for non-specific mechanical low-back pain — a clinician clears red flags / radicular / directional preference and gates loaded progression. Criteria-based, never calendar-based. Nothing here changes the player's readiness verdict."
          : "Fræðslu- og endurhæfingar-stuðnings viðmið fyrir ósértækan vélrænan mjóbaksverk — klíníker útilokar rauð flögg / radicular / stefnu-val og stýrir hlöðnum framgangi. Viðmiðað, aldrei dagatals. Ekkert hér breytir readiness-niðurstöðu leikmannsins."}
      </footer>
    </div>
  );
}
