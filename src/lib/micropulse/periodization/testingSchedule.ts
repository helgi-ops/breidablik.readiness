/**
 * Pre-season TESTING schedule — what to measure, HOW to run it, and WHEN to repeat it across the
 * pre-season, so the coach re-baselines fitness (aerobic) and strength/neuromuscular qualities as the
 * players adapt. Descriptive/advisory — the coach schedules the sessions; nothing here sets the
 * readiness colour or a training decision.
 *
 * Repeat-testing rationale: pre-season adaptations move fast (detrained → trained), so a single
 * baseline goes stale — re-testing at block boundaries keeps MAS/velocity zones and strength loads
 * anchored to the player's CURRENT capacity (Buchheit 2008/2010; Bangsbo 2008; Mann/Weakley VBT;
 * Claudino 2017 CMJ monitoring; Bourne 2018 Nordic/eccentric).
 *
 * Pure, deterministic, null-safe. No readiness/decision/load-target import (boundary-tested).
 */

type Bi = { en: string; is: string };

export type TestKey = "aerobic" | "cmj" | "maxStrength" | "nordbord" | "sprint";
export type AerobicMode = "ift_30_15" | "yoyo_ir1" | "vameval";

export interface TestProtocol {
  key: TestKey;
  name: Bi;
  measures: Bi;      // what it quantifies
  prescribes: Bi;    // what the number then sets in the plan
  how: Bi[];         // the protocol cues (standardisation + execution)
  cite: string;
}

export interface TestPlan {
  protocol: TestProtocol;
  weeks: number[];   // pre-season week indices to run it (1 = first week)
  cadence: Bi;       // human phrasing of the repeat rhythm
  priority: "core" | "recommended";
}

const aerobicProtocol = (mode: AerobicMode): TestProtocol => {
  if (mode === "yoyo_ir1") {
    return {
      key: "aerobic",
      name: { en: "Yo-Yo IR1", is: "Yo-Yo IR1" },
      measures: { en: "High-intensity intermittent running capacity (total distance).", is: "Geta í ákafri endurtekinni hlaupavinnu (heildarvegalengd)." },
      prescribes: { en: "Aerobic base + a proxy for MAS to set running-zone speeds.", is: "Þolgrunn + MAS-nálgun til að stilla hlaupasvæði." },
      how: [
        { en: "Standardise: same surface + footwear, ≥48 h rested, same time of day, full progressive warm-up.", is: "Staðlaðu: sama undirlag + skór, ≥48 klst hvíld, sami tími dags, full stigvaxandi upphitun." },
        { en: "20 m shuttles to the beeps with a 10 m active recovery jog each turn; stop at the 2nd failure to reach the line.", is: "20 m shuttles eftir píptóni með 10 m virkri hvíld á hverjum snúningi; hættu við 2. sinn sem línan næst ekki." },
        { en: "Record the last completed stage → total distance (m).", is: "Skráðu síðasta kláraða stig → heildarvegalengd (m)." },
      ],
      cite: "Bangsbo 2008; Krustrup 2003",
    };
  }
  if (mode === "vameval") {
    return {
      key: "aerobic",
      name: { en: "VAMEVAL", is: "VAMEVAL" },
      measures: { en: "Maximal aerobic speed (MAS) via an incremental track test.", is: "Hámarks loftháður hraði (MAS) með stigvaxandi brautarprófi." },
      prescribes: { en: "MAS → interval speeds (%MAS) for running prescription.", is: "MAS → millibilshraða (%MAS) fyrir hlaupaáætlun." },
      how: [
        { en: "Standardise: track with cones every 20 m, ≥48 h rested, same time of day, full warm-up.", is: "Staðlaðu: braut með keilum á 20 m fresti, ≥48 klst hvíld, sami tími dags, full upphitun." },
        { en: "Start ~8 km/h, +0.5 km/h each minute, run to the audio pace; stop when the player can't hold the cone pace.", is: "Byrja ~8 km/klst, +0,5 km/klst á mínútu, halda hljóð-hraða; hætta þegar keilu-hraði næst ekki." },
        { en: "MAS = speed of the last completed stage (km/h).", is: "MAS = hraði síðasta kláraða stigs (km/klst)." },
      ],
      cite: "Cazorla 1990; di Prampero 1986",
    };
  }
  return {
    key: "aerobic",
    name: { en: "30-15 IFT", is: "30-15 IFT" },
    measures: { en: "Intermittent fitness — the end velocity VIFT (intermittent running + change of direction + recovery).", is: "Millibils-þol — lokahraði VIFT (millibilshlaup + stefnubreyting + endurheimt)." },
    prescribes: { en: "VIFT → individualised HIIT speeds (%VIFT) for interval prescription.", is: "VIFT → einstaklingsmiðaða HIIT-hraða (%VIFT) fyrir millibilsáætlun." },
    how: [
      { en: "Standardise: same surface + footwear, ≥48 h rested, same time of day, full progressive warm-up.", is: "Staðlaðu: sama undirlag + skór, ≥48 klst hvíld, sami tími dags, full stigvaxandi upphitun." },
      { en: "40 m course; 30 s runs / 15 s walking recovery to the audio; +0.5 km/h per stage.", is: "40 m braut; 30 s hlaup / 15 s göngu-hvíld eftir hljóði; +0,5 km/klst á stig." },
      { en: "Stop when the player fails to reach the zone 3× or can't keep pace; VIFT = last completed stage speed.", is: "Hætta þegar leikmaður nær ekki svæðinu 3× eða heldur ekki hraða; VIFT = hraði síðasta kláraða stigs." },
    ],
    cite: "Buchheit 2008/2010",
  };
};

const CMJ: TestProtocol = {
  key: "cmj",
  name: { en: "CMJ (jump)", is: "CMJ (stökk)" },
  measures: { en: "Neuromuscular readiness + lower-limb power (jump height, RSI-mod).", is: "Taugavöðva-viðbragð + neðri-útlima kraftur (stökkhæð, RSI-mod)." },
  prescribes: { en: "Fatigue/adaptation trend (monitoring), not a load by itself.", is: "Þreytu/aðlögunar-þróun (vöktun), ekki álag í sjálfu sér." },
  how: [
    { en: "3 maximal jumps, hands on hips, ~10 s apart; standardise footwear + surface + time of day.", is: "3 hámarks-stökk, hendur á mjöðmum, ~10 s á milli; staðlaðu skó + undirlag + tíma dags." },
    { en: "Take the trial MEAN (not the single best) as the day's value; flag beyond the player's own CV.", is: "Taktu MEÐALTAL tilrauna (ekki eitt besta) sem gildi dagsins; flaggaðu umfram eigin CV leikmanns." },
    { en: "Force plate (ForceDecks) preferred; a jump mat gives height only.", is: "Kraftplata (ForceDecks) helst; stökkmotta gefur aðeins hæð." },
  ],
  cite: "Claudino 2017; Gathercole 2015",
};

const MAX_STRENGTH: TestProtocol = {
  key: "maxStrength",
  name: { en: "Max strength (VBT / 1RM)", is: "Hámarksstyrkur (VBT / 1RM)" },
  measures: { en: "Maximal strength via a load-velocity profile or an estimated 1RM.", is: "Hámarksstyrkur með hraða-álags sniði eða áætluðu 1RM." },
  prescribes: { en: "Working loads (%1RM) + velocity targets for the strength blocks.", is: "Vinnuálag (%1RM) + hraðamörk fyrir styrktarlotur." },
  how: [
    { en: "Build up in the main lift; record bar velocity at each load to fit the load-velocity line.", is: "Byggðu upp í aðal-lyftu; skráðu stangarhraða við hvert álag til að fitta hraða-álags línu." },
    { en: "Estimate 1RM from the velocity at a submax load (avoids true-max testing on detrained players).", is: "Áætlaðu 1RM út frá hraða við undir-hámarks álag (forðast raun-hámark á vanþjálfuðum)." },
    { en: "Re-profile at each block boundary — strength moves fast early in pre-season.", is: "Endur-profílaðu við hver lotuskil — styrkur breytist hratt snemma í undirbúningi." },
  ],
  cite: "Mann 2015; Weakley 2021 (VBT)",
};

const NORDBORD: TestProtocol = {
  key: "nordbord",
  name: { en: "NordBord (eccentric hamstring)", is: "NordBord (sérvirkni aftanlæris)" },
  measures: { en: "Eccentric hamstring strength + left/right asymmetry.", is: "Sérvirkur styrkur aftanlæris + hægri/vinstri ósamhverfa." },
  prescribes: { en: "Injury-risk flag + a Nordic/eccentric emphasis where low or asymmetric.", is: "Meiðsla-áhættu flagg + Nordic/sérvirkni áhersla þar sem lágt eða ósamhverft." },
  how: [
    { en: "Bilateral Nordic on the device; 3 reps; record peak force (N) each side + % imbalance.", is: "Tvíhliða Nordic á tækinu; 3 endurtekningar; skráðu hámarkskraft (N) hvorum megin + % ójafnvægi." },
    { en: "Same warm-up + rested; re-test through pre-season as eccentric capacity builds.", is: "Sama upphitun + hvíld; endurtaktu gegnum undirbúning eftir því sem sérvirkni byggist." },
  ],
  cite: "Bourne 2018; Opar 2013",
};

const SPRINT: TestProtocol = {
  key: "sprint",
  name: { en: "Sprint (10-30 m + max velocity)", is: "Sprettur (10-30 m + hámarkshraði)" },
  measures: { en: "Acceleration (10 m) + maximal sprinting speed (flying 10-30 m).", is: "Hröðun (10 m) + hámarks spretthraði (fljúgandi 10-30 m)." },
  prescribes: { en: "Speed reserve + high-speed-running exposure targets.", is: "Hraðaforða + háhraðahlaups-viðmið." },
  how: [
    { en: "Timing gates; ≥48 h rested; full sprint-specific warm-up + 2-3 build-ups; best of 2-3 trials.", is: "Tímahlið; ≥48 klst hvíld; full sprett-sértæk upphitun + 2-3 uppbyggingar; besta af 2-3 tilraunum." },
    { en: "Record 10 m (accel) + peak flying velocity (m/s or km/h).", is: "Skráðu 10 m (hröðun) + hámarks fljúgandi hraða (m/s eða km/klst)." },
  ],
  cite: "Haugen 2019",
};

/** Spread test weeks across the pre-season: baseline (wk 1), a mid re-test, and an end-of-block re-test. */
function boundaryWeeks(preseasonWeeks: number): number[] {
  const w = Math.max(1, Math.round(preseasonWeeks));
  if (w <= 2) return Array.from({ length: w }, (_, i) => i + 1);
  const mid = Math.max(2, Math.round(w / 2));
  return Array.from(new Set([1, mid, w])).sort((a, b) => a - b);
}

export interface TestingScheduleOpts {
  preseasonWeeks: number;
  hasGps?: boolean;         // GPS team → sprint/HSR testing is more actionable
  hasVald?: boolean;        // VALD ForceDecks/NordBord available
  aerobicMode?: AerobicMode; // the team's preferred aerobic test (default 30-15 IFT)
}

/**
 * The recommended pre-season testing schedule. Aerobic + max-strength re-test at block boundaries;
 * CMJ is a weekly monitoring test; NordBord + sprint are recommended add-ons (VALD/GPS gated).
 */
export function recommendTestingSchedule(opts: TestingScheduleOpts): TestPlan[] {
  const w = Math.max(1, Math.round(opts.preseasonWeeks));
  const bounds = boundaryWeeks(w);
  const everyWeek = Array.from({ length: w }, (_, i) => i + 1);
  const plans: TestPlan[] = [];

  plans.push({
    protocol: aerobicProtocol(opts.aerobicMode ?? "ift_30_15"),
    weeks: bounds,
    cadence: { en: "Baseline in week 1, then re-test every ~3-4 weeks (block boundaries).", is: "Grunnmæling í viku 1, svo endurtaka á ~3-4 vikna fresti (lotuskil)." },
    priority: "core",
  });

  plans.push({
    protocol: MAX_STRENGTH,
    weeks: Array.from(new Set([1, w])).sort((a, b) => a - b),
    cadence: { en: "Profile at the start and end of the pre-season block (and each new block).", is: "Profílaðu í upphafi og lok undirbúningslotu (og hverrar nýrrar lotu)." },
    priority: "core",
  });

  if (opts.hasVald !== false) {
    plans.push({
      protocol: CMJ,
      weeks: everyWeek,
      cadence: { en: "Weekly monitoring (same day each week) — track the trend, not one number.", is: "Vikuleg vöktun (sami dagur í viku) — fylgstu með þróun, ekki einni tölu." },
      priority: "core",
    });
    plans.push({
      protocol: NORDBORD,
      weeks: bounds,
      cadence: { en: "Baseline + re-test through pre-season as eccentric capacity builds.", is: "Grunnmæling + endurtaka gegnum undirbúning eftir því sem sérvirkni byggist." },
      priority: "recommended",
    });
  }

  plans.push({
    protocol: SPRINT,
    weeks: Array.from(new Set([1, w])).sort((a, b) => a - b),
    cadence: { en: "Baseline + an end-of-pre-season re-test.", is: "Grunnmæling + endurmæling í lok undirbúnings." },
    priority: opts.hasGps ? "recommended" : "recommended",
  });

  return plans;
}
