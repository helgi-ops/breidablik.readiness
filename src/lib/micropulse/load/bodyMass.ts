/**
 * Body-mass resolver — the anthropometry input for per-kg metrics. Pure, side-effect free.
 *
 * Bodyweight is sparse: a coach-entered measurement (player_body_metrics) when it exists, else
 * the weight Catapult/VALD captured in a CMJ test payload, else nothing. This resolves those
 * candidates into ONE mass with clear provenance, so a per-kg figure is only ever shown when a
 * mass is genuinely known — never fabricated, never an assumed default. Descriptive context —
 * it never touches the readiness colour, the load target, or the daily decision.
 */

export type BodyMassSource = "coach" | "vald" | "import" | "none";

/** One candidate body-mass measurement. */
export interface BodyMassMeasurement {
  massKg: number | null;
  measuredOn: string | null; // ISO date
  source: Exclude<BodyMassSource, "none">;
}

export interface BodyMassResolved {
  massKg: number | null;
  source: BodyMassSource;
  measuredOn: string | null;
  /** How the coach should read the figure's trustworthiness. */
  note: string;
}

const isMass = (v: number | null | undefined): v is number => typeof v === "number" && isFinite(v) && v > 20 && v < 200;

/**
 * Resolve a single body mass from all known measurements, preferring:
 *   1. the most recent COACH-entered measurement (the ground truth), then
 *   2. the most recent measurement from any source (VALD CMJ weight, import), then
 *   3. none (null) — never a default.
 * Pure.
 */
export function resolveBodyMass(measurements: BodyMassMeasurement[]): BodyMassResolved {
  const valid = (measurements ?? []).filter((m) => isMass(m.massKg));
  if (!valid.length) {
    return { massKg: null, source: "none", measuredOn: null, note: "No body mass on file — enter one to enable per-kilogram figures." };
  }
  const byRecency = (a: BodyMassMeasurement, b: BodyMassMeasurement) => String(b.measuredOn ?? "").localeCompare(String(a.measuredOn ?? ""));
  const coach = valid.filter((m) => m.source === "coach").sort(byRecency)[0];
  const chosen = coach ?? valid.slice().sort(byRecency)[0];
  const note = chosen.source === "coach"
    ? "Coach-recorded body mass."
    : chosen.source === "vald"
      ? "From the latest VALD CMJ test weight — record a measured mass to confirm."
      : "Imported body mass.";
  return { massKg: chosen.massKg, source: chosen.source, measuredOn: chosen.measuredOn ?? null, note };
}

/** A per-kilogram figure — only when a mass is known; otherwise null with the reason. */
export function perKg(absoluteValue: number | null, mass: BodyMassResolved): { value: number | null; unit: string; hasMass: boolean } {
  const v = typeof absoluteValue === "number" && isFinite(absoluteValue) ? absoluteValue : null;
  if (v === null || mass.massKg === null || mass.massKg <= 0) return { value: null, unit: "/kg", hasMass: mass.massKg !== null };
  return { value: Math.round((v / mass.massKg) * 100) / 100, unit: "/kg", hasMass: true };
}
