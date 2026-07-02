/**
 * Match Movement (IMA) — shared types + dimension metadata (client-safe).
 * The server engine lives in ./index (imports the admin client); the UI imports
 * only from here so no server code leaks into the client bundle.
 */

export type MovementFingerprint = {
  totalPerMin: number | null;
  accelDecelRatio: number | null;
  codPerMin: number | null;
  codLeftPct: number | null;
  hiCadencePerMin: number | null;
};

export type DimensionKey = keyof MovementFingerprint;

/**
 * The five movement-TYPE dimensions (not volume). `kind` drives formatting +
 * how a deviation is described in plain language.
 */
export const MOVEMENT_DIMENSIONS: Array<{
  key: DimensionKey;
  en: string;
  is: string;
  kind: "rate" | "ratio" | "pct";
  /** Plain-language name of the "more" / "less" direction (the metric read). */
  moreEN: string; moreIS: string;
  lessEN: string; lessIS: string;
  /** What that direction MEANS for a coach (the interpretation, layer 1). */
  whyMoreEN: string; whyMoreIS: string;
  whyLessEN: string; whyLessIS: string;
}> = [
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

/** The coaching interpretation of a signed deviation on a dimension (layer 1). */
export function whyWord(key: DimensionKey, rel: number, is: boolean): string {
  const d = MOVEMENT_DIMENSIONS.find((x) => x.key === key)!;
  return rel > 0 ? (is ? d.whyMoreIS : d.whyMoreEN) : is ? d.whyLessIS : d.whyLessEN;
}

/**
 * S&C drill-down — raw per-match counts behind "Show details". The high-intensity
 * bands (decelHigh, codHigh, stride8) are the injury/performance-relevant ones
 * that the summed fingerprint dimensions hide. Raw counts (not per-minute) as
 * S&C read them; the series labels carry the minutes for context.
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

export type MatchMovementRow = {
  player_id: string;
  name: string;
  position: string | null;
  match_date: string;
  minutes: number;
  fingerprint: MovementFingerprint;
  raw: { imaTotal: number | null; codTotal: number | null; codLeft: number | null; codRight: number | null; hiCadence: number | null };
  sub: SubBands;
};

export type MatchMovementResult = {
  teamId: string;
  matchDates: string[];
  rows: MatchMovementRow[];
  /** Per-player mean of each dimension across their matches (the "norm"). */
  playerAverages: Record<string, MovementFingerprint>;
  /** Per-player mean of each sub-band across their matches (S&C drill-down norm). */
  subAverages: Record<string, SubBands>;
  players: Array<{ player_id: string; name: string; position: string | null; matches: number }>;
};

/** Format a dimension value for display. */
export function fmtDim(key: DimensionKey, v: number | null): string {
  if (v == null) return "—";
  if (key === "codLeftPct") return `${Math.round(v)}%`;
  if (key === "accelDecelRatio") return v.toFixed(2);
  return v.toFixed(1);
}
