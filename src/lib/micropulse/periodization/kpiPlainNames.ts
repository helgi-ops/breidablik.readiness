/**
 * Plain names, groups and one-line explanations for the weekly-load variables, shared by the two Meso tabs of
 * the Periodization Hub (Pre-season and In-season). Explainability: the primary view shows "Hard braking", not
 * "decelB23"; the raw label stays the fallback and the tooltip. Words only — no number, no rule.
 *
 * `what` says what the variable is; `why` (pre-season only) says why it starts where it starts in the ramp. The
 * pre-season table shows `what + " " + why`, which is the sentence it always showed.
 */

type Bi = { en: string; is: string };

export type KpiGroupKey = "run" | "speed" | "tissue" | "other";

export const KPI_GROUP_OF: Partial<Record<string, Exclude<KpiGroupKey, "other">>> = {
  totalDistance: "run", imaFrDistance: "run", imaStrideBand6: "run",
  velocityBand5: "speed", velocityBand6: "speed",
  accelB23: "tissue", imaAccel: "tissue", decelB23: "tissue", imaDecel: "tissue", imaCod: "tissue", imaTotal: "tissue",
};

/** Group titles. `preSub` is the pre-season sub-line (the ramp's reasoning); `inSub` the in-season one. */
export const KPI_GROUPS: Array<{ key: KpiGroupKey; title: Bi; preSub: Bi; inSub: Bi }> = [
  { key: "run", title: { en: "Running volume", is: "Hlaupamagn" }, preSub: { en: "the aerobic base — built high and early", is: "grunnþolið — byggt hátt og snemma" }, inSub: { en: "the aerobic base", is: "grunnþolið" } },
  { key: "speed", title: { en: "Speed", is: "Hraði" }, preSub: { en: "fast running — a careful return", is: "hröð hlaup — varfærin endurkoma" }, inSub: { en: "fast running and sprints", is: "hröð hlaup og sprettir" } },
  { key: "tissue", title: { en: "Muscle & tendon", is: "Vöðvar & sinar" }, preSub: { en: "speed-ups, braking, turns — the biggest strain", is: "hraðaaukningar, hemlun, beygjur — mesta álagið" }, inSub: { en: "speed-ups, braking, turns — the biggest strain", is: "hraðaaukningar, hemlun, beygjur — mesta álagið" } },
  { key: "other", title: { en: "Other", is: "Annað" }, preSub: { en: "", is: "" }, inSub: { en: "", is: "" } },
];

export const KPI_PLAIN: Partial<Record<string, Bi>> = {
  totalDistance: { en: "Total distance", is: "Heildarvegalengd" },
  imaFrDistance: { en: "Long runs at match pace", is: "Löng hlaup á leikhraða" },
  imaStrideBand6: { en: "Long-run strides", is: "Skref í löngum hlaupum" },
  velocityBand5: { en: "High-speed running", is: "Háhraðahlaup" },
  velocityBand6: { en: "Sprint", is: "Sprettir" },
  accelB23: { en: "Hard speed-ups", is: "Kröftugar hraðaaukningar" }, imaAccel: { en: "Hard speed-ups", is: "Kröftugar hraðaaukningar" },
  decelB23: { en: "Hard braking", is: "Kröftug hemlun" }, imaDecel: { en: "Hard braking", is: "Kröftug hemlun" },
  imaCod: { en: "Changes of direction", is: "Stefnubreytingar" },
  imaTotal: { en: "All hard actions", is: "Allar kröftugar aðgerðir" },
};

/** What each variable is (`what`) and, for the pre-season ramp, why it starts where it starts (`why`). */
export const KPI_WHAT: Partial<Record<string, { what: Bi; why?: Bi }>> = {
  totalDistance: { what: { en: "All the running in the week.", is: "Öll hlaup vikunnar." }, why: { en: "The aerobic base: built high and early.", is: "Grunnþolið: byggt hátt og snemma." } },
  velocityBand5: { what: { en: "Fast running (HSR).", is: "Hröð hlaup (HSR)." }, why: { en: "The base for repeated fast runs: loaded early, but below distance.", is: "Grunnur fyrir endurtekin hröð hlaup: hlaðið snemma, en undir vegalengd." } },
  velocityBand6: { what: { en: "Sprinting, the fastest running.", is: "Sprettir, hraðasta hlaupið." }, why: { en: "A careful return.", is: "Varfærin endurkoma." } },
  accelB23: { what: { en: "Hard speed-ups.", is: "Kröftugar hraðaaukningar." }, why: { en: "Training is full of them from day one (small games, drills).", is: "Æfingar eru fullar af þeim frá fyrsta degi (spil, æfingar)." } },
  imaAccel: { what: { en: "Hard speed-ups.", is: "Kröftugar hraðaaukningar." }, why: { en: "Training is full of them from day one (small games, drills).", is: "Æfingar eru fullar af þeim frá fyrsta degi (spil, æfingar)." } },
  decelB23: { what: { en: "Hard braking: the biggest strain on muscles and tendons,", is: "Kröftug hemlun: mesta álagið á vöðva og sinar," }, why: { en: "so it starts a little below speed-ups.", is: "svo hún byrjar aðeins undir hraðaaukningum." } },
  imaDecel: { what: { en: "Hard braking: the biggest strain on muscles and tendons,", is: "Kröftug hemlun: mesta álagið á vöðva og sinar," }, why: { en: "so it starts a little below speed-ups.", is: "svo hún byrjar aðeins undir hraðaaukningum." } },
  imaCod: { what: { en: "Hard changes of direction. High strain on tissue,", is: "Kröftugar stefnubreytingar. Mikið álag á vefi," }, why: { en: "so it starts with braking.", is: "svo þær byrja með hemlun." } },
  imaTotal: { what: { en: "All hard speed-ups, brakes and turns together.", is: "Allar kröftugar hraðaaukningar, hemlanir og beygjur saman." } },
  imaStrideBand6: { what: { en: "Strides in longer continuous runs (12–18 s).", is: "Skref í lengri samfelldum hlaupum (12–18 s)." }, why: { en: "Aerobic running base, not fast running.", is: "Hlaupagrunnur, ekki hröð hlaup." } },
  imaFrDistance: { what: { en: "Distance in long runs (18 s or more).", is: "Vegalengd í löngum hlaupum (18 s eða lengur)." }, why: { en: "Aerobic running base, not fast running.", is: "Hlaupagrunnur, ekki hröð hlaup." } },
  totalPlayerLoad: { what: { en: "The whole week's load in one number.", is: "Allt álag vikunnar í einni tölu." }, why: { en: "Changing it moves every variable you haven't set yourself by the same share.", is: "Ef þú breytir því færast allar breytur sem þú hefur ekki stillt sjálfur um sama hlutfall." } },
};

/** The pre-season sentence: what + why, as one line. */
export function kpiWhatWhy(key: string): Bi | null {
  const w = KPI_WHAT[key];
  if (!w) return null;
  return w.why ? { en: `${w.what.en} ${w.why.en}`, is: `${w.what.is} ${w.why.is}` } : w.what;
}

/** In-season: only what the variable is. Decel/CoD's `what` ends mid-sentence, so it closes with a full stop. */
export function kpiWhat(key: string): Bi | null {
  const w = KPI_WHAT[key];
  if (!w) return null;
  const close = (s: string) => s.replace(/,$/, ".");
  return { en: close(w.what.en), is: close(w.what.is) };
}

/** The group a variable sits in. `extra` places keys the shared map lacks (used by one tab only). */
export function kpiGroup(key: string, extra?: Partial<Record<string, Exclude<KpiGroupKey, "other">>>): KpiGroupKey {
  return KPI_GROUP_OF[key] ?? extra?.[key] ?? "other";
}

/** The plain name, unless another row already took it (two sources of one action keep their own label). */
export function plainKpiName(key: string, label: Bi, is: boolean, used: Set<string>): string {
  const plain = KPI_PLAIN[key] ? (is ? KPI_PLAIN[key]!.is : KPI_PLAIN[key]!.en) : null;
  const n = plain && !used.has(plain) ? plain : is ? label.is : label.en;
  used.add(n);
  return n;
}
