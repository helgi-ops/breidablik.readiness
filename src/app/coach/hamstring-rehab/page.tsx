"use client";

/**
 * Coach view — Hamstring Rehab: Ramping Isometrics (criteria-based RTP).
 *
 * A criteria-based (never calendar-based) return-to-play framework for
 * non-surgical Grade I–II hamstring strains, adapted from the Keith Baar
 * ramping-isometric protocol used in elite rugby.
 *
 * Source: Power D, Haddad F, Wallis S, Baar K (2023), Journal of Elite Sport
 * Performance (CC BY-NC-ND 4.0). DOI 10.54080/MOMV6327.
 *
 * This is an EDUCATIONAL protocol reference — progression decisions belong to
 * the treating clinician. The clinical detail (exercise doses, testing battery)
 * is kept in English, the source language, for medical precision; the shell
 * (headings, summaries, disclaimer) is bilingual IS/EN.
 */

import React from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang";
import { supabase } from "@/lib/supabaseClient";
import SendProtocolToPlayerButton from "@/components/recovery/SendProtocolToPlayerButton";

// Club-specific resource: this protocol was set up for Breiðablik only. The
// sidebar hides the link for other teams; this guard also blocks direct-URL
// access so another club can't reach it by typing the path.
const BREIDABLIK_TEAM_ID = "94b52a06-0b83-48da-8664-639ec3486a0c";

type Tab = "overview" | "p1" | "p2" | "p3" | "p4" | "testing" | "videos";

const VIDEO_BASE =
  "https://journalofelitesportperformance.scholasticahq.com/article/77618-ramping-isometrics-for-accelerated-return-to-play-following-hamstring-tendon-repair-a-case-study/attachment/";
const VIDEO_TOKEN = "H_GxTI5L4mTMxKJ6VBRG";
const videos: { n: number; file: string; ext: string; desc: string }[] = [
  { n: 1, file: "163805", ext: "mov", desc: "Mechanism of injury (defensive-ruck jackal, max hip flexion + knee extension)" },
  { n: 2, file: "163811", ext: "mp4", desc: "Ramping isometric protocol · Activ5 sensor, live force feedback (5-20-5)" },
  { n: 3, file: "163812", ext: "mp4", desc: "Standing slouch / extender progressions (box → floor → depth)" },
  { n: 4, file: "163813", ext: "mp4", desc: "Progressive hamstring bridge series (inner→outer · bilateral→single-leg)" },
  { n: 5, file: "163814", ext: "mp4", desc: "Nordic curl progressions + isometric testing positions" },
  { n: 6, file: "163815", ext: "mp4", desc: "Knee-dominant reactive loading (iso catches, oscillations, prone tantrums)" },
  { n: 7, file: "163816", ext: "mp4", desc: "Hip-dominant reactive work (explosive bridges, sled pushes, plate-catches)" },
];
const videoUrl = (v: { file: string; ext: string }) => `${VIDEO_BASE}${v.file}.${v.ext}?auth_token=${VIDEO_TOKEN}`;

type Row = { ex: string; dose: string; notes: string };

const P1: Row[] = [
  { ex: "Ramping isometric knee flexion — inner range (prone/supine, ~90° knee)", dose: "4–5 × 30 s · daily", notes: "Heel pushes into bench/floor/strap. Submaximal, strictly pain-free." },
  { ex: "Ramping isometric glute-bridge hold", dose: "4 × 30 s", notes: "Drive through heels; lift & lower on a slow 5-count." },
  { ex: "Uninjured-leg strength (leg curl, RDL, hip thrust)", dose: "3–4 × 6–10", notes: "Cross-education: reduces atrophy & cortical inhibition on the injured side." },
  { ex: "Synergists: adductors, glutes, calves", dose: "2–3 × 10–15", notes: "Copenhagen variations, banded clams, calf raises — lateral force transmission around the injury." },
  { ex: "Trunk + upper body", dose: "normal", notes: "Keep training everything that doesn't load the hamstring at length." },
  { ex: "Bike / walking", dose: "15–30 min easy", notes: "Pain-free only." },
];
const P2: Row[] = [
  { ex: "Ramping isometric — supine 45:45 heel dig", dose: "4 × 30 s", notes: "Hip 45° / knee 45°; “drive heel toward your bum”." },
  { ex: "Ramping isometric — supine 90:90", dose: "4 × 30 s", notes: "Longer lever; add once 45:45 is pain-free & strong." },
  { ex: "Standing slouch / extender progressions", dose: "2–3 × 8–10", notes: "Slow hinge reaches, multiple planes: box → floor → depth. Graded exposure, not ballistic stretch." },
  { ex: "Yielding isometrics — RDL, split-stance RDL, split squat", dose: "3–4 × 30–40 s", notes: "Light load, mid-range hold; progress to EQIs." },
  { ex: "EQI RDL / split squat", dose: "2–3 × ~40 s TUT", notes: "Slow yielding through range — tendon adaptation with less soreness than eccentrics." },
  { ex: "Hamstring bridges off box: inner → mid → outer", dose: "3 × 8–12", notes: "Bilateral → b-stance/split → single leg." },
  { ex: "Hip thrust · goblet split squat · SL leg curl", dose: "3 × 8–12", notes: "Back to isotonic loading through range." },
  { ex: "BFR leg curl (optional)", dose: "30-15-15-15 @ ~30% 1RM · 30 s rest", notes: "75-rep protocol while heavy load isn't tolerated." },
];
const P3: Row[] = [
  { ex: "Nordic progression: band-assisted → SL band-assisted", dose: "2–3 × 3–5", notes: "Test 4-rep cluster peak force 2×/wk — expect near-linear gains (~+25–30 N/session in the study)." },
  { ex: "Single-leg AEL RDL", dose: "3–4 × 4–6", notes: "Primary hip-dominant lift. Optional ~20° internal hip rotation to bias biceps femoris — neutral if the strain is medial." },
  { ex: "Explosive concentric leg curl / bridge with iso catches", dose: "3 × 4–6", notes: "Reactive knee-dominant loading — contraction speed for running." },
  { ex: "Banded knee-flexion oscillations · prone tantrums", dose: "2–3 × 10–15 s", notes: "Sprint mid-stance position; fast springy contractions." },
  { ex: "Concentric sled push / reverse sled walk in hip flexion", dose: "2–3 × 15–20 m", notes: "Hip-dominant reactive work at long muscle length." },
  { ex: "RFE split-stance isometric push — outer range", dose: "4 × 30 s", notes: "Finish every training day with this. Outer-range tendon adaptation + confidence at near-max stretch. Keep permanently." },
  { ex: "Plyos: pogos → bounds → accelerations", dose: "progressive", notes: "Reactive loading before max-velocity sprinting." },
];
const NUTRITION: Row[] = [
  { ex: "Hydrolysed collagen + vitamin C", dose: "15–20 g + 50–80 mg vit C, ~60 min before loading", notes: "Doubles load-induced collagen synthesis." },
  { ex: "Omega-3", dose: "~2000 mg EPA + 1000 mg DHA daily", notes: "Minimises atrophy & excess inflammation." },
  { ex: "Protein", dose: "1.8–2.3 g/kg/day · ~40 g every 3 h", notes: "Preserves lean mass." },
  { ex: "Creatine", dose: "5 g/day (optional 20 g/day × 7 d start)", notes: "Speeds muscle-mass recovery." },
  { ex: "Curcumin (optional)", dose: "e.g. 2 × 60 ml turmeric shots", notes: "Inflammation management." },
];
const TESTS: { test: string; position: string; measures: string }[] = [
  { test: "Supine 45:45 isometric heel dig", position: "Hip 45° · knee 45°", measures: "Inner–mid range peak force · LSI (ICC ≥ 0.86)" },
  { test: "Supine 90:90 isometric", position: "Hip 90° · knee 90°", measures: "Mid-range peak force · LSI" },
  { test: "Standing 90:20 isometric heel dig", position: "Hinged hip ~90° · knee ~20°", measures: "Outer-range force + RFD @100 ms — most injury-specific" },
  { test: "Nordic 4-rep cluster", position: "Kneeling (NordBord / solo device / band set-up)", measures: "Eccentric peak + average force · LSI · within-set decrement" },
  { test: "VAS pain 0–10", position: "Every session", measures: "0 early · ≤2–3 later phases" },
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

function Criteria({ title, items }: { title: string; items: string[] }) {
  const [done, setDone] = React.useState<Set<number>>(new Set());
  return (
    <div className="mt-4 rounded-lg border border-dashed border-violet-400 bg-violet-50/60 p-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">{title}</h4>
      <div className="flex flex-col gap-1">
        {items.map((it, i) => {
          const checked = done.has(i);
          return (
            <label key={i} className={`flex cursor-pointer items-start gap-2 text-sm ${checked ? "text-emerald-700 line-through" : "text-slate-700"}`}>
              <input
                type="checkbox"
                className="mt-1 accent-emerald-600"
                checked={checked}
                onChange={() => setDone((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i); else next.add(i);
                  return next;
                })}
              />
              <span>{it}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

const TABS: { id: Tab; en: string; is: string }[] = [
  { id: "overview", en: "Overview", is: "Yfirlit" },
  { id: "p1", en: "Phase 1 · Protect", is: "Fasi 1 · Vernda" },
  { id: "p2", en: "Phase 2 · Reload", is: "Fasi 2 · Endurhlaða" },
  { id: "p3", en: "Phase 3 · Speed", is: "Fasi 3 · Hraði" },
  { id: "p4", en: "Phase 4 · Perform", is: "Fasi 4 · Frammistaða" },
  { id: "testing", en: "Testing", is: "Próf" },
  { id: "videos", en: "Videos", is: "Myndbönd" },
];

export default function HamstringRehabPage() {
  const [lang] = useLang();
  const isEN = lang !== "IS";
  const [tab, setTab] = React.useState<Tab>("overview");
  // null = checking, true/false = whether the active team may view this.
  const [allowed, setAllowed] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (active) setAllowed(false); return; }
      const { data } = await supabase.from("profiles").select("team_id").eq("id", user.id).maybeSingle();
      const tid = (data as { team_id?: string } | null)?.team_id ?? null;
      if (active) setAllowed(tid === BREIDABLIK_TEAM_ID);
    })();
    return () => { active = false; };
  }, []);

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
          {isEN ? "Hamstring Rehab — Ramping Isometrics" : "Hamstring endurhæfing — Ramping ísometrics"}
        </h1>
        {/* Send THIS protocol straight to a player — the player then sees it on
            /player/recovery-protocols with the phases, doses and criteria. */}
        <SendProtocolToPlayerButton slug="hamstring_ramping_isometrics" lang={isEN ? "EN" : "IS"} />
      </div>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        {isEN
          ? "Criteria-based return-to-play for non-surgical Grade I–II hamstring strains, adapted from the Baar ramping-isometric protocol used in elite rugby."
          : "Viðmiðuð endurkoma (ekki dagatals) eftir Grade I–II hamstring-tognun, byggð á Baar ramping-ísometrics prótókolli úr úrvals-rugby."}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {isEN ? "Source: " : "Heimild: "}
        Power, Haddad, Wallis &amp; Baar (2023) — Journal of Elite Sport Performance ·{" "}
        <a href="https://doi.org/10.54080/MOMV6327" target="_blank" rel="noreferrer" className="text-primary hover:underline">DOI 10.54080/MOMV6327</a>
      </p>

      {/* Medical disclaimer — always visible */}
      <div className="mt-4 rounded-lg border-l-4 border-red-400 bg-red-50 p-4 text-sm text-slate-700">
        <b className="text-red-700">{isEN ? "Read first: " : "Lestu fyrst: "}</b>
        {isEN
          ? "This adapts a post-surgical elite case study to common non-surgical strains. Educational framework — not medical advice. Get the injury graded by a clinician first. Seek medical review before starting if there is: inability to walk, a palpable gap/lump, extensive bruising down the thigh, loss of active knee flexion against gravity, sitting pain on the sit bone, or MRI-confirmed tendon disruption/retraction. Progression is criteria-based, never calendar-based — week ranges are indicative only."
          : "Þetta aðlagar úrvals-tilfelli eftir aðgerð að algengum tognunum án aðgerðar. Fræðslu-rammi — ekki læknisráð. Láttu klíníker meta meiðslið fyrst. Leitaðu læknismats áður en byrjað er ef til staðar er: geta ekki gengið, áþreifanlegt bil/hnútur, mikil marblettur niður lærið, tap á virkri hnébeygju gegn þyngdarafli, sársauki á setbeini, eða MRI-staðfest sinaslit/afturköllun. Framgangur er viðmiðaður, aldrei dagatals — vikubil eru aðeins til viðmiðunar."}
      </div>

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
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "The core method" : "Kjarna-aðferðin"}</h2>
              <p className="mt-1 text-sm text-slate-600">
                {isEN
                  ? "Every hamstring-specific isometric uses one contraction shape — low-jerk loading that protects the healing site while stimulating matrix repair:"
                  : "Sérhver hamstring-ísometrísk æfing notar eitt samdráttar-form — low-jerk álag sem verndar gróanda en örvar matrix-viðgerð:"}
              </p>
              <div className="mt-3 flex flex-wrap items-stretch justify-center overflow-hidden rounded-lg text-center text-sm font-semibold text-white">
                <div className="bg-gradient-to-r from-violet-800 to-violet-600 px-5 py-3">~5 s<span className="block text-xs font-normal opacity-85">{isEN ? "ramp up" : "ramp upp"}</span></div>
                <div className="bg-violet-600 px-8 py-3">~20 s<span className="block text-xs font-normal opacity-85">{isEN ? "steady hold" : "stöðugt hald"}</span></div>
                <div className="bg-gradient-to-r from-violet-600 to-violet-800 px-5 py-3">~5 s<span className="block text-xs font-normal opacity-85">{isEN ? "ramp down" : "ramp niður"}</span></div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { h: isEN ? "Why ramping?" : "Af hverju ramping?", b: isEN ? "Collagen and muscle damage scale with strain rate, not just load. The 5-second ramp minimises “jerk” (rate of force change) at the injury site while still delivering the directional tension the repairing matrix needs to organise its fibres." : "Collagen- og vöðvaskemmd ræðst af strain-rate, ekki bara álagi. 5 s ramp lágmarkar “jerk” við meiðslið en skilar samt stefnu-spennu sem matrixinn þarf." },
                { h: isEN ? "Pain rule" : "Verkjaregla", b: isEN ? "Every contraction pain-free (0/10). Literature allows 2–3/10 on low-jerk isometrics, but pain-free is the target — especially for athletes who push into pain." : "Sérhver samdráttur verkjalaus (0/10). Bókmenntir leyfa 2–3/10 á low-jerk ísometrics, en verkjalaust er markmiðið." },
                { h: isEN ? "Dose & frequency" : "Skammtur & tíðni", b: isEN ? "4–5 × 30 s per position, 60–120 s rest, 1–3 positions per session. Daily or every other day early; 6+ h between tendon-loading bouts. Use a load sensor and log every session for progressive overload." : "4–5 × 30 s á stöðu, 60–120 s hvíld, 1–3 stöður á session. Daglega eða annan hvern dag snemma; 6+ klst milli sina-álags. Notaðu álagsnema og skráðu hverja session." },
                { h: isEN ? "Positioning" : "Staðsetning", b: isEN ? "Progress inner range (short muscle) → outer range (long muscle). Avoid combined hip flexion + knee extension until Phase 2–3. No hamstring stretching while healing." : "Framgangur innra range (stuttur vöðvi) → ytra range (langur vöðvi). Forðastu samsetta mjaðma-beygju + hné-réttu fram að Fasa 2–3. Engin hamstring-teygja á meðan gróandi." },
              ].map((c, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-violet-700">{c.h}</h3>
                  <p className="mt-1 text-sm text-slate-600">{c.b}</p>
                </div>
              ))}
            </div>

            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Phase timeline" : "Fasa-tímalína"}</h2>
              <p className="mt-1 text-sm text-slate-600">{isEN ? "The criteria decide, not the calendar. Durations are typical for Grade I–II." : "Viðmiðin ráða, ekki dagatalið. Lengd er dæmigerð fyrir Grade I–II."}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { id: "p1" as Tab, t: isEN ? "1 · Protect & Activate" : "1 · Vernda & virkja", s: isEN ? "~days 1–7" : "~dagar 1–7" },
                  { id: "p2" as Tab, t: isEN ? "2 · Reload & Rebuild" : "2 · Endurhlaða", s: isEN ? "~weeks 1–3" : "~vikur 1–3" },
                  { id: "p3" as Tab, t: isEN ? "3 · Strength & Run" : "3 · Styrkur & hlaup", s: isEN ? "~weeks 3–6" : "~vikur 3–6" },
                  { id: "p4" as Tab, t: isEN ? "4 · Return to Perform" : "4 · Aftur í frammistöðu", s: isEN ? "week 6+" : "vika 6+" },
                ].map((p) => (
                  <button key={p.id} onClick={() => setTab(p.id)} className="rounded-lg border border-slate-200 border-t-4 border-t-violet-500 bg-white p-3 text-left transition-transform hover:-translate-y-0.5 hover:border-violet-400">
                    <b className="block text-sm text-slate-900">{p.t}</b>
                    <span className="text-xs text-slate-500">{p.s}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Nutrition support" : "Næringar-stuðningur"} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{isEN ? "all phases" : "allir fasar"}</span></h2>
              <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-semibold">{isEN ? "Intervention" : "Inngrip"}</th>
                      <th className="px-3 py-2 font-semibold">{isEN ? "Dose" : "Skammtur"}</th>
                      <th className="px-3 py-2 font-semibold">{isEN ? "Purpose" : "Tilgangur"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {NUTRITION.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100 align-top">
                        <td className="px-3 py-2 font-medium text-slate-900">{r.ex}</td>
                        <td className="px-3 py-2 text-slate-700">{r.dose}</td>
                        <td className="px-3 py-2 text-slate-600">{r.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── PHASE 1 ── */}
        {tab === "p1" && (
          <div className="space-y-4">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Phase 1 — Protect & Activate" : "Fasi 1 — Vernda & virkja"} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{isEN ? "typically days 1–7" : "yfirleitt dagar 1–7"}</span></h2>
              <p className="mt-1 text-sm text-slate-600">
                <b>{isEN ? "Goals:" : "Markmið:"}</b> {isEN ? "settle pain · protect the healing site · start optimal loading immediately · minimise atrophy · keep aerobic fitness." : "róa verki · vernda gróanda · byrja rétt álag strax · lágmarka rýrnun · halda þolþjálfun."}<br />
                <b>{isEN ? "Rules:" : "Reglur:"}</b> {isEN ? "no hamstring stretching · no combined hip-flexion + knee-extension · everything pain-free." : "engin hamstring-teygja · engin samsett mjaðma-beygja + hné-rétta · allt verkjalaust."}
              </p>
            </div>
            <ExerciseTable rows={P1} isEN={isEN} />
            <Criteria title={isEN ? "✓ Progress to Phase 2 when" : "✓ Áfram í Fasa 2 þegar"} items={[
              isEN ? "Walking is pain-free" : "Ganga er verkjalaus",
              isEN ? "Inner-range isometric pain-free at a solid effort" : "Innra-range ísometrísk verkjalaus við gott átak",
              isEN ? "No reactive flare the morning after loading" : "Engin viðbrögð morguninn eftir álag",
            ]} />
          </div>
        )}

        {/* ── PHASE 2 ── */}
        {tab === "p2" && (
          <div className="space-y-4">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Phase 2 — Reload & Rebuild" : "Fasi 2 — Endurhlaða & endurbyggja"} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{isEN ? "typically weeks 1–3" : "yfirleitt vikur 1–3"}</span></h2>
              <p className="mt-1 text-sm text-slate-600"><b>{isEN ? "Goals:" : "Markmið:"}</b> {isEN ? "rebuild capacity at progressively longer muscle lengths · restore confidence in hip-flexed positions · start objective strength testing." : "endurbyggja getu við smám saman lengri vöðvalengd · endurheimta öryggi í mjaðma-beygðum stöðum · byrja hlutlæg styrktarpróf."}</p>
            </div>
            <ExerciseTable rows={P2} isEN={isEN} />
            <p className="text-sm italic text-slate-500">{isEN ? "Testing starts now, 2–3×/week: isometric peak force at 45:45, 90:90 and standing 90:20. “3-2-1 GO”, ~3 s max effort, track LSI." : "Próf byrja nú, 2–3×/viku: ísometrískur hámarkskraftur í 45:45, 90:90 og standandi 90:20. “3-2-1 GO”, ~3 s hámarksátak, fylgstu með LSI."}</p>
            <Criteria title={isEN ? "✓ Progress to Phase 3 when" : "✓ Áfram í Fasa 3 þegar"} items={[
              isEN ? "Isometric LSI > 80–85% in all three positions" : "Ísometrísk LSI > 80–85% í öllum þremur stöðum",
              isEN ? "Slouch to depth pain-free" : "Slouch í dýpt verkjalaust",
              isEN ? "Single-leg bridge at outer range pain-free and strong" : "Einfætt brú í ytra range verkjalaus og sterk",
            ]} />
          </div>
        )}

        {/* ── PHASE 3 ── */}
        {tab === "p3" && (
          <div className="space-y-4">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Phase 3 — Strength, Speed & Return to Run" : "Fasi 3 — Styrkur, hraði & aftur í hlaup"} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{isEN ? "typically weeks 3–6" : "yfirleitt vikur 3–6"}</span></h2>
              <p className="mt-1 text-sm text-slate-600"><b>{isEN ? "Goals:" : "Markmið:"}</b> {isEN ? "restore eccentric strength at long lengths · reintroduce running → high-speed running (HSR) · add reactive/fast contractions." : "endurheimta eccentrískan styrk við langa lengd · endurkynna hlaup → háhraðahlaup (HSR) · bæta við hröðum samdráttum."}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-violet-700">{isEN ? "Running progression" : "Hlaupa-framgangur"}</h3>
              <p className="mt-1 text-sm text-slate-600">{isEN ? "Technical drills (A-march, A-skip, dribbles) → jog-stride intervals at capped velocity → volume first, then speed. Monitor velocity live (GPS/smartwatch). Introduce HSR (>5 m/s or >85% max velocity) in stepwise linear + curved doses. Keep early high-speed days separate from heavy eccentric days." : "Tækni-drill (A-march, A-skip, dribbles) → jog-stride intervöl við hámarks-hraða → magn fyrst, svo hraði. Fylgstu með hraða í rauntíma (GPS/úr). Kynntu HSR (>5 m/s eða >85% hámarkshraða) í þrepum, línulegt + bogið. Haltu snemma háhraða-dögum aðskildum frá þungum eccentric-dögum."}</p>
            </div>
            <ExerciseTable rows={P3} isEN={isEN} />
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-violet-700">{isEN ? "Exercise-order rules (from the case study)" : "Röðunar-reglur (úr tilfellinu)"}</h3>
              <p className="mt-1 text-sm text-slate-600">{isEN ? "Primary lifts before running on work-capacity days · isolated hamstring & calf work after running · match speed-focused lifting to speed-running days · end sessions with the outer-range isometric push." : "Aðal-lyftur á undan hlaupi á vinnu-getu dögum · einangruð hamstring & kálfa-vinna eftir hlaup · para hraða-lyftingar við hraða-hlaupadaga · enda session á ytra-range ísometrískum þrýstingi."}</p>
            </div>
            <Criteria title={isEN ? "✓ Progress to Phase 4 when" : "✓ Áfram í Fasa 4 þegar"} items={[
              isEN ? "Nordic eccentric LSI ≥ 85–90% and still climbing linearly" : "Nordic eccentric LSI ≥ 85–90% og enn línulega vaxandi",
              isEN ? "Isometric LSI ≈ 100% in all three positions" : "Ísometrísk LSI ≈ 100% í öllum þremur stöðum",
              isEN ? "Sprinting >90% max velocity pain-free, no apprehension" : "Spretthlaup >90% hámarkshraða verkjalaust, engin hræðsla",
            ]} />
            <p className="text-sm italic text-slate-500">{isEN ? "Context: the case-study player returned with a 12–14% Nordic deficit because every other criterion was passed, absolute strength exceeded baseline and was still rising — eccentric asymmetry alone is not predictive of re-injury." : "Samhengi: leikmaðurinn sneri aftur með 12–14% Nordic-halla því öll önnur viðmið stóðust, heildarstyrkur var yfir grunnlínu og enn vaxandi — eccentric-ósamhverfa ein og sér spáir ekki fyrir um endurmeiðsl."}</p>
          </div>
        )}

        {/* ── PHASE 4 ── */}
        {tab === "p4" && (
          <div className="space-y-4">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Phase 4 — Return to Performance" : "Fasi 4 — Aftur í frammistöðu"} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{isEN ? "week 6+" : "vika 6+"}</span></h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { h: isEN ? "Sprint & game demands" : "Spretta- & leikkröfur", b: isEN ? "≥95% max-velocity exposure, repeated-effort runs, sport-specific chaos on the control-chaos continuum (controlled drills → chaotic game situations)." : "≥95% hámarkshraða, endurtekin átök, íþrótta-sértækt óreiða á stýrða-óreiðu ásnum (stýrð drill → óreiða í leik)." },
                { h: isEN ? "Final gate" : "Loka-hlið", b: isEN ? "A game-simulation session built on individual worst-case GPS demands before full return to training." : "Leik-hermun byggð á versta-falls GPS-kröfum leikmannsins áður en full endurkoma í æfingar." },
                { h: isEN ? "Graded return" : "Stigvaxandi endurkoma", b: isEN ? "Reduced minutes first appearance, building over 2–3 weeks (case study: 40 min → 60 min → full)." : "Færri mínútur í fyrstu, byggt upp á 2–3 vikum (40 mín → 60 mín → fullt)." },
                { h: isEN ? "Re-injury watch" : "Endurmeiðsla-vöktun", b: isEN ? "Monthly testing; act on LSI drift >10–15%, maintain weekly sprint exposure — “sprinting is the vaccine”." : "Mánaðarleg próf; bregstu við LSI-reki >10–15%, haltu vikulegri sprettu — “sprinting is the vaccine”." },
              ].map((c, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-violet-700">{c.h}</h3>
                  <p className="mt-1 text-sm text-slate-600">{c.b}</p>
                </div>
              ))}
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Maintenance — permanent" : "Viðhald — varanlegt"}</h2>
            <ExerciseTable isEN={isEN} rows={[
              { ex: "Nordic curls", dose: "2×/week · 2–3 × 3–5", notes: "" },
              { ex: "SL AEL RDL or heavy RDL", dose: "1–2×/week", notes: "" },
              { ex: "RFE split-stance outer-range isometric push", dose: "4 × 30 s after sessions", notes: "" },
              { ex: "High-speed running dose", dose: "Sprint exposure 1–2×/week", notes: "" },
              { ex: "Strength testing", dose: "Monthly isometric battery + Nordic", notes: "" },
            ]} />
          </div>
        )}

        {/* ── TESTING ── */}
        {tab === "testing" && (
          <div className="space-y-4">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Testing battery" : "Próf-batterí"}</h2>
            <p className="text-sm text-slate-600">{isEN ? "Standardise everything: same instructions & encouragement, “3-2-1 GO”, ~3 s maximal effort, best of 3–4. Test isometrics fresh — eccentric tests done fatigued (post-running) read low." : "Staðlaðu allt: sömu leiðbeiningar & hvatningu, “3-2-1 GO”, ~3 s hámarksátak, best af 3–4. Prófaðu ísometrics úthvíld — eccentric-próf þreytt (eftir hlaup) mælast lág."}</p>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-2">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">{isEN ? "Test" : "Próf"}</th>
                    <th className="px-3 py-2 font-semibold">{isEN ? "Position" : "Staða"}</th>
                    <th className="px-3 py-2 font-semibold">{isEN ? "Measures" : "Mælir"}</th>
                  </tr>
                </thead>
                <tbody>
                  {TESTS.map((t, i) => (
                    <tr key={i} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-2 font-medium text-slate-900">{t.test}</td>
                      <td className="px-3 py-2 text-slate-700">{t.position}</td>
                      <td className="px-3 py-2 text-slate-600">{t.measures}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-violet-700">{isEN ? "Benchmarks from the case study" : "Viðmið úr tilfellinu"}</h3>
              <p className="mt-1 text-sm text-slate-600">{isEN ? "Isometric LSI recovered to ~100% by weeks 7–10 · Nordic deficit closed near-linearly from −32% (wk 7) to −12% (wk 12) to +1.4% (wk 32) · returned to team training at week 10 with all isometric criteria passed · played at week 12. Follow-up at week 30: injured leg stronger than uninjured." : "Ísometrísk LSI náði ~100% á viku 7–10 · Nordic-halli lokaðist næstum línulega úr −32% (v.7) í −12% (v.12) í +1,4% (v.32) · aftur í liðsæfingar viku 10 með öll ísometrísk viðmið staðin · lék viku 12. Eftirfylgni viku 30: meidda fótleggur sterkari en heilbrigði."}</p>
            </div>
          </div>
        )}

        {/* ── VIDEOS ── */}
        {tab === "videos" && (
          <div className="space-y-3">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-slate-900">{isEN ? "Video library" : "Myndbandasafn"}</h2>
            <p className="text-sm text-slate-600">{isEN ? "The seven supplemental videos from the open-access case study. Click to expand and play, or open the source link." : "Sjö auka-myndbönd úr opna-aðgangs tilfellinu. Smelltu til að opna og spila, eða opnaðu heimildar-tengil."}</p>
            {videos.map((v) => (
              <details key={v.n} className="rounded-lg border border-slate-200 bg-white">
                <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800">
                  <span className="text-violet-600">▸</span> Video {v.n} <span className="font-normal text-slate-500">— {v.desc}</span>
                </summary>
                <div className="border-t border-slate-100 p-4">
                  <video controls preload="none" className="w-full max-h-[420px] rounded bg-black" src={videoUrl(v)} />
                  <a href={videoUrl(v)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-primary hover:underline">
                    {isEN ? "Open / download" : "Opna / hlaða niður"} (.{v.ext})
                  </a>
                </div>
              </details>
            ))}
          </div>
        )}
      </div>

      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
        {isEN
          ? "Adapted for non-surgical Grade I–II hamstring strain from Power, Haddad, Wallis & Baar (2023), Journal of Elite Sport Performance (CC BY-NC-ND 4.0). Educational use — progression decisions belong to the treating clinician."
          : "Aðlagað fyrir Grade I–II hamstring-tognun án aðgerðar úr Power, Haddad, Wallis & Baar (2023), Journal of Elite Sport Performance (CC BY-NC-ND 4.0). Fræðslunotkun — framgangs-ákvarðanir tilheyra meðhöndlandi klíníker."}
      </footer>
    </div>
  );
}
