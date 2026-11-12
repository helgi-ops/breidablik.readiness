/**
 * Velocity-based training (VBT) methods — Weakley et al. 2021, Table 5.
 *
 * Weakley J, Mann B, Banyard H, McLaren S, Scott T, García-Ramos A. Velocity-Based Training: From Theory
 * to Application. Strength Cond J 43(2): 31–49, 2021. Table 5 lists six commonly used ways to run a
 * strength exercise with bar speed, and for each says whether sets, reps and load are PRESCRIBED
 * (decided before the session / after the set) or FLEXIBLE (decided by the athlete's fatigue or readiness
 * on the day). Table 2 gives the bar speed at a one-rep max (V1RM) for common lifts.
 *
 * Pure and client-safe (no React, no DB). One stored shape (`VbtPrescription`) is used by the team
 * strength rules and the personal-trainer plan builder; `formatVbtForPlayer` turns it into the plain lines
 * the player reads. The app does NOT measure bar speed: these are instructions an athlete follows with
 * their own bar-speed device. Descriptive only — never the readiness colour, never a load decision.
 */

import type { Bi } from "@/lib/micropulse/load/peakPeriod";

export type VbtMethodKey =
  | "set_avg_velocity"
  | "set_avg_velocity_vl"
  | "target_velocity_vl"
  | "fixed_set_vl"
  | "fixed_total_reps_vl"
  | "fixed_set_vl_rep_cap";

/** Table 5: "Prescribed" = decided before the session or after the set; "Flexible" = decided on the day. */
export type VbtControl = "prescribed" | "flexible";

/** The numbers a coach can set. `velocityRange` = both `velocityMin` and `velocityMax`. */
export type VbtParamKey = "targetVelocity" | "velocityRange" | "velocityLossPct" | "repCap" | "totalReps";

/** The stored prescription (team block rule and PT plan exercise share this shape). */
export interface VbtPrescription {
  method: VbtMethodKey;
  /** m/s — target average (method 1) or start speed (methods 3, 6). */
  targetVelocity?: number;
  /** m/s — speed zone (methods 2, 3). */
  velocityMin?: number;
  velocityMax?: number;
  /** % drop from the fastest rep that ends the set. */
  velocityLossPct?: number;
  /** Most reps allowed in one set (method 6). */
  repCap?: number;
  /** Total reps for the exercise, in as many sets as needed (method 5). */
  totalReps?: number;
}

/** What an editor holds while the coach is still filling numbers in. Stored rules may carry a draft;
 *  every reader runs `sanitizeVbtPrescription`, so an incomplete draft never reaches a player. */
export type VbtDraft = { method: VbtMethodKey } & Partial<Omit<VbtPrescription, "method">>;

export interface VbtMethod {
  key: VbtMethodKey;
  /** Row in Weakley et al. 2021, Table 5. */
  tableRow: 1 | 2 | 3 | 4 | 5 | 6;
  /** Plain coach-facing name. */
  label: Bi;
  /** One plain sentence: what the athlete does. */
  summary: Bi;
  /** The method's name as Table 5 prints it (details level only). */
  paperName: string;
  /** The paper's rule, paraphrased (details level only). */
  paperRule: Bi;
  control: { sets: VbtControl; reps: VbtControl; load: VbtControl };
  /** Any ONE group satisfies the method (e.g. a start speed OR a speed zone). */
  requires: VbtParamKey[][];
  optional: VbtParamKey[];
  /** Where the starting weight comes from. */
  loadFrom: "profile" | "target_speed" | "profile_or_target_speed";
  /** Which of the paper's in-session rules apply (±0.06 m/s window, 4–5% load step, extra 30 s rest). */
  rules: { tolerance: boolean; loadStep: boolean; extraRest: boolean };
  /** The paper's own example values. */
  example: VbtPrescription;
  /** How the coach runs it, step by step. */
  coachSteps: Bi[];
  refs: string[];
}

/** Pre-localised card that rides on a delivered session block and is rendered as-is by the player app. */
export interface VbtPlayerCard {
  key: VbtMethodKey;
  label: string;
  /** The one rule to remember (layer 0). */
  headline: string;
  /** 1–3 plain supporting lines (layer 1). */
  facts: string[];
  /** "How to perform" steps. */
  steps: string[];
  /** Device note. */
  note: string;
  cite: string;
}

// ── Constants from the paper ─────────────────────────────────────────────────────────────────────────

/** ±m/s window around a target speed before the weight is changed (Table 5, methods 1 and 3). */
export const VBT_TOLERANCE_MS = 0.06;
/** Weight change, as % of the athlete's max, when the speed is outside the window (Table 5). */
export const VBT_LOAD_STEP_PCT: readonly [number, number] = [4, 5];
/** Extra rest when the first rep misses the target window (Table 5, method 3). */
export const VBT_EXTRA_REST_SEC = 30;
/** Speed-loss cut-offs offered in pickers (the paper's examples are 10, 20 and 30%). */
export const VBT_VL_OPTIONS = [10, 15, 20, 25, 30] as const;

export const VBT_CITE =
  "Weakley J, Mann B, Banyard H, McLaren S, Scott T, García-Ramos A. Velocity-Based Training: From Theory to Application. Strength Cond J 43(2): 31–49, 2021 (Table 5).";

const REF_TABLE5 = "Weakley et al. 2021 — Strength Cond J 43(2):31–49, Table 5";
const REF_BANYARD = "Banyard et al. 2018 — Comparison of velocity-based and traditional 1RM percent-based training methods. Int J Sports Physiol Perform 14:246–255";
const REF_DORRELL = "Dorrell, Smith & Gee 2020 — Velocity-based vs percentage-based loading on maximal strength and power. J Strength Cond Res 34:46–53";
const REF_PAREJA_SOCCER = "Pareja-Blanco et al. 2017 — Velocity loss during resistance training in professional soccer players. Int J Sports Physiol Perform 12:512–519";
const REF_PAREJA_SJMSS = "Pareja-Blanco et al. 2017 — Velocity loss, athletic performance, strength gains and muscle adaptations. Scand J Med Sci Sports 27:724–735";
const REF_WEAKLEY_2020 = "Weakley et al. 2020 — Velocity loss thresholds: perceptual, metabolic and neuromuscular responses. J Sports Sci 38:477–485";
const REF_WEAKLEY_2019 = "Weakley et al. 2019 — 10%, 20% and 30% velocity loss thresholds in the back squat. Int J Sports Physiol Perform";

/** Bar speed at a one-rep max (V1RM, m/s), Weakley et al. 2021 Table 2 (pooled value per lift). */
export const V1RM_TABLE2: ReadonlyArray<{ key: string; name: Bi; v1rm: number; smith?: boolean }> = [
  { key: "bench_press", name: { en: "Bench press", is: "Bekkpressa" }, v1rm: 0.17 },
  { key: "prone_bench_pull", name: { en: "Prone bench pull", is: "Bekktog á maga" }, v1rm: 0.5 },
  { key: "prone_pull_up", name: { en: "Pull-up (overhand)", is: "Upphífing (yfirgrip)" }, v1rm: 0.23 },
  { key: "seated_military_press", name: { en: "Seated military press", is: "Axlapressa sitjandi" }, v1rm: 0.19 },
  { key: "lat_pulldown", name: { en: "Lat pulldown", is: "Niðurtog" }, v1rm: 0.47 },
  { key: "seated_cable_row", name: { en: "Seated cable row", is: "Róður sitjandi í kapli" }, v1rm: 0.4 },
  { key: "squat", name: { en: "Squat", is: "Hnébeygja" }, v1rm: 0.3 },
  { key: "deadlift", name: { en: "Deadlift", is: "Réttstöðulyfta" }, v1rm: 0.15 },
  { key: "hip_thrust", name: { en: "Hip thrust", is: "Mjaðmalyfta" }, v1rm: 0.25 },
  { key: "leg_press", name: { en: "Leg press", is: "Fótapressa" }, v1rm: 0.21 },
];

export const VBT_DEVICE_NOTE: Bi = {
  en: "Needs a bar-speed device. The app doesn't measure; read the speed off your own device after each rep.",
  is: "Þarf stangarhraðamæli. Appið mælir ekki; lestu hraðann af þínum mæli eftir hverja endurtekningu.",
};

export const VL_FATIGUE_NOTE: Bi = {
  en: "The bigger the allowed speed drop, the more fatigue: 10%, 20% and 30% give step-by-step more fatigue, effort and metabolic stress, and the response is consistent within and between athletes (Weakley et al. 2020).",
  is: "Því meira hraðatap sem er leyft, því meiri þreyta: 10%, 20% og 30% gefa stigvaxandi þreytu, erfiði og efnaskiptaálag, og svörunin er stöðug hjá sama íþróttamanni og milli manna (Weakley o.fl. 2020).",
};

export const LVP_1RM_CAVEAT: Bi = {
  en: "Predicting a max lift from bar speed works for some upper-body lifts (bench press, bench pull) but is not accurate for free-weight squats and deadlifts. Test those directly (Weakley et al. 2021).",
  is: "Spá um hámarkslyftu út frá stangarhraða virkar í sumum efri búks lyftum (bekkpressa, bekktog) en er ekki nákvæm í hnébeygju og réttstöðulyftu með lausum lóðum. Prófaðu þær beint (Weakley o.fl. 2021).",
};

/** Table 5 says the load "is adjusted"; the direction is our reading, labelled as such. */
export const LOAD_DIRECTION_NOTE: Bi = {
  en: "Table 5 says the weight is adjusted. The direction used here (faster than the window → heavier, slower → lighter) is MicroPulse's reading of that rule.",
  is: "Í töflu 5 segir að þyngdin sé aðlöguð. Áttin sem notuð er hér (hraðar en bilið → þyngra, hægar → léttara) er túlkun MicroPulse á reglunni.",
};

// ── The six methods ──────────────────────────────────────────────────────────────────────────────────

export const VBT_METHODS: readonly VbtMethod[] = [
  {
    key: "set_avg_velocity",
    tableRow: 1,
    label: { en: "Set speed target", is: "Hraðamark á sett" },
    summary: {
      en: "Sets and reps are fixed. Each set should average a target bar speed; the weight changes when it doesn't.",
      is: "Sett og endurtekningar eru föst. Hvert sett á að ná markhraða að meðaltali; þyngdin breytist ef það tekst ekki.",
    },
    paperName: "Set average velocity",
    paperRule: {
      en: "Load from the athlete's load-velocity profile, fixed sets and reps. The set's average speed must stay within ±0.06 m/s of the prescribed speed; outside that, the load is adjusted by 4–5% of 1RM.",
      is: "Þyngd úr hraða-þyngdarprófíl íþróttamannsins, föst sett og endurtekningar. Meðalhraði settsins á að vera innan ±0,06 m/s frá fyrirmælunum; utan þess er þyngd aðlöguð um 4–5% af 1RM.",
    },
    control: { sets: "prescribed", reps: "prescribed", load: "flexible" },
    requires: [["targetVelocity"]],
    optional: [],
    loadFrom: "profile",
    rules: { tolerance: true, loadStep: true, extraRest: false },
    example: { method: "set_avg_velocity", targetVelocity: 0.7 },
    coachSteps: [
      { en: "Set the target average speed for the set.", is: "Settu markhraða sem settið á að ná að meðaltali." },
      { en: "Start from the weight the athlete's speed profile gives for that speed.", is: "Byrjaðu á þyngdinni sem hraðaprófíll íþróttamannsins gefur fyrir þann hraða." },
      { en: "After each set: more than 0.06 m/s off → change the weight by 4–5% of the max.", is: "Eftir hvert sett: meira en 0,06 m/s frá → breyttu þyngd um 4–5% af hámarki." },
    ],
    refs: [REF_TABLE5, REF_BANYARD],
  },
  {
    key: "set_avg_velocity_vl",
    tableRow: 2,
    label: { en: "Speed zone + stop rule", is: "Hraðabil + stöðvunarregla" },
    summary: {
      en: "Sets are fixed. Each set ends when bar speed drops by a set %, and its average should land in a speed zone.",
      is: "Sett eru föst. Hverju setti lýkur þegar stangarhraðinn fellur um ákveðið %, og meðaltalið á að lenda innan hraðabils.",
    },
    paperName: "Set average velocity + VL thresholds",
    paperRule: {
      en: "Load from a load-velocity profile, fixed number of sets, a velocity-loss threshold ends each set (e.g. 20%). The set's average speed must land in a zone (e.g. 0.74–0.88 m/s in the back squat); if not, the load can be changed.",
      is: "Þyngd úr hraða-þyngdarprófíl, fastur fjöldi setta, hraðatapsmörk enda hvert sett (t.d. 20%). Meðalhraði settsins á að lenda innan bils (t.d. 0,74–0,88 m/s í hnébeygju); annars má breyta þyngd.",
    },
    control: { sets: "prescribed", reps: "flexible", load: "flexible" },
    requires: [["velocityRange", "velocityLossPct"]],
    optional: [],
    loadFrom: "profile",
    rules: { tolerance: false, loadStep: false, extraRest: false },
    example: { method: "set_avg_velocity_vl", velocityMin: 0.74, velocityMax: 0.88, velocityLossPct: 20 },
    coachSteps: [
      { en: "Set the speed zone and the speed drop that ends a set.", is: "Settu hraðabilið og hraðatapið sem endar sett." },
      { en: "Start from the weight the athlete's speed profile gives for the zone.", is: "Byrjaðu á þyngdinni sem hraðaprófíllinn gefur fyrir bilið." },
      { en: "Set average outside the zone → change the weight for the next set.", is: "Meðaltal settsins utan bilsins → breyttu þyngd fyrir næsta sett." },
    ],
    refs: [REF_TABLE5, REF_BANYARD, REF_DORRELL],
  },
  {
    key: "target_velocity_vl",
    tableRow: 3,
    label: { en: "Start speed + stop rule", is: "Upphafshraði + stöðvunarregla" },
    summary: {
      en: "The weight is chosen to hit a start speed. Each set ends when bar speed drops by a set %.",
      is: "Þyngdin er valin til að ná upphafshraða. Hverju setti lýkur þegar stangarhraðinn fellur um ákveðið %.",
    },
    paperName: "Targeted velocity + VL thresholds",
    paperRule: {
      en: "A start speed or speed range is prescribed (e.g. 0.70–0.75 m/s) and the load is changed to meet it; a velocity-loss threshold (e.g. 10%) ends each set. In later sets, if the first rep is more than ±0.06 m/s off, 30 s extra rest is given; if the next rep is still off, the load is adjusted by 4–5% of 1RM.",
      is: "Upphafshraði eða hraðabil er gefið (t.d. 0,70–0,75 m/s) og þyngd breytt til að ná því; hraðatapsmörk (t.d. 10%) enda hvert sett. Í síðari settum, ef fyrsta endurtekning er meira en ±0,06 m/s frá, fást 30 sek aukahvíld; ef næsta endurtekning er enn utan er þyngd aðlöguð um 4–5% af 1RM.",
    },
    control: { sets: "prescribed", reps: "flexible", load: "flexible" },
    requires: [["targetVelocity", "velocityLossPct"], ["velocityRange", "velocityLossPct"]],
    optional: [],
    loadFrom: "target_speed",
    rules: { tolerance: true, loadStep: true, extraRest: true },
    example: { method: "target_velocity_vl", velocityMin: 0.7, velocityMax: 0.75, velocityLossPct: 10 },
    coachSteps: [
      { en: "Set the start speed (or range) and the speed drop that ends a set.", is: "Settu upphafshraða (eða bil) og hraðatapið sem endar sett." },
      { en: "In the warm-up the athlete finds the weight that moves at that speed today.", is: "Í upphitun finnur íþróttamaðurinn þyngdina sem fer á þeim hraða í dag." },
      { en: "First rep more than 0.06 m/s off → 30 s extra rest; still off on the next rep → change the weight by 4–5% of the max.", is: "Fyrsta endurtekning meira en 0,06 m/s frá → 30 sek aukahvíld; enn utan á næstu → breyttu þyngd um 4–5% af hámarki." },
    ],
    refs: [REF_TABLE5, REF_PAREJA_SOCCER, REF_PAREJA_SJMSS, REF_WEAKLEY_2020, REF_WEAKLEY_2019],
  },
  {
    key: "fixed_set_vl",
    tableRow: 4,
    label: { en: "Fixed sets + stop rule", is: "Föst sett + stöðvunarregla" },
    summary: {
      en: "Weight and sets are set in advance. Each set ends when bar speed drops by a set %.",
      is: "Þyngd og sett eru ákveðin fyrirfram. Hverju setti lýkur þegar stangarhraðinn fellur um ákveðið %.",
    },
    paperName: "Fixed set + velocity loss threshold",
    paperRule: {
      en: "Load from the athlete's load-velocity profile. A velocity-loss threshold (e.g. 10%) is given and the athlete ends the set when speed drops past it.",
      is: "Þyngd úr hraða-þyngdarprófíl íþróttamannsins. Hraðatapsmörk (t.d. 10%) eru gefin og íþróttamaðurinn hættir settinu þegar hraðinn fellur niður fyrir þau.",
    },
    control: { sets: "prescribed", reps: "flexible", load: "prescribed" },
    requires: [["velocityLossPct"]],
    optional: [],
    loadFrom: "profile",
    rules: { tolerance: false, loadStep: false, extraRest: false },
    example: { method: "fixed_set_vl", velocityLossPct: 10 },
    coachSteps: [
      { en: "Set the weight, the number of sets and the speed drop that ends a set.", is: "Settu þyngd, fjölda setta og hraðatapið sem endar sett." },
      { en: "The athlete stops each set when bar speed has dropped that much from the fastest rep.", is: "Íþróttamaðurinn hættir hverju setti þegar hraðinn hefur fallið svo mikið frá hraðustu endurtekningunni." },
    ],
    refs: [REF_TABLE5, REF_BANYARD],
  },
  {
    key: "fixed_total_reps_vl",
    tableRow: 5,
    label: { en: "Total reps + stop rule", is: "Heildarfjöldi + stöðvunarregla" },
    summary: {
      en: "A total number of reps is set. Each set ends when bar speed drops by a set %; the athlete takes as many sets as needed to reach the total.",
      is: "Heildarfjöldi endurtekninga er ákveðinn. Hverju setti lýkur þegar stangarhraðinn fellur um ákveðið %; íþróttamaðurinn tekur eins mörg sett og þarf til að ná fjöldanum.",
    },
    paperName: "Fixed total repetition + flexible set + velocity loss threshold",
    paperRule: {
      en: "A total number of reps is set before the session (e.g. 25). Load from the load-velocity profile, a velocity-loss threshold ends each set, and the athlete takes as many sets as needed to complete the total.",
      is: "Heildarfjöldi endurtekninga er ákveðinn fyrir æfingu (t.d. 25). Þyngd úr hraða-þyngdarprófíl, hraðatapsmörk enda hvert sett, og íþróttamaðurinn tekur eins mörg sett og þarf til að klára fjöldann.",
    },
    control: { sets: "flexible", reps: "prescribed", load: "prescribed" },
    requires: [["totalReps", "velocityLossPct"]],
    optional: [],
    loadFrom: "profile",
    rules: { tolerance: false, loadStep: false, extraRest: false },
    example: { method: "fixed_total_reps_vl", totalReps: 25, velocityLossPct: 20 },
    coachSteps: [
      { en: "Set the weight, the total reps and the speed drop that ends a set.", is: "Settu þyngd, heildarfjölda endurtekninga og hraðatapið sem endar sett." },
      { en: "The athlete keeps doing sets until the total is reached; sets get shorter as fatigue builds.", is: "Íþróttamaðurinn tekur sett þar til fjöldanum er náð; settin styttast eftir því sem þreyta eykst." },
    ],
    refs: [REF_TABLE5, REF_BANYARD],
  },
  {
    key: "fixed_set_vl_rep_cap",
    tableRow: 6,
    label: { en: "Stop rule + rep cap", is: "Stöðvunarregla + hámark endurtekninga" },
    summary: {
      en: "Sets are fixed. Each set ends when bar speed drops by a set % or the rep cap is reached, whichever comes first.",
      is: "Sett eru föst. Hverju setti lýkur þegar stangarhraðinn fellur um ákveðið % eða hámarki endurtekninga er náð, hvort sem kemur fyrst.",
    },
    paperName: "Fixed set + velocity threshold + repetition cap",
    paperRule: {
      en: "Load from the load-velocity profile or a target speed, a velocity-loss threshold (e.g. 10%) and a rep cap (e.g. 5). The athlete lifts until speed drops past the threshold or the cap is reached.",
      is: "Þyngd úr hraða-þyngdarprófíl eða út frá markhraða, hraðatapsmörk (t.d. 10%) og hámark endurtekninga (t.d. 5). Íþróttamaðurinn lyftir þar til hraðinn fellur niður fyrir mörkin eða hámarkinu er náð.",
    },
    control: { sets: "prescribed", reps: "flexible", load: "prescribed" },
    requires: [["velocityLossPct", "repCap"]],
    optional: ["targetVelocity"],
    loadFrom: "profile_or_target_speed",
    rules: { tolerance: false, loadStep: false, extraRest: false },
    example: { method: "fixed_set_vl_rep_cap", velocityLossPct: 10, repCap: 5 },
    coachSteps: [
      { en: "Set the weight (or a start speed), the speed drop that ends a set and the most reps per set.", is: "Settu þyngd (eða upphafshraða), hraðatapið sem endar sett og mesta fjölda endurtekninga í setti." },
      { en: "The athlete stops at whichever comes first: the speed drop or the rep cap.", is: "Íþróttamaðurinn hættir við það sem kemur fyrst: hraðatapið eða hámarkið." },
    ],
    refs: [REF_TABLE5, REF_BANYARD],
  },
];

export const VBT_METHOD_BY_KEY: Readonly<Record<VbtMethodKey, VbtMethod>> = Object.fromEntries(
  VBT_METHODS.map((m) => [m.key, m]),
) as Record<VbtMethodKey, VbtMethod>;

export function isVbtMethodKey(v: unknown): v is VbtMethodKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(VBT_METHOD_BY_KEY, v);
}

// ── Sanitise ─────────────────────────────────────────────────────────────────────────────────────────

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const speed = (v: unknown): number | undefined => {
  const n = num(v);
  return n == null || n <= 0 ? undefined : Math.round(clamp(n, 0.05, 2.5) * 100) / 100;
};
const int = (v: unknown, lo: number, hi: number): number | undefined => {
  const n = num(v);
  return n == null || n <= 0 ? undefined : clamp(Math.round(n), lo, hi);
};

function has(p: VbtPrescription, k: VbtParamKey): boolean {
  switch (k) {
    case "targetVelocity": return p.targetVelocity != null;
    case "velocityRange": return p.velocityMin != null && p.velocityMax != null;
    case "velocityLossPct": return p.velocityLossPct != null;
    case "repCap": return p.repCap != null;
    case "totalReps": return p.totalReps != null;
  }
}

/** The numbers a method can carry (required in any group + optional). */
export function vbtParamsFor(method: VbtMethodKey): VbtParamKey[] {
  const m = VBT_METHOD_BY_KEY[method];
  return [...new Set([...m.requires.flat(), ...m.optional])];
}

/** Params still needed for the closest-to-complete required group (empty = valid). For picker UIs. */
export function missingVbtParams(p: VbtDraft): VbtParamKey[] {
  const m = VBT_METHOD_BY_KEY[p.method];
  let best: VbtParamKey[] | null = null;
  for (const group of m.requires) {
    const miss = group.filter((k) => !has(p as VbtPrescription, k));
    if (best == null || miss.length < best.length) best = miss;
  }
  return best ?? [];
}

/**
 * Validate + clean a stored prescription. Unknown method or a missing required number → null.
 * Numbers are clamped (speeds 0.05–2.5 m/s, 2 dp; speed loss 5–50%; rep cap 1–20; total reps 2–100),
 * a reversed zone is swapped, and numbers the method doesn't use are dropped.
 */
export function sanitizeVbtPrescription(raw: unknown): VbtPrescription | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isVbtMethodKey(r.method)) return null;
  const method = r.method;
  const allowed = new Set(vbtParamsFor(method));
  const out: VbtPrescription = { method };
  if (allowed.has("targetVelocity")) {
    const t = speed(r.targetVelocity);
    if (t != null) out.targetVelocity = t;
  }
  if (allowed.has("velocityRange")) {
    const a = speed(r.velocityMin);
    const b = speed(r.velocityMax);
    if (a != null && b != null) {
      out.velocityMin = Math.min(a, b);
      out.velocityMax = Math.max(a, b);
    }
  }
  if (allowed.has("velocityLossPct")) {
    const v = int(r.velocityLossPct, 5, 50);
    if (v != null) out.velocityLossPct = v;
  }
  if (allowed.has("repCap")) {
    const v = int(r.repCap, 1, 20);
    if (v != null) out.repCap = v;
  }
  if (allowed.has("totalReps")) {
    const v = int(r.totalReps, 2, 100);
    if (v != null) out.totalReps = v;
  }
  // Method 3 takes a start speed OR a zone — keep only the zone when both came in.
  if (method === "target_velocity_vl" && out.velocityMin != null && out.targetVelocity != null) delete out.targetVelocity;
  return missingVbtParams(out).length === 0 ? out : null;
}

// ── Format ───────────────────────────────────────────────────────────────────────────────────────────

type Lang = "EN" | "IS";

/** m/s with 2 decimals; Icelandic uses a decimal comma. */
export function fmtSpeed(v: number, lang: Lang): string {
  const s = v.toFixed(2);
  return lang === "IS" ? s.replace(".", ",") : s;
}

function zoneText(p: VbtPrescription, lang: Lang): string | null {
  if (p.velocityMin != null && p.velocityMax != null) return `${fmtSpeed(p.velocityMin, lang)}–${fmtSpeed(p.velocityMax, lang)} m/s`;
  if (p.targetVelocity != null) return `${fmtSpeed(p.targetVelocity, lang)} m/s`;
  return null;
}

const T = {
  stop: (pct: number): Bi => ({
    en: `Stop the set when bar speed drops ${pct}% from your fastest rep.`,
    is: `Hættu settinu þegar stangarhraðinn fellur um ${pct}% frá hraðustu endurtekningunni.`,
  }),
  repsGuide: {
    en: "The rep number on the card is a guide; the speed rule decides when the set ends.",
    is: "Fjöldi endurtekninga á kortinu er viðmið; hraðareglan ræður hvenær settinu lýkur.",
  } as Bi,
  window: (step: string): Bi => ({
    en: `More than ${step} m/s off: faster → add weight, slower → take weight off (about 4–5% of your max).`,
    is: `Meira en ${step} m/s frá: hraðar → bættu við þyngd, hægar → taktu af (um 4–5% af hámarki).`,
  }),
  device: {
    en: "Watch the bar speed on your device after every rep.",
    is: "Fylgstu með stangarhraðanum á mælinum eftir hverja endurtekningu.",
  } as Bi,
};

/** The plain card the player reads for this prescription (EN default, IS toggle). */
export function formatVbtForPlayer(p: VbtPrescription, lang: Lang): VbtPlayerCard {
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  const m = VBT_METHOD_BY_KEY[p.method];
  const tol = fmtSpeed(VBT_TOLERANCE_MS, lang);
  const zone = zoneText(p, lang);
  const vl = p.velocityLossPct;
  let headline = "";
  const facts: string[] = [];
  const steps: string[] = [L(T.device)];

  switch (p.method) {
    case "set_avg_velocity": {
      headline = L({ en: `Each set should average ${zone} bar speed.`, is: `Hvert sett á að ná ${zone} stangarhraða að meðaltali.` });
      facts.push(L(T.window(tol)));
      steps.push(headline, L(T.window(tol)));
      break;
    }
    case "set_avg_velocity_vl": {
      headline = L(T.stop(vl!));
      facts.push(L({ en: `Each set should average ${zone}. If it doesn't, change the weight for the next set.`, is: `Hvert sett á að vera ${zone} að meðaltali. Ef ekki, breyttu þyngd fyrir næsta sett.` }));
      facts.push(L(T.repsGuide));
      steps.push(L({ en: `Pick a weight that moves at ${zone}.`, is: `Veldu þyngd sem fer á ${zone}.` }), headline, facts[0]);
      break;
    }
    case "target_velocity_vl": {
      headline = L({ en: `Start each set at ${zone} and stop when bar speed drops ${vl}%.`, is: `Byrjaðu hvert sett á ${zone} og hættu þegar stangarhraðinn fellur um ${vl}%.` });
      const extra = L({
        en: `First rep more than ${tol} m/s off: rest ${VBT_EXTRA_REST_SEC} s extra. Still off on the next rep: change the weight by about 4–5% of your max.`,
        is: `Fyrsta endurtekning meira en ${tol} m/s frá: ${VBT_EXTRA_REST_SEC} sek aukahvíld. Enn utan á næstu: breyttu þyngd um 4–5% af hámarki.`,
      });
      facts.push(extra, L(T.repsGuide));
      steps.push(
        L({ en: `In the warm-up, find the weight that moves at ${zone} today.`, is: `Í upphitun, finndu þyngdina sem fer á ${zone} í dag.` }),
        L(T.stop(vl!)),
        extra,
      );
      break;
    }
    case "fixed_set_vl": {
      headline = L(T.stop(vl!));
      facts.push(L(T.repsGuide));
      steps.push(headline);
      break;
    }
    case "fixed_total_reps_vl": {
      headline = L({ en: `Do ${p.totalReps} reps in total, in as many sets as you need.`, is: `Taktu ${p.totalReps} endurtekningar samtals, í eins mörgum settum og þú þarft.` });
      facts.push(L(T.stop(vl!)));
      steps.push(L(T.stop(vl!)), L({ en: "Rest, then start the next set; stop when the total is reached.", is: "Hvíldu, byrjaðu svo næsta sett; hættu þegar fjöldanum er náð." }));
      break;
    }
    case "fixed_set_vl_rep_cap": {
      headline = L(T.stop(vl!));
      facts.push(L({ en: `Never more than ${p.repCap} reps in a set.`, is: `Aldrei fleiri en ${p.repCap} endurtekningar í setti.` }));
      if (zone) facts.push(L({ en: `Pick a weight that moves at ${zone} on the first rep.`, is: `Veldu þyngd sem fer á ${zone} í fyrstu endurtekningu.` }));
      steps.push(headline, facts[0]);
      break;
    }
  }

  return { key: p.method, label: L(m.label), headline, facts: facts.slice(0, 3), steps, note: L(VBT_DEVICE_NOTE), cite: VBT_CITE };
}

/** One line for coach surfaces, e.g. "Stop rule + rep cap · stop at −10% speed · max 5 reps". */
export function formatVbtForCoach(p: VbtPrescription, lang: Lang): string {
  const L = (b: Bi) => (lang === "IS" ? b.is : b.en);
  const bits: string[] = [L(VBT_METHOD_BY_KEY[p.method].label)];
  const zone = zoneText(p, lang);
  if (zone) bits.push(zone);
  if (p.velocityLossPct != null) bits.push(L({ en: `stop at −${p.velocityLossPct}% speed`, is: `stopp við −${p.velocityLossPct}% hraða` }));
  if (p.repCap != null) bits.push(L({ en: `max ${p.repCap} reps`, is: `mest ${p.repCap} endurt.` }));
  if (p.totalReps != null) bits.push(L({ en: `${p.totalReps} reps total`, is: `${p.totalReps} endurt. samtals` }));
  return bits.join(" · ");
}

/** Guard for a card read back from delivered jsonb (player app). */
export function readVbtPlayerCard(raw: unknown): VbtPlayerCard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const strs = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
  if (!isVbtMethodKey(r.key) || typeof r.label !== "string" || typeof r.headline !== "string" || !r.headline) return null;
  if (!strs(r.facts) || !strs(r.steps)) return null;
  return {
    key: r.key,
    label: r.label,
    headline: r.headline,
    facts: r.facts as string[],
    steps: r.steps as string[],
    note: typeof r.note === "string" ? r.note : "",
    cite: typeof r.cite === "string" ? r.cite : VBT_CITE,
  };
}
