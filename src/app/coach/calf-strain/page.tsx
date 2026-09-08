"use client";

/**
 * Coach view — Calf Strain: six-phase staged loading (Green et al. 2022, Sports
 * Med-Open 8:10, CC-BY). Parallel to the jumper's-knee / Achilles / adductor
 * rehab pages. The single most important step is FIRST establishing the injured
 * structure (medial/lateral gastrocnemius, soleus, aponeurotic) — it changes the
 * loading (knee angle) and the return-to-sport trajectory (Dixon 2009).
 *
 * EDUCATIONAL protocol reference — the injured structure + progression belong to
 * the treating clinician. Clinical doses stay in English; the shell is bilingual.
 * Nothing here touches the readiness verdict/colour.
 */
import React from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang";
import { supabase } from "@/lib/supabaseClient";
import SendProtocolToPlayerButton from "@/components/recovery/SendProtocolToPlayerButton";
import { ExerciseTable, CollagenSupport, type Row } from "@/components/rehab/tendonLoading";

const BREIDABLIK_TEAM_ID = "94b52a06-0b83-48da-8664-639ec3486a0c";

type SubType = "medial_gastroc" | "lateral_gastroc" | "soleus" | "aponeurotic";

const SUBTYPES: { id: SubType; en: string; is: string }[] = [
  { id: "medial_gastroc", en: "Medial gastrocnemius", is: "Innri kálfavöðvi (gastroc)" },
  { id: "lateral_gastroc", en: "Lateral gastrocnemius", is: "Ytri kálfavöðvi (gastroc)" },
  { id: "soleus", en: "Soleus", is: "Sólvöðvi (soleus)" },
  { id: "aponeurotic", en: "Aponeurotic / musculotendinous", is: "Aponeurotic / sina-vöðva" },
];

const SUBTYPE_NOTE: Record<SubType, { en: string; is: string }> = {
  medial_gastroc: {
    en: "Gastrocnemius crosses the knee — load it KNEE-STRAIGHT (standing calf raise). Injured in explosive / sprinting / lengthened positions; usually acute and obvious.",
    is: "Gastroc fer yfir hnéð — hladdu það með HNÉ BEINT (standandi kálfalyfta). Meiðist í sprengi- / spretti- / lengdri stöðu; venjulega bráð og augljós.",
  },
  lateral_gastroc: {
    en: "Gastrocnemius crosses the knee — load it KNEE-STRAIGHT (standing calf raise). Injured in explosive / sprinting / lengthened positions; usually acute and obvious.",
    is: "Gastroc fer yfir hnéð — hladdu það með HNÉ BEINT (standandi kálfalyfta). Meiðist í sprengi- / spretti- / lengdri stöðu; venjulega bráð og augljós.",
  },
  soleus: {
    en: "Soleus is monoarticular — load it KNEE-BENT / seated. Associated with endurance / fatigue / distance running; often insidious (tightness / cramping, gradual onset, after a running-workload spike). Needs high-volume / heavy loading; soleus tolerance is essential before ANY dynamic work.",
    is: "Soleus er einliða — hladdu hann með HNÉ BEYGT / sitjandi. Tengist úthaldi / þreytu / langhlaupum; oft lúmskur (stífleiki / krampi, hægur, eftir hlaupa-álagstopp). Þarf mikið magn / þungt álag; soleus-þol er nauðsynlegt fyrir ALLA dýnamíska vinnu.",
  },
  aponeurotic: {
    en: "Aponeurotic / musculotendinous involvement — clinician-led, cautious loading and a typically longer return-to-sport timeline. Confirm the plan with the treating clinician.",
    is: "Aponeurotic / sina-vöðva aðkoma — klíníker-stýrt, varfærið álag og yfirleitt lengri endurkomu-tími. Staðfestu planið með meðhöndlandi klíníker.",
  },
};

const FOUNDATION: Row[] = [
  { ex: "Normalise gait (no limp) before loading progresses", dose: "as needed", notes: "Symmetrical, pain-free walking is the entry to strengthening." },
  { ex: "Gastrocnemius + soleus ROM / stretch symmetry (L vs R)", dose: "daily", notes: "Knee-straight for gastroc, knee-bent for soleus. Restore side-to-side symmetry both ways." },
];
const STRENGTH: Row[] = [
  { ex: "Entry benchmark — single-leg calf raise", dose: "~20–25 reps (gate)", notes: "Test both straight-knee (gastroc) and seated (soleus). This benchmark opens loaded strengthening." },
  { ex: "Heavy standing calf raise (knee straight — gastrocnemius)", dose: "3–4 × 6–8 heavy", notes: "Smith-machine / loaded. Flat → incline for ROM. Use when the gastroc is the injured structure." },
  { ex: "Heavy seated calf raise (knee bent — soleus)", dose: "3–4 × 6–8 heavy", notes: "Soleus carries very high loads in running — soleus tolerance is essential for ALL calf strains before dynamic work." },
  { ex: "Isometric calf holds — short, frequent bouts", dose: "5 × 30–45 s · ~10 min bout, 1–3×/day (~6 h apart)", notes: "Longer/slower holds at various muscle-tendon lengths (Baar dosing). For a problem/recurrent calf: add eccentric overload." },
  { ex: "Horizontal + lateral calf capacity", dose: "progressive", notes: "Often neglected — important for acceleration / cutting sports." },
];
const POWER: Row[] = [
  { ex: "Progressive SSC / plyometrics", dose: "pogos → hops → bounding → ballistic", notes: "Only after strength benchmarks are met. Build energy storage gradually; quality over volume; respect recovery between sessions." },
];
const RUNNING: Row[] = [
  { ex: "Readiness-to-run → graded running → speed / sprint", dose: "graded return", notes: "Meet run-readiness criteria first, then build running, then speed, then sport-specific." },
  { ex: "Prevention (individualised)", dose: "ongoing", notes: "No universal calf-prevention program — individualise. Keep soleus + gastroc capacity high; manage sprint / HSR / accel-decel + running-workload spikes." },
];

const CITATIONS: { label: string; source: string }[] = [
  { label: "Green et al. 2022 — Calf muscle strain injuries: a qualitative study of 20 expert clinicians (6-phase management framework)", source: "Sports Medicine — Open 8:10 (CC-BY)" },
  { label: "Green & Pizzari 2017 — Calf muscle strain injuries in sport: systematic review of risk factors (prior injury strongest; increasing age)", source: "Br J Sports Med" },
  { label: "Dixon 2009 — Gastrocnemius vs soleus: differentiating and managing calf strains", source: "Curr Rev Musculoskelet Med" },
  { label: "Baar 2017 / 2019 — collagen loading dose (short, frequent bouts) applied to the isometric calf loading", source: "Sports Med / IJSNEM" },
];

export default function CalfStrainPage() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const [allowed, setAllowed] = React.useState<boolean | null>(null);
  const [subType, setSubType] = React.useState<SubType>("medial_gastroc");

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

  const note = SUBTYPE_NOTE[subType];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <Link href="/coach/rehab-protocols" className="hover:text-slate-700">{isEN ? "Rehab protocols" : "Endurhæfingar-prótókoll"}</Link>
        <span>›</span><span>{isEN ? "Calf strain" : "Kálfa-tognun"}</span>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-slate-900">{isEN ? "Calf Strain — Staged Loading" : "Kálfa-tognun — Þrepaskipt álag"}</h1>
        <SendProtocolToPlayerButton slug="calf_strain_staged_loading" lang={isEN ? "EN" : "IS"} />
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        {isEN
          ? "A six-phase management framework (Green et al. 2022). Progression is criteria-based — the single-leg calf-raise benchmark and running/sprint tolerance, never the calendar."
          : "Sex-fasa umgjörð (Green o.fl. 2022). Framgangur er viðmiðaður — einfætta kálfalyftu-viðmiðið og hlaupa-/spretti-þol, aldrei dagatalið."}
      </p>
      <p className="mt-1 text-xs text-slate-500">Green et al. 2022 (Sports Med-Open) · Green &amp; Pizzari 2017 · Dixon 2009</p>

      {/* Disclaimer */}
      <div className="mt-4 rounded-lg border-l-4 border-red-400 bg-red-50 p-4 text-sm text-slate-700">
        <b className="text-red-700">{isEN ? "Read first: " : "Lestu fyrst: "}</b>
        {isEN
          ? "Establish the injured structure with a clinician BEFORE loading — medial/lateral gastrocnemius vs soleus vs aponeurotic change the loading (knee angle) and the return-to-sport timeline. Educational reference; the six-phase framework is expert-consensus (20 clinicians), not RCT outcomes. Progression is criteria-based and clinician-gated. Pain / red flags → clinician."
          : "Staðfestu meiðslið með klíníker ÁÐUR en hlaðið er — innri/ytri gastroc vs soleus vs aponeurotic breyta álaginu (hné-horni) og endurkomu-tímanum. Fræðslu-viðmið; sex-fasa umgjörðin er sérfræði-samhljómur (20 klíníkar), ekki RCT. Framgangur er viðmiðaður og klíníker-stýrður. Verkur / rauð flögg → klíníker."}
      </div>

      {/* Sub-type selector — the #1 principle: load the right structure */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{isEN ? "Injured structure (clinician-established)" : "Meidd bygging (klíníker staðfestir)"}</span>
          <select value={subType} onChange={(e) => setSubType(e.target.value as SubType)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            {SUBTYPES.map((s) => <option key={s.id} value={s.id}>{isEN ? s.en : s.is}</option>)}
          </select>
        </div>
        <p className="mt-2 text-sm text-slate-600">{isEN ? note.en : note.is}</p>
      </div>

      {/* Phases 1–2 (clinician) */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 border-t-4 border-t-emerald-500 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">{isEN ? "Phase 1 · Diagnosis (clinician)" : "Fasi 1 · Greining (klíníker)"}</h3>
          <p className="mt-1 text-sm text-slate-600">{isEN ? "Establish the structure first. Acute/explosive onset → gastrocnemius; insidious tightness/cramping after a running-workload spike → soleus. Record muscle + severity + characteristics — especially for recurrent calf strains." : "Staðfestu bygginguna fyrst. Bráð/sprengi-byrjun → gastroc; lúmskur stífleiki/krampi eftir hlaupa-álagstopp → soleus. Skráðu vöðva + alvarleika + einkenni — sérstaklega við endurteknar tognanir."}</p>
        </div>
        <div className="rounded-lg border border-slate-200 border-t-4 border-t-emerald-500 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">{isEN ? "Phase 2 · Prognosis / monitoring" : "Fasi 2 · Horfur / vöktun"}</h3>
          <p className="mt-1 text-sm text-slate-600">{isEN ? "Prognosis comes from monitoring calf capacity + the response to loading over time — not a single day-1 call. Track calf-raise reps and the 24 h symptom response to each load step." : "Horfur koma frá vöktun á kálfa-getu + svörun við álagi yfir tíma — ekki stök dag-1 ákvörðun. Fylgstu með kálfalyftu-endurtekningum og 24 klst svörun við hverju álags-skrefi."}</p>
        </div>
      </div>

      {/* Phase 3 */}
      <section className="mt-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Phase 3 — Foundation calf & lower-limb function" : "Fasi 3 — Grunn kálfa- & neðri-útlima virkni"}</h2>
        <div className="mt-2"><ExerciseTable rows={FOUNDATION} isEN={isEN} /></div>
      </section>

      {/* Phase 4 */}
      <section className="mt-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Phase 4 — Loaded strengthening" : "Fasi 4 — Hlaðin styrking"}<span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{isEN ? "soleus tolerance before dynamic" : "soleus-þol á undan dýnamísku"}</span></h2>
        <div className="mt-2"><ExerciseTable rows={STRENGTH} isEN={isEN} /></div>
        <div className="mt-3"><CollagenSupport isEN={isEN} /></div>
      </section>

      {/* Phase 5 */}
      <section className="mt-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Phase 5 — Loaded power, plyometrics & ballistic" : "Fasi 5 — Hlaðið afl, plyometrics & ballistic"}</h2>
        <div className="mt-2"><ExerciseTable rows={POWER} isEN={isEN} /></div>
      </section>

      {/* Phase 6 */}
      <section className="mt-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Phase 6 — Running rehabilitation → return to sport" : "Fasi 6 — Hlaupa-endurhæfing → aftur í íþrótt"}</h2>
        <div className="mt-2"><ExerciseTable rows={RUNNING} isEN={isEN} /></div>
      </section>

      {/* Load-link note */}
      <div className="mt-5 rounded-lg border-l-4 border-emerald-400 bg-emerald-50/50 p-4 text-sm text-slate-600">
        {isEN
          ? "Prior calf strain is the strongest risk factor (with increasing age) — a higher-risk player to watch. Prevention is load-management, not prediction: keep soleus + gastroc capacity high and manage sprint / HSR / accel-decel spikes and sudden running re-exposure. This screen is descriptive — it never moves the readiness colour."
          : "Fyrri kálfa-tognun er sterkasti áhættuþátturinn (ásamt hækkandi aldri) — leikmaður í meiri áhættu. Forvörn er álagsstjórn, ekki spá: haltu soleus + gastroc getu hárri og stýrðu sprett- / HSR- / hröðunar-toppum og skyndilegri hlaupa-endurkomu. Þetta skjár er lýsandi — hreyfir aldrei readiness-litinn."}
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
          ? "Educational protocol reference for calf strain — the injured structure and progression belong to the treating clinician. Criteria-based, never calendar-based. Nothing here changes the player's readiness verdict."
          : "Fræðslu-prótókoll fyrir kálfa-tognun — meiðslið og framgangur tilheyra meðhöndlandi klíníker. Viðmiðað, aldrei dagatals. Ekkert hér breytir readiness-niðurstöðu leikmannsins."}
      </footer>
    </div>
  );
}
