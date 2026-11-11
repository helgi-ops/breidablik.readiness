/**
 * How a drill's measured IMA ("movement") numbers read for a coach — pure, client-safe.
 *
 * IMA (Catapult inertial movement analysis) counts accelerations, braking, changes of direction and jumps
 * from the unit's accelerometer, so they are real indoors where GPS has no satellite lock. These lines are
 * what the drill card shows at a glance (plain words, per player), with the source of the numbers (session
 * date, players, indoors) on one line. Intensity bands, left vs right, per-minute and the sensor terms sit
 * one level down ("Show details").
 *
 * Descriptive only: what the drill delivered when it was last measured. Never the readiness colour.
 */

import { ENOUGH_LABEL } from "@/lib/micropulse/sessionEnough";

type Bi = { en: string; is: string };
type Lang = "EN" | "IS";

/** The drill_library / actual fields this reads (all optional; old rows lack the newer ones). */
export type DrillMovementInput = {
  ima_accel?: number | null;
  ima_decel?: number | null;
  ima_cod_total?: number | null;
  high_ima?: number | null;
  jump_count?: number | null;
  jumps?: number | null;
  ima_accel_low?: number | null;
  ima_accel_med?: number | null;
  ima_accel_high?: number | null;
  ima_decel_low?: number | null;
  ima_decel_med?: number | null;
  ima_decel_high?: number | null;
  ima_cod_left?: number | null;
  ima_cod_right?: number | null;
  ima_cod_med?: number | null;
  ima_cod_low?: number | null;
  duration_min?: number | null;
  distance_m?: number | null;
  measured_on?: string | null;
  measured_players?: number | null;
  measured_no_gps?: boolean | null;
};

export type MovementKey = "accel" | "decel" | "cod" | "jumps";

export type MovementLine = {
  key: MovementKey;
  label: Bi;
  /** Per player, all intensities. */
  value: number;
  /** Hard (top band) part of `value`, when known. */
  hard: number | null;
  /** By intensity, when the split is known: low / medium / hard. */
  bands: { low: number | null; med: number | null; hard: number | null } | null;
  perMin: number | null;
  /** Sensor term — tooltip / details only. */
  tech: string;
};

const fin = (v: number | null | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const MOVEMENT_LABEL: Record<MovementKey, Bi> = {
  accel: ENOUGH_LABEL.imaAccel,
  decel: ENOUGH_LABEL.imaDecel,
  cod: ENOUGH_LABEL.imaCod,
  jumps: { en: "Jumps", is: "Stökk" },
};

export const MOVEMENT_TECH: Record<MovementKey, string> = {
  accel: "IMA accelerations, Catapult intensity bands 1–3 (count)",
  decel: "IMA decelerations, Catapult intensity bands 1–3 (count)",
  cod: "IMA change of direction, left + right, bands 1–3 (count)",
  jumps: "IMA jumps, bands 1–8 (count)",
};

export const MOVEMENT_CITATIONS = [
  "Harper & McBurnie 2021 — braking and change of direction carry the highest tissue load",
  "Gaudino et al. 2014; Casamichana & Castellano 2010 — smaller pitches raise accelerations, braking and turns",
  "Bishop et al. 2020 — reading left vs right (on a drill, the side split mostly follows the drill's design)",
];

const bandsOf = (low: number | null, med: number | null, hard: number | null) =>
  low == null && med == null && hard == null ? null : { low, med, hard };

/** The drill's movement lines, in a fixed order. Empty when nothing was measured (Core units, or never synced). */
export function drillMovementLines(d: DrillMovementInput): MovementLine[] {
  const dur = fin(d.duration_min);
  const perMin = (v: number) => (dur != null && dur > 0 ? Math.round((v / dur) * 10) / 10 : null);
  const out: MovementLine[] = [];

  const accelLow = fin(d.ima_accel_low), accelMed = fin(d.ima_accel_med), accelHard = fin(d.ima_accel_high);
  const accel = fin(d.ima_accel) ?? (accelLow != null || accelMed != null || accelHard != null ? (accelLow ?? 0) + (accelMed ?? 0) + (accelHard ?? 0) : null);
  if (accel != null && accel > 0) {
    out.push({ key: "accel", label: MOVEMENT_LABEL.accel, value: accel, hard: accelHard, bands: bandsOf(accelLow, accelMed, accelHard), perMin: perMin(accel), tech: MOVEMENT_TECH.accel });
  }

  const decelLow = fin(d.ima_decel_low), decelMed = fin(d.ima_decel_med), decelHard = fin(d.ima_decel_high);
  const decel = fin(d.ima_decel) ?? (decelLow != null || decelMed != null || decelHard != null ? (decelLow ?? 0) + (decelMed ?? 0) + (decelHard ?? 0) : null);
  if (decel != null && decel > 0) {
    out.push({ key: "decel", label: MOVEMENT_LABEL.decel, value: decel, hard: decelHard, bands: bandsOf(decelLow, decelMed, decelHard), perMin: perMin(decel), tech: MOVEMENT_TECH.decel });
  }

  const codHard = fin(d.high_ima);
  const cod = fin(d.ima_cod_total);
  if (cod != null && cod > 0) {
    out.push({ key: "cod", label: MOVEMENT_LABEL.cod, value: cod, hard: codHard, bands: bandsOf(fin(d.ima_cod_low), fin(d.ima_cod_med), codHard), perMin: perMin(cod), tech: MOVEMENT_TECH.cod });
  }

  const jumps = fin(d.jump_count) ?? fin(d.jumps);
  if (jumps != null && jumps > 0) {
    out.push({ key: "jumps", label: MOVEMENT_LABEL.jumps, value: jumps, hard: null, bands: null, perMin: perMin(jumps), tech: MOVEMENT_TECH.jumps });
  }
  return out;
}

/** Share of changes of direction to the left (0–100), when both sides are known. */
export function codLeftPct(d: DrillMovementInput): number | null {
  const l = fin(d.ima_cod_left), r = fin(d.ima_cod_right);
  if (l == null || r == null || l + r <= 0) return null;
  return Math.round((l / (l + r)) * 100);
}

const round = (v: number) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);

/** One plain line for the card, e.g. "19 · 3 hard" / "98 · 54% to the left" (IS: "19 · 3 harðar"). */
export function movementValueText(line: MovementLine, d: DrillMovementInput, lang: Lang): string {
  const parts = [String(round(line.value))];
  if (line.key === "cod") {
    const left = codLeftPct(d);
    if (left != null) parts.push(lang === "IS" ? `${left}% til vinstri` : `${left}% to the left`);
  } else if (line.hard != null && line.hard > 0) {
    parts.push(lang === "IS" ? `${round(line.hard)} harðar` : `${round(line.hard)} hard`);
  }
  return parts.join(" · ");
}

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_IS = ["jan", "feb", "mar", "apr", "maí", "jún", "júl", "ágú", "sep", "okt", "nóv", "des"];

function shortDate(iso: string, lang: Lang): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const day = Number(m[3]);
  const mon = Number(m[2]) - 1;
  if (mon < 0 || mon > 11) return null;
  return lang === "IS" ? `${day}. ${MONTHS_IS[mon]}` : `${day} ${MONTHS_EN[mon]}`;
}

/**
 * Where the drill's numbers came from, e.g. "Measured 5 Nov · 11 players · indoors, no GPS". Null when the
 * drill has never been measured from a synced session (typed-in or imported numbers).
 */
export function measuredSourceText(d: DrillMovementInput, lang: Lang): string | null {
  if (!d.measured_on) return null;
  const date = shortDate(d.measured_on, lang);
  if (!date) return null;
  const parts = [lang === "IS" ? `Mælt ${date}` : `Measured ${date}`];
  const n = fin(d.measured_players);
  if (n != null && n > 0) parts.push(lang === "IS" ? `${n} leikmenn` : `${n} players`);
  if (d.measured_no_gps) {
    parts.push(lang === "IS" ? "inni, engin GPS" : "indoors, no GPS");
    // GPS columns were left as they were: say so when the drill still carries an older outdoor reading.
    const dist = fin(d.distance_m);
    if (dist != null && dist > 0) parts.push(lang === "IS" ? "GPS-tölur frá fyrri útiæfingu" : "GPS numbers from an earlier outdoor session");
  }
  return parts.join(" · ");
}

/** Hide a GPS tile on a drill measured indoors when it has no real reading (empty or 0). */
export function hideGpsTile(d: DrillMovementInput, value: number | null | undefined): boolean {
  return d.measured_no_gps === true && (value == null || value === 0);
}

/** One compact line for a delivered drill, e.g. "Accelerations 12 · Braking 19 · Changes of direction 57 · 54% to the left". */
export function movementSummaryText(d: DrillMovementInput, lang: Lang): string | null {
  const lines = drillMovementLines(d);
  if (!lines.length) return null;
  return lines.map((l) => `${lang === "IS" ? l.label.is : l.label.en} ${movementValueText(l, d, lang)}`).join(" · ");
}
