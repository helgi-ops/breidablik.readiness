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
  /** Plain-language name of the "more" direction (for verdicts). */
  moreEN: string; moreIS: string;
  /** Plain-language name of the "less" direction. */
  lessEN: string; lessIS: string;
}> = [
  { key: "totalPerMin",     en: "IMA load / min",           is: "IMA álag / mín",       kind: "rate",
    moreEN: "more movement load", moreIS: "meira hreyfiálag", lessEN: "less movement load", lessIS: "minna hreyfiálag" },
  { key: "accelDecelRatio", en: "Accel : Decel",            is: "Hröðun : Hemlun",      kind: "ratio",
    moreEN: "more acceleration-biased", moreIS: "hröðunar-þyngri", lessEN: "more braking-biased", lessIS: "hemlunar-þyngri" },
  { key: "codPerMin",       en: "Change-of-direction / min", is: "Stefnubreytingar / mín", kind: "rate",
    moreEN: "more change-of-direction", moreIS: "meiri stefnubreyting", lessEN: "less change-of-direction", lessIS: "minni stefnubreyting" },
  { key: "codLeftPct",      en: "CoD left %",               is: "Stefnubr. vinstri %",  kind: "pct",
    moreEN: "more left-side turns", moreIS: "meira vinstri", lessEN: "more right-side turns", lessIS: "meira hægri" },
  { key: "hiCadencePerMin", en: "High-cadence strides / min", is: "Háákefðar skref / mín", kind: "rate",
    moreEN: "more high-cadence running", moreIS: "meira háákefðar hlaup", lessEN: "less high-cadence running", lessIS: "minna háákefðar hlaup" },
];

export type MatchMovementRow = {
  player_id: string;
  name: string;
  position: string | null;
  match_date: string;
  minutes: number;
  fingerprint: MovementFingerprint;
  raw: { imaTotal: number | null; codTotal: number | null; codLeft: number | null; codRight: number | null; hiCadence: number | null };
};

export type MatchMovementResult = {
  teamId: string;
  matchDates: string[];
  rows: MatchMovementRow[];
  /** Per-player mean of each dimension across their matches (the "norm"). */
  playerAverages: Record<string, MovementFingerprint>;
  players: Array<{ player_id: string; name: string; position: string | null; matches: number }>;
};

/** Format a dimension value for display. */
export function fmtDim(key: DimensionKey, v: number | null): string {
  if (v == null) return "—";
  if (key === "codLeftPct") return `${Math.round(v)}%`;
  if (key === "accelDecelRatio") return v.toFixed(2);
  return v.toFixed(1);
}
