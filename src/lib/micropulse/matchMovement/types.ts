/**
 * Match Movement — shared types + dimension metadata (client-safe).
 * The server engine lives in ./index (imports the admin client); the UI imports
 * only from here so no server code leaks into the client bundle.
 *
 * Two variants of the "movement fingerprint":
 *   • ima — the true DRIVER layer (Pro/ELITE): accel:decel balance, change of
 *     direction, L/R asymmetry, stride cadence. HOW a player moves.
 *   • gps — the Core/Lite fallback: Lite units capture no IMA, so the fingerprint
 *     is built from GPS movement signals (player load, accel/decel efforts,
 *     high-speed + sprint running, top speed). Honestly a GPS movement read, NOT
 *     the inertial driver — the UI labels it as such.
 * The engine picks the variant from what the club's data actually contains.
 */

export type MovementVariant = "ima" | "gps";

/** A fingerprint is just N named movement values; the dimension list gives meaning. */
export type MovementFingerprint = Record<string, number | null>;
export type DimensionKey = string;

export type MovementDimension = {
  key: string;
  en: string;
  is: string;
  kind: "rate" | "ratio" | "pct";
  /** Plain-language name of the "more" / "less" direction (the metric read). */
  moreEN: string; moreIS: string;
  lessEN: string; lessIS: string;
  /** What that direction MEANS for a coach (the interpretation, layer 1). */
  whyMoreEN: string; whyMoreIS: string;
  whyLessEN: string; whyLessIS: string;
};

/**
 * IMA driver dimensions (Pro/ELITE). All five are movement TYPE, not volume.
 */
export const MOVEMENT_DIMENSIONS: MovementDimension[] = [
  { key: "totalPerMin",     en: "IMA load / min",           is: "IMA álag / mín",       kind: "rate",
    moreEN: "more movement load", moreIS: "meira hreyfiálag", lessEN: "less movement load", lessIS: "minna hreyfiálag",
    whyMoreEN: "a higher overall movement workload", whyMoreIS: "hærra heildar hreyfiálag",
    whyLessEN: "a lower overall movement workload", whyLessIS: "lægra heildar hreyfiálag" },
  { key: "accelDecelRatio", en: "Accel : Decel",            is: "Hröðun : Hemlun",      kind: "ratio",
    moreEN: "more acceleration-biased", moreIS: "hröðunar-þyngri", lessEN: "more braking-biased", lessIS: "hemlunar-þyngri",
    whyMoreEN: "he accelerated far more than he braked — more explosive, front-foot movement", whyMoreIS: "hann hraðaði mun meira en hann hemlaði — sprengikraftur, framfótar-leikur",
    whyLessEN: "he braked far more than he accelerated — more reactive, stop-start movement", whyLessIS: "hann hemlaði mun meira en hann hraðaði — viðbragð, stopp-og-fara" },
  { key: "codPerMin",       en: "Change-of-direction / min", is: "Stefnubreytingar / mín", kind: "rate",
    moreEN: "more change-of-direction", moreIS: "meiri stefnubreyting", lessEN: "less change-of-direction", lessIS: "minni stefnubreyting",
    whyMoreEN: "a more agility-heavy game — lots of turns", whyMoreIS: "lipurðar-þyngri leikur — margar stefnubreytingar",
    whyLessEN: "a more linear game — fewer turns", whyLessIS: "línulegri leikur — færri stefnubreytingar" },
  { key: "codLeftPct",      en: "CoD left %",               is: "Stefnubr. vinstri %",  kind: "pct",
    moreEN: "more left-side turns", moreIS: "meira vinstri", lessEN: "more right-side turns", lessIS: "meira hægri",
    whyMoreEN: "he turned to his left more (his side/role or the opponent)", whyMoreIS: "hann beygði meira til vinstri (hlið/hlutverk eða andstæðingur)",
    whyLessEN: "he turned to his right more (his side/role or the opponent)", whyLessIS: "hann beygði meira til hægri (hlið/hlutverk eða andstæðingur)" },
  { key: "hiCadencePerMin", en: "High-cadence strides / min", is: "Háákefðar skref / mín", kind: "rate",
    moreEN: "more high-cadence running", moreIS: "meira háákefðar hlaup", lessEN: "less high-cadence running", lessIS: "minna háákefðar hlaup",
    whyMoreEN: "more sprint-type running", whyMoreIS: "meira sprett-tegundar hlaup",
    whyLessEN: "less sprint-type running", whyLessIS: "minna sprett-tegundar hlaup" },
];

/**
 * GPS movement dimensions (Core/Lite). Built from GPS signals Lite units DO
 * capture — a movement read without the inertial driver. Every dimension is a
 * per-minute rate (or a peak) so matches of different length compare fairly.
 */
export const GPS_MOVEMENT_DIMENSIONS: MovementDimension[] = [
  { key: "workPerMin",    en: "Work rate / min",           is: "Vinnumagn / mín",       kind: "rate",
    moreEN: "more work per minute", moreIS: "meira vinnumagn á mín", lessEN: "less work per minute", lessIS: "minna vinnumagn á mín",
    whyMoreEN: "a higher overall workload", whyMoreIS: "hærra heildar vinnuálag",
    whyLessEN: "a lower overall workload", whyLessIS: "lægra heildar vinnuálag" },
  { key: "effortsPerMin", en: "Accel/decel efforts / min", is: "Hröðunar-/hemlunarátök / mín", kind: "rate",
    moreEN: "more accel/decel efforts", moreIS: "fleiri hröðunar-/hemlunarátök", lessEN: "fewer accel/decel efforts", lessIS: "færri átök",
    whyMoreEN: "more sharp speed changes — a more agility-heavy, stop-start game", whyMoreIS: "fleiri snöggar hraðabreytingar — lipurðar-þyngri, stopp-og-fara leikur",
    whyLessEN: "fewer sharp speed changes — a steadier, more linear game", whyLessIS: "færri snöggar hraðabreytingar — jafnari, línulegri leikur" },
  { key: "hsrPerMin",     en: "High-speed running / min",  is: "Háhraðahlaup / mín",    kind: "rate",
    moreEN: "more high-speed running", moreIS: "meira háhraðahlaup", lessEN: "less high-speed running", lessIS: "minna háhraðahlaup",
    whyMoreEN: "more time spent running at high speed", whyMoreIS: "meiri tími á háum hraða",
    whyLessEN: "less time spent running at high speed", whyLessIS: "minni tími á háum hraða" },
  { key: "sprintPerMin",  en: "Sprint distance / min",     is: "Sprett-vegalengd / mín", kind: "rate",
    moreEN: "more sprinting", moreIS: "meiri sprettur", lessEN: "less sprinting", lessIS: "minni sprettur",
    whyMoreEN: "more top-end sprint running", whyMoreIS: "meira hámarkshraða sprett-hlaup",
    whyLessEN: "less top-end sprint running", whyLessIS: "minna hámarkshraða sprett-hlaup" },
  { key: "topSpeed",      en: "Top speed",                 is: "Hæsti hraði",           kind: "rate",
    moreEN: "a higher top speed", moreIS: "hærri hámarkshraði", lessEN: "a lower top speed", lessIS: "lægri hámarkshraði",
    whyMoreEN: "he hit a higher peak speed", whyMoreIS: "hann náði hærri hámarkshraða",
    whyLessEN: "he hit a lower peak speed", whyLessIS: "hann náði lægri hámarkshraða" },
];

/** The dimension list for a variant. */
export function movementDimensions(variant: MovementVariant): MovementDimension[] {
  return variant === "gps" ? GPS_MOVEMENT_DIMENSIONS : MOVEMENT_DIMENSIONS;
}

/**
 * Plain, coach-facing definition of each dimension (IMA + GPS variants) — the
 * data is new to many coaches, so this says what the axis IS in one line. Shared
 * by the on-screen Match Movement view and the PDF export so both explain the
 * numbers the same way.
 */
export const DIM_DEFS: Record<string, { en: string; is: string }> = {
  totalPerMin:     { en: "The overall amount of movement work per minute — accelerations, decelerations and turns combined.",
                     is: "Heildar hreyfi-vinna á mínútu — hröðun, hemlun og snúningar samanlagt." },
  accelDecelRatio: { en: "The balance of speeding up vs slowing down. Above 1 = more accelerating (front-foot); below 1 = more braking (reactive).",
                     is: "Jafnvægi milli hröðunar og hemlunar. Yfir 1 = meiri hröðun (sóknar); undir 1 = meiri hemlun (viðbragð)." },
  codPerMin:       { en: "How often the player changes direction per minute — the agility demand of his game.",
                     is: "Hversu oft leikmaðurinn skiptir um stefnu á mínútu — lipurðar-krafan í leik hans." },
  codLeftPct:      { en: "Share of turns to the left vs right. Near 50% is balanced; a big skew flags a one-sided pattern.",
                     is: "Hlutfall vinstri vs hægri snúninga. Um 50% er jafnt; mikil skekkja bendir á einhliða mynstur." },
  hiCadencePerMin: { en: "Fast, sprint-type running per minute (stride bands 6-8) — the IMA read on high-speed running.",
                     is: "Hratt sprett-hlaup á mínútu (skref-bönd 6-8) — IMA-mæling á hröðu hlaupi." },
  workPerMin:      { en: "Overall physical workload per minute (GPS player load) — how hard the game was.",
                     is: "Heildar líkamlegt álag á mínútu (GPS) — hversu erfiður leikurinn var." },
  effortsPerMin:   { en: "Sharp accelerations and decelerations per minute — the agility / stop-start demand (the GPS stand-in for change of direction).",
                     is: "Snöggar hröðunir og hemlanir á mínútu — lipurðar-/stopp-og-fara krafan (GPS-staðgengill fyrir stefnubreytingar)." },
  hsrPerMin:       { en: "High-speed running metres per minute — how much fast running.",
                     is: "Háhraðahlaup (metrar) á mínútu — hversu mikið hratt hlaup." },
  sprintPerMin:    { en: "Sprint-distance metres per minute — top-end running.",
                     is: "Sprett-vegalengd (metrar) á mínútu — hámarkshraða hlaup." },
  topSpeed:        { en: "Peak sprint speed reached in the match (km/h).",
                     is: "Hæsti hraði sem náðist í leiknum (km/klst)." },
};

const DIM_BY_KEY: Map<string, MovementDimension> = new Map(
  [...MOVEMENT_DIMENSIONS, ...GPS_MOVEMENT_DIMENSIONS].map((d) => [d.key, d]),
);
/** Look up a dimension across both variants by key. */
export function dimByKey(key: string): MovementDimension | undefined {
  return DIM_BY_KEY.get(key);
}

/** The coaching interpretation of a signed deviation on a dimension (layer 1). */
export function whyWord(key: DimensionKey, rel: number, is: boolean): string {
  const d = dimByKey(key)!;
  return rel > 0 ? (is ? d.whyMoreIS : d.whyMoreEN) : is ? d.whyLessIS : d.whyLessEN;
}

/**
 * S&C drill-down — raw per-match counts behind "Show details" (IMA variant only).
 * The high-intensity bands (decelHigh, codHigh, stride8) are the demanding end
 * that the summed fingerprint dimensions hide — a descriptive read of mechanical
 * demand, not an injury prediction. Raw counts (not per-minute) as S&C read them.
 */
export type SubBands = {
  decelLow: number | null; decelMed: number | null; decelHigh: number | null;
  stride6: number | null; stride7: number | null; stride8: number | null;
  codHigh: number | null; codMed: number | null; codLow: number | null;
};
export type SubKey = keyof SubBands;

export const SUB_BAND_GROUPS: Array<{
  group: "decel" | "stride" | "cod";
  labelEN: string; labelIS: string;
  bands: Array<{ key: SubKey; en: string; is: string; high?: boolean }>;
}> = [
  { group: "decel", labelEN: "Deceleration by intensity", labelIS: "Hemlun eftir styrk", bands: [
    { key: "decelLow", en: "Low", is: "Lág" }, { key: "decelMed", en: "Medium", is: "Miðl" }, { key: "decelHigh", en: "High", is: "Há", high: true },
  ] },
  { group: "cod", labelEN: "Change-of-direction by intensity", labelIS: "Stefnubreyting eftir styrk", bands: [
    { key: "codHigh", en: "High", is: "Há", high: true }, { key: "codMed", en: "Medium", is: "Miðl" }, { key: "codLow", en: "Low", is: "Lág" },
  ] },
  { group: "stride", labelEN: "High-cadence stride bands", labelIS: "Háákefðar skref-bönd", bands: [
    { key: "stride6", en: "Band 6", is: "Band 6" }, { key: "stride7", en: "Band 7", is: "Band 7" }, { key: "stride8", en: "Band 8 (sprint)", is: "Band 8 (sprettur)", high: true },
  ] },
];

/** All-null sub-bands — used by the GPS variant, which has no IMA sub-band depth. */
export const EMPTY_SUB: SubBands = {
  decelLow: null, decelMed: null, decelHigh: null,
  stride6: null, stride7: null, stride8: null,
  codHigh: null, codMed: null, codLow: null,
};

export type MatchMovementRow = {
  player_id: string;
  name: string;
  position: string | null;
  match_date: string;
  minutes: number;
  estimated?: boolean;
  fingerprint: MovementFingerprint;
  raw: { imaTotal: number | null; codTotal: number | null; codLeft: number | null; codRight: number | null; hiCadence: number | null };
  sub: SubBands;
};

export type MatchMovementResult = {
  teamId: string;
  variant: MovementVariant;
  matchDates: string[];
  rows: MatchMovementRow[];
  /** Per-player mean of each dimension across their matches (the "norm"). */
  playerAverages: Record<string, MovementFingerprint>;
  /** Per-player mean of each sub-band across their matches (S&C drill-down norm). */
  subAverages: Record<string, SubBands>;
  players: Array<{ player_id: string; name: string; position: string | null; matches: number }>;
};

/** Format a dimension value for display (kind-aware via the dimension registry). */
export function fmtDim(key: DimensionKey, v: number | null): string {
  if (v == null) return "—";
  const kind = dimByKey(key)?.kind;
  if (kind === "pct") return `${Math.round(v)}%`;
  if (kind === "ratio") return v.toFixed(2);
  return v.toFixed(1);
}
