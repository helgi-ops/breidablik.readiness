/**
 * Kinexon metric catalog — the single source of truth for presenting a Kinexon
 * export's ~200 columns without 200 DB columns.
 *
 * Every column is already captured losslessly at ingestion: the parser preserves
 * the full row in `player_external_load_daily.raw_payload_json`, and the mapper
 * promotes the engine-relevant handful to typed columns. This catalog is the
 * READ side: each entry says how to pull a metric (typed column first, else the
 * original Kinexon header out of raw_payload_json), which family it belongs to,
 * its unit, and whether an acute:chronic ratio is meaningful for it (volumes yes,
 * rates/intensities no).
 *
 * Adding a metric = one entry here, shared by every surface (Load Intelligence,
 * the coach External/IMA tab). Descriptive external load only — never a verdict.
 *
 * Header matching is tolerant (see `normHeader` in parseExport): tokens must all
 * appear in the normalised header and none of `excl`. "Metabolic Power (Ø) (W)"
 * normalises to "metabolic power w", so tokens ["metabolic","power"] +
 * excl ["max","distance","work","time","min"] isolates the session average.
 */

import { normHeader, parseKinexonNumber, parseDurationToMinutes } from "./parseExport";

/** volume = accumulates over a session (ACWR meaningful); rate = per-minute;
 *  intensity = a peak/ratio/percentage (ACWR not meaningful). */
export type KinexonMetricKind = "volume" | "rate" | "intensity";

export interface KinexonMetric {
  key: string;
  labelEN: string;
  labelIS: string;
  /** Typed DB column to prefer (snake_case), when the metric is promoted. */
  col?: string;
  /** Tokens that must ALL be present in a normalised raw header. */
  tokens: string[];
  /** Tokens that must NOT be present (disambiguation). */
  excl?: string[];
  unit: string;
  digits: number;
  kind: KinexonMetricKind;
  /** Duration-style cell ("hh:mm:ss") → minutes rather than a plain number. */
  duration?: boolean;
}

export interface KinexonMetricGroup {
  key: string;
  titleEN: string;
  titleIS: string;
  metrics: KinexonMetric[];
}

/** The curated families. Per-minute and per-zone variants stay in raw_payload_json
 *  (nothing is lost) but are not each a separate row here — the base metric carries
 *  the family. Empty/all-null families auto-hide at render (feed honesty). */
export const KINEXON_CATALOG: KinexonMetricGroup[] = [
  {
    key: "load", titleEN: "Load", titleIS: "Álag",
    metrics: [
      { key: "player_load", labelEN: "Player Load", labelIS: "Player Load", col: "total_player_load", tokens: ["accumulated", "acceleration", "load"], excl: ["min", "jump"], unit: "", digits: 1, kind: "volume" },
      { key: "player_load_min", labelEN: "Player Load / min", labelIS: "Player Load / mín", col: "player_load_per_minute", tokens: ["accumulated", "acceleration", "load", "min"], unit: "", digits: 2, kind: "rate" },
      { key: "duration", labelEN: "Session duration", labelIS: "Lengd æfingar", col: "session_duration_minutes", tokens: ["duration"], unit: "min", digits: 0, kind: "intensity", duration: true },
      { key: "steps", labelEN: "Steps", labelIS: "Skref", tokens: ["steps"], unit: "#", digits: 0, kind: "volume" },
    ],
  },
  {
    key: "movement", titleEN: "Movement · indoor positioning", titleIS: "Hreyfing · innistaðsetning",
    metrics: [
      { key: "distance", labelEN: "Total distance", labelIS: "Heildarvegalengd", col: "total_distance", tokens: ["distance"], excl: ["speed", "high", "metabolic", "min", "acceleration"], unit: "m", digits: 0, kind: "volume" },
      { key: "dist_min", labelEN: "Distance / min", labelIS: "Vegalengd / mín", tokens: ["distance", "min"], excl: ["speed", "metabolic", "acceleration"], unit: "m", digits: 0, kind: "rate" },
      { key: "hsr", labelEN: "High-speed distance", labelIS: "Háhraðavegalengd", col: "high_speed_distance", tokens: ["distance", "speed", "high"], excl: ["very", "min"], unit: "m", digits: 0, kind: "volume" },
      { key: "sprint", labelEN: "Sprint distance", labelIS: "Sprettvegalengd", col: "sprint_distance", tokens: ["distance", "speed", "extreme"], excl: ["min"], unit: "m", digits: 0, kind: "volume" },
      { key: "max_speed", labelEN: "Max speed", labelIS: "Hámarkshraði", col: "max_velocity", tokens: ["speed", "max"], excl: ["%", "of", "distance", "acceleration", "load", "min"], unit: "km/h", digits: 1, kind: "intensity" },
      { key: "avg_speed", labelEN: "Avg speed", labelIS: "Meðalhraði", tokens: ["speed"], excl: ["max", "min", "%", "of", "distance", "acceleration", "load", "high"], unit: "km/h", digits: 1, kind: "intensity" },
    ],
  },
  {
    key: "accel_load", titleEN: "Acceleration load", titleIS: "Hröðunarálag",
    metrics: [
      { key: "accel_load_avg", labelEN: "Acceleration Load (Ø)", labelIS: "Hröðunarálag (Ø)", tokens: ["acceleration", "load"], excl: ["accumulated", "distance", "load | ", "max", "time", "min", "123", "testneu"], unit: "", digits: 2, kind: "intensity" },
      { key: "accel_load_max", labelEN: "Acceleration Load (max)", labelIS: "Hröðunarálag (hám)", tokens: ["acceleration", "load", "max"], unit: "", digits: 2, kind: "intensity" },
      { key: "accels_load", labelEN: "Accels Load", labelIS: "Hröðunarálag (uppsafn.)", tokens: ["accels", "load"], excl: ["min"], unit: "", digits: 0, kind: "volume" },
      { key: "decels_load", labelEN: "Decels Load", labelIS: "Hægingarálag (uppsafn.)", tokens: ["decels", "load"], excl: ["min"], unit: "", digits: 0, kind: "volume" },
    ],
  },
  {
    key: "accel_decel", titleEN: "Accel / decel", titleIS: "Hröðun / hæging",
    metrics: [
      { key: "accels", labelEN: "Accelerations", labelIS: "Hröðun", col: "accelerations", tokens: ["accel"], excl: ["load", "min", "decel"], unit: "#", digits: 0, kind: "volume" },
      { key: "decels", labelEN: "Decelerations", labelIS: "Hægingar", col: "decelerations", tokens: ["decel"], excl: ["load", "min"], unit: "#", digits: 0, kind: "volume" },
      { key: "accel_hi", labelEN: "High-effort accel (B2-3)", labelIS: "Kröftug hröðun (B2-3)", col: "accel_b2_3_tot_effs_gen2", tokens: ["accel", "3"], excl: ["min", "load"], unit: "#", digits: 0, kind: "volume" },
      { key: "decel_hi", labelEN: "High-effort decel (B2-3)", labelIS: "Kröftug hæging (B2-3)", col: "decel_b2_3_tot_effs_gen2", tokens: ["decel", "3"], excl: ["min", "load"], unit: "#", digits: 0, kind: "volume" },
    ],
  },
  {
    key: "metabolic", titleEN: "Metabolic", titleIS: "Efnaskipti",
    metrics: [
      { key: "metab_power", labelEN: "Metabolic power (Ø)", labelIS: "Efnaskiptaafl (Ø)", col: "metabolic_power", tokens: ["metabolic", "power", "w"], excl: ["max", "distance", "time", "min", "mass"], unit: "W", digits: 0, kind: "intensity" },
      { key: "metab_power_max", labelEN: "Metabolic power (max)", labelIS: "Efnaskiptaafl (hám)", col: "metabolic_power_peak", tokens: ["metabolic", "power", "max"], excl: ["mass"], unit: "W", digits: 0, kind: "intensity" },
      { key: "metab_work", labelEN: "Metabolic work", labelIS: "Efnaskiptavinna", tokens: ["metabolic", "work"], excl: ["min"], unit: "kcal", digits: 0, kind: "volume" },
      { key: "hmpd", labelEN: "High-metabolic-power dist", labelIS: "Hátt efnaskiptaafl (vegal.)", col: "high_metabolic_load_distance_m", tokens: ["high", "metabolic", "power", "distance"], excl: ["min"], unit: "m", digits: 0, kind: "volume" },
      { key: "anaerobic", labelEN: "Anaerobic activity dist", labelIS: "Loftfirrð virkni (vegal.)", tokens: ["anaerobic", "activity", "distance"], unit: "m", digits: 0, kind: "volume" },
      { key: "physio_load", labelEN: "Physio load", labelIS: "Lífeðlisálag", tokens: ["physio", "load"], unit: "", digits: 0, kind: "volume" },
    ],
  },
  {
    key: "mechanical", titleEN: "Mechanical", titleIS: "Vélrænt álag",
    metrics: [
      { key: "mech_load", labelEN: "Mechanical load", labelIS: "Vélrænt álag", tokens: ["mechanical", "load"], excl: ["def", "off", "jump"], unit: "", digits: 0, kind: "volume" },
      { key: "mech_intensity", labelEN: "Mechanical intensity", labelIS: "Vélræn ákefð", tokens: ["mechanical", "intensity"], excl: ["def", "off"], unit: "", digits: 1, kind: "intensity" },
      { key: "jump_load", labelEN: "Jump load", labelIS: "Stökkálag", tokens: ["jump", "load"], excl: ["min", "mass", "per"], unit: "J", digits: 0, kind: "volume" },
    ],
  },
  {
    key: "cod", titleEN: "Change of direction & agility", titleIS: "Stefnubreytingar",
    metrics: [
      { key: "cod", labelEN: "Changes of direction", labelIS: "Stefnubreytingar", col: "ima_cod", tokens: ["changes", "direction"], excl: ["left", "right", "min"], unit: "#", digits: 0, kind: "volume" },
      { key: "coo", labelEN: "Changes of orientation", labelIS: "Stefnusnúningar", tokens: ["changes", "orientation"], excl: ["min"], unit: "#", digits: 0, kind: "volume" },
      { key: "exertions", labelEN: "Exertions", labelIS: "Átök", tokens: ["exertions"], excl: ["min", "low", "medium", "high"], unit: "#", digits: 0, kind: "volume" },
      { key: "exertions_hi", labelEN: "Exertions (high)", labelIS: "Átök (há)", tokens: ["exertions", "high"], excl: ["min", "very"], unit: "#", digits: 0, kind: "volume" },
      { key: "fcts", labelEN: "FCTs", labelIS: "FCTs", tokens: ["fcts"], excl: ["min", "high", "low", "medium"], unit: "#", digits: 0, kind: "volume" },
      { key: "mcts", labelEN: "MCTs", labelIS: "MCTs", tokens: ["mcts"], excl: ["min", "high", "low", "medium"], unit: "#", digits: 0, kind: "volume" },
    ],
  },
  {
    key: "jumps", titleEN: "Jumps", titleIS: "Stökk",
    metrics: [
      { key: "jumps", labelEN: "Jumps", labelIS: "Stökk", col: "jumps", tokens: ["jumps"], excl: ["min", "load", "low", "medium", "high"], unit: "#", digits: 0, kind: "volume" },
      { key: "jump_height", labelEN: "Jump height (max)", labelIS: "Stökkhæð (hám)", tokens: ["jump", "height", "max"], excl: ["ratio"], unit: "m", digits: 2, kind: "intensity" },
    ],
  },
  {
    key: "hr", titleEN: "Heart rate", titleIS: "Hjartsláttur",
    metrics: [
      { key: "hr_avg", labelEN: "Average HR", labelIS: "Meðal hjartsláttur", col: "avg_heart_rate", tokens: ["heart", "rate"], excl: ["max", "min", "time", "%", "recover", "trimp"], unit: "bpm", digits: 0, kind: "intensity" },
      { key: "hr_max", labelEN: "Max HR", labelIS: "Hámarks hjartsláttur", col: "max_heart_rate", tokens: ["heart", "rate", "max"], unit: "bpm", digits: 0, kind: "intensity" },
      { key: "trimp", labelEN: "TRIMP", labelIS: "TRIMP", tokens: ["trimp"], unit: "", digits: 0, kind: "volume" },
    ],
  },
];

/** Pull a metric's numeric value from one row: typed column first, else the
 *  matching Kinexon header out of raw_payload_json. Returns null when absent
 *  (never 0 — a missing cell must not corrupt a baseline). */
export function readKinexonMetric(row: Record<string, unknown>, m: KinexonMetric): number | null {
  if (m.col) {
    const v = row[m.col];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  const raw = row.raw_payload_json;
  if (raw && typeof raw === "object") {
    for (const [header, value] of Object.entries(raw as Record<string, unknown>)) {
      const n = normHeader(header);
      if (!n) continue;
      if (!m.tokens.every((t) => n.includes(t))) continue;
      if (m.excl && m.excl.some((t) => n.includes(t))) continue;
      const parsed = m.duration
        ? parseDurationToMinutes(value as string)
        : parseKinexonNumber(value as string | number | null);
      if (parsed != null) return parsed;
    }
  }
  return null;
}
