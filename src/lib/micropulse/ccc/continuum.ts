/**
 * Control-Chaos Continuum (CCC) — a criteria-based, GPS-load-driven return-to-
 * running continuum (Taberner, Allen & Cohen, BJSM 2019; Taberner et al., JOSPT
 * 2025). An injured footballer progresses High Control → Moderate Control →
 * Moderate Chaos → High Chaos → Team training, driving running load expressed as
 * a % of the player's OWN game load, with force-plate / symmetry EXIT CRITERIA
 * (not calendar days) gating each step, tailored per injury.
 *
 * This module is the pure continuum definition — the 5 phases, their per-variable
 * target bands (% of game load), evaluable exit criteria, and a per-injury
 * considerations map. It carries no DB and no player data. Phase STATE is
 * persisted via rehab_track_progress / rehab_phase_events (reused), the player's
 * band read is computed in ./bands.ts.
 *
 * Boundary: rehab-support / training decision-support only — descriptive, never a
 * diagnosis, never the readiness colour. The clinician/physio gates every advance
 * with a logged reason; nothing auto-advances. Implements the papers' METHOD; the
 * figures / Table 1 are NOT reproduced verbatim — bands are our own conservative
 * values, criteria thresholds cite the standard return-to-play literature.
 */

import type { Bi } from "@/lib/micropulse/periodization";
import type { QualityKey } from "@/lib/micropulse/returnToTraining";

export const CCC_TRACK_KEY = "ccc";

export type CccPhaseKey =
  | "high_control"
  | "moderate_control"
  | "moderate_chaos"
  | "high_chaos"
  | "team_training";

/** The GPS variables CCC bands, each mapped to its match-unit axis (the 100%
 *  game-load reference) and the return-to-training QualityKey (recent actual). */
export type CccVariable = "distance" | "hsr" | "sprint" | "accel" | "decel";

/** The match-unit metric axes CCC reads (a subset of MatchUnit's metric fields). */
export type CccMatchAxis = "distance" | "hsr" | "sprint" | "accHiEff" | "decHiEff";

export const CCC_VARIABLES: Record<CccVariable, { label: Bi; matchAxis: CccMatchAxis; quality: QualityKey }> = {
  distance: { label: { en: "Total distance", is: "Heildarvegalengd" }, matchAxis: "distance", quality: "distance" },
  hsr: { label: { en: "High-speed running (>5.5 m/s)", is: "Háhraðahlaup (>5.5 m/s)" }, matchAxis: "hsr", quality: "hsr" },
  sprint: { label: { en: "Sprint distance (>7 m/s)", is: "Sprettvegalengd (>7 m/s)" }, matchAxis: "sprint", quality: "sprint" },
  accel: { label: { en: "High accelerations", is: "Hröðun (háar)" }, matchAxis: "accHiEff", quality: "accel" },
  decel: { label: { en: "High decelerations (braking)", is: "Hemlun (háar)" }, matchAxis: "decHiEff", quality: "decel" },
};

/** A band expressed as a fraction of the player's own typical game load
 *  (1.0 = a full game). `null` high = open-ended (full exposure). */
export type CccBand = { low: number; high: number | null };

/** An evaluable exit criterion — a machine-checkable gate on a force-plate /
 *  symmetry metric. `compare` is read as "value {<=|>=} threshold passes". */
export type CccCriterionKey = "cmj_asymmetry_pct" | "imtp_lsi_pct" | "hop_rsi_lsi_pct" | "nordic_asymmetry_pct" | "load_tolerance";
export type CccExitCriterion = {
  key: CccCriterionKey;
  label: Bi;
  threshold: number;
  compare: "lte" | "gte";
  source: string;
};

export type CccPhase = {
  key: CccPhaseKey;
  order: number;
  /** 0 (full control) … 4 (team training) — position on the control↔chaos axis. */
  chaos: number;
  name: Bi;
  focus: Bi;
  /** Target running-load bands as a fraction of the player's own game load. A
   *  variable absent from the map is NOT introduced in this phase. */
  bands: Partial<Record<CccVariable, CccBand>>;
  /** Criteria to CLEAR before advancing to the next phase (clinician-gated). */
  exitCriteria: CccExitCriterion[];
  citation: string;
};

const TABERNER = "Taberner, Allen & Cohen 2019 (BJSM); Taberner et al. 2025 (JOSPT, Part 2)";

// Standard return-to-play criterion thresholds (cited; conservative). Bishop 2020
// flags inter-limb asymmetry ≥10% as performance/injury-relevant; Grindem 2016 uses
// LSI ≥90% as the symmetry gate; Aspetar/Kotsifaki CPG for the late gates.
const C_LOAD: CccExitCriterion = { key: "load_tolerance", label: { en: "Tolerated this phase's load band pain-free", is: "Þolir álagsband þessa fasa án verkja" }, threshold: 1, compare: "gte", source: TABERNER };
const C_ASYM_15: CccExitCriterion = { key: "cmj_asymmetry_pct", label: { en: "CMJ force/impulse asymmetry < 15%", is: "CMJ krafts-/impuls-ósamhverfa < 15%" }, threshold: 15, compare: "lte", source: "Bishop 2020" };
const C_ASYM_10: CccExitCriterion = { key: "cmj_asymmetry_pct", label: { en: "CMJ force/impulse asymmetry < 10%", is: "CMJ krafts-/impuls-ósamhverfa < 10%" }, threshold: 10, compare: "lte", source: "Bishop 2020" };
const C_IMTP_80: CccExitCriterion = { key: "imtp_lsi_pct", label: { en: "IMTP limb-symmetry ≥ 80%", is: "IMTP útlima-samhverfa ≥ 80%" }, threshold: 80, compare: "gte", source: "Aspetar RTP; Kotsifaki 2023" };
const C_IMTP_90: CccExitCriterion = { key: "imtp_lsi_pct", label: { en: "IMTP limb-symmetry ≥ 90%", is: "IMTP útlima-samhverfa ≥ 90%" }, threshold: 90, compare: "gte", source: "Grindem 2016; Aspetar RTP" };
const C_RSI_90: CccExitCriterion = { key: "hop_rsi_lsi_pct", label: { en: "Reactive-strength (hop/RSI) limb-symmetry ≥ 90%", is: "Viðbragðsstyrkur (hopp/RSI) útlima-samhverfa ≥ 90%" }, threshold: 90, compare: "gte", source: "Grindem 2016" };
const C_NORDIC_15: CccExitCriterion = { key: "nordic_asymmetry_pct", label: { en: "Nordic eccentric asymmetry < 15%", is: "Nordic eccentrísk ósamhverfa < 15%" }, threshold: 15, compare: "lte", source: "van Dyk 2019; Bishop 2020" };

/** The 5 CCC phases. Bands are fractions of the player's own game load — they rise
 *  from low-volume linear running (High Control) to full, chaotic match exposure
 *  (High Chaos → Team training). Our own conservative values (not the papers' Table 1). */
export const CCC_PHASES: CccPhase[] = [
  {
    key: "high_control", order: 0, chaos: 0,
    name: { en: "High Control", is: "Mikil stjórn" },
    focus: { en: "Planned, linear, low-volume running — rebuild tissue load tolerance.", is: "Skipulagt, línulegt, lítið rúmmál — endurbyggja álagsþol vefs." },
    bands: { distance: { low: 0.3, high: 0.5 }, hsr: { low: 0, high: 0.1 }, accel: { low: 0.2, high: 0.4 }, decel: { low: 0.2, high: 0.4 } },
    exitCriteria: [C_LOAD, C_ASYM_15],
    citation: TABERNER,
  },
  {
    key: "moderate_control", order: 1, chaos: 1,
    name: { en: "Moderate Control", is: "Hófleg stjórn" },
    focus: { en: "Add volume + early high-speed running, still planned and linear.", is: "Bæta við rúmmáli + fyrstu háhraðahlaup, enn skipulagt og línulegt." },
    bands: { distance: { low: 0.5, high: 0.75 }, hsr: { low: 0.1, high: 0.3 }, sprint: { low: 0, high: 0.15 }, accel: { low: 0.4, high: 0.6 }, decel: { low: 0.4, high: 0.6 } },
    exitCriteria: [C_LOAD, C_ASYM_15, C_IMTP_80],
    citation: TABERNER,
  },
  {
    key: "moderate_chaos", order: 2, chaos: 2,
    name: { en: "Moderate Chaos", is: "Hóflegt kaos" },
    focus: { en: "Introduce reactive, multidirectional running + near-game volumes and speed.", is: "Kynna viðbragðs-, fjölstefnuhlaup + rúmmál og hraða nálægt leik." },
    bands: { distance: { low: 0.75, high: 1.0 }, hsr: { low: 0.3, high: 0.6 }, sprint: { low: 0.15, high: 0.4 }, accel: { low: 0.6, high: 0.85 }, decel: { low: 0.6, high: 0.85 } },
    exitCriteria: [C_LOAD, C_ASYM_10, C_IMTP_90, C_RSI_90],
    citation: TABERNER,
  },
  {
    key: "high_chaos", order: 3, chaos: 3,
    name: { en: "High Chaos", is: "Mikið kaos" },
    focus: { en: "Unpredictable, game-speed, decision-based running at or above game load.", is: "Ófyrirsjáanlegt hlaup á leikhraða með ákvörðunum, á eða yfir leikálagi." },
    bands: { distance: { low: 1.0, high: 1.3 }, hsr: { low: 0.6, high: 1.0 }, sprint: { low: 0.4, high: 0.8 }, accel: { low: 0.85, high: 1.1 }, decel: { low: 0.85, high: 1.1 } },
    exitCriteria: [C_LOAD, C_ASYM_10, C_IMTP_90, C_RSI_90, C_NORDIC_15],
    citation: TABERNER,
  },
  {
    key: "team_training", order: 4, chaos: 4,
    name: { en: "Team training", is: "Liðsæfing" },
    focus: { en: "Full, integrated team training at ≥ game exposure — the bridge to selection.", is: "Full, samþætt liðsæfing á ≥ leikálagi — brú að vali." },
    bands: { distance: { low: 1.0, high: null }, hsr: { low: 1.0, high: null }, sprint: { low: 0.8, high: null }, accel: { low: 1.0, high: null }, decel: { low: 1.0, high: null } },
    exitCriteria: [],
    citation: TABERNER,
  },
];

export const CCC_PHASE_BY_KEY: Record<CccPhaseKey, CccPhase> = Object.fromEntries(CCC_PHASES.map((p) => [p.key, p])) as Record<CccPhaseKey, CccPhase>;
export const isCccPhaseKey = (k: string): k is CccPhaseKey => k in CCC_PHASE_BY_KEY;

/** Per-injury considerations (Taberner et al. Table 1 METHOD — which variables to
 *  progress and in what order per injury; thresholds/bands come from the phases).
 *  Keyed off `injuryRiskProfile(...).category` so it aligns with the existing ramp. */
export type CccInjuryConsideration = { primary: CccVariable[]; note: Bi };

const CCC_INJURY: Record<string, CccInjuryConsideration> = {
  hamstring: { primary: ["hsr", "sprint", "decel"], note: { en: "Progress high-speed & sprint running toward >70% max speed; add hard braking late. Sprint is the key re-injury exposure — hold it back until symmetry gates clear.", is: "Auka háhraða- og sprettahlaup að >70% hámarkshraða; bæta harðri hemlun við seint. Sprettur er lykil-endurmeiðslaálag — haltu honum aftur þar til samhverfa næst." } },
  calf: { primary: ["distance", "hsr", "sprint"], note: { en: "Build running volumes first, then progress speed; calf/Achilles tolerate volume before high speed.", is: "Byggðu hlaupa-rúmmál fyrst, síðan hraða; kálfi/hásin þola rúmmál á undan háhraða." } },
  quad: { primary: ["sprint", "accel"], note: { en: "Sprinting & acceleration are the key exposures — ramp them slowly.", is: "Sprettir og hröðun eru lykilálagið — auka þau hægt." } },
  groin: { primary: ["accel", "decel", "sprint"], note: { en: "Progress accel/decel and change-of-direction with technical actions; add sprint as symmetry clears.", is: "Auka hröðun/hemlun og stefnubreytingar með tæknilegum aðgerðum; bæta spretti við eftir því sem samhverfa næst." } },
  knee: { primary: ["distance", "hsr", "decel"], note: { en: "Build volume first; add chaos (high-speed + change-of-direction + braking) last — knee re-injury loads them most.", is: "Byggðu rúmmál fyrst; bættu kaosi (háhraði + stefnubreytingar + hemlun) við síðast — hné-endurmeiðsli álagja þau mest." } },
  ankle: { primary: ["distance", "decel", "hsr"], note: { en: "Progress volumes then reactive braking & change-of-direction; ankle tolerates linear load before chaos.", is: "Auka rúmmál, síðan viðbragðs-hemlun og stefnubreytingar; ökkli þolir línulegt álag á undan kaosi." } },
  hip: { primary: ["sprint", "accel"], note: { en: "Sprint & change-of-direction ramp slowly.", is: "Sprettir og stefnubreytingar aukast hægt." } },
  muscle: { primary: ["hsr", "sprint", "decel"], note: { en: "High-speed running & hard braking ramp slowly.", is: "Háhraðahlaup og hörð hemlun aukast hægt." } },
  general: { primary: ["hsr", "sprint"], note: { en: "Ramp the most re-injury-prone running qualities slowly.", is: "Auka þau hlaupa-gæði sem eru mest endurmeiðsla-hætt hægt." } },
};

export function cccInjuryConsideration(category: string): CccInjuryConsideration {
  return CCC_INJURY[category] ?? CCC_INJURY.general;
}
