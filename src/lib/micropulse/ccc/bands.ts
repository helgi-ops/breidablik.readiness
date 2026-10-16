/**
 * CCC band + gate read — the pure computation behind the Control-Chaos Continuum
 * card. Given the player's current phase, their own match-unit (game-load
 * baseline), their recent on-pitch load per variable, their injury category, and
 * their force-plate gate numbers, it returns:
 *   - per-variable target bands as a % of game load + the absolute target + how
 *     the player's recent sessions compare (under / on-track / over),
 *   - the phase exit-criteria evaluated against the force-plate numbers
 *     ("cleared to progress?" with the numbers).
 *
 * Quantitative bands are GATED on GPS availability — without GPS the read is
 * qualitative (phases + considerations only). Pure: no DB, no I/O. Descriptive —
 * never the readiness colour; the clinician gates every advance.
 */

import type { MatchUnit } from "@/lib/micropulse/periodization";
import {
  CCC_PHASE_BY_KEY, CCC_PHASES, CCC_VARIABLES, cccInjuryConsideration,
  type CccPhase, type CccPhaseKey, type CccVariable, type CccExitCriterion, type CccInjuryConsideration,
} from "./continuum";

export type CccLoadStatus = "under" | "on" | "over";

export type CccBandRead = {
  variable: CccVariable;
  bandPctLow: number;
  bandPctHigh: number | null;
  typicalGame: number | null;
  targetLow: number | null;
  targetHigh: number | null;
  recentActual: number | null;
  pctOfGame: number | null;
  status: CccLoadStatus | null;
};

export type CccCriterionRead = CccExitCriterion & { value: number | boolean | null; met: boolean | null };

export type CccGateRead = {
  criteria: CccCriterionRead[];
  evaluable: boolean;
  allMet: boolean;
};

export type CccGateValues = {
  cmj_asymmetry_pct?: number | null;
  imtp_lsi_pct?: number | null;
  hop_rsi_lsi_pct?: number | null;
  nordic_asymmetry_pct?: number | null;
};

export type CccReadInput = {
  phaseKey: CccPhaseKey;
  matchUnit: MatchUnit | null;
  /** The hardest recent rehab session per variable (e.g. peak of the last ~10 days). */
  recentActual: Partial<Record<CccVariable, number | null>>;
  injuryCategory: string;
  gateValues: CccGateValues;
  hasGps: boolean;
  hasForcePlate: boolean;
};

export type CccRead = {
  phase: CccPhase;
  nextPhase: CccPhase | null;
  consideration: CccInjuryConsideration;
  quantitative: boolean;
  bands: CccBandRead[];
  gate: CccGateRead;
  baselineConfidence: MatchUnit["confidence"] | null;
};

const round = (n: number, dp = 0): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

function bandStatus(actual: number, low: number, high: number | null): CccLoadStatus {
  if (actual < low) return "under";
  if (high != null && actual > high) return "over";
  return "on";
}

function evalCriterion(c: CccExitCriterion, gate: CccGateValues, loadReached: boolean | null): CccCriterionRead {
  if (c.key === "load_tolerance") {
    return { ...c, value: loadReached, met: loadReached };
  }
  const v = gate[c.key];
  if (v == null || !Number.isFinite(v)) return { ...c, value: null, met: null };
  const met = c.compare === "lte" ? v <= c.threshold : v >= c.threshold;
  return { ...c, value: round(v, 1), met };
}

/** Compute the CCC read for a player's current phase. */
export function computeCccRead(inp: CccReadInput): CccRead {
  const phase = CCC_PHASE_BY_KEY[inp.phaseKey] ?? CCC_PHASES[0];
  const nextPhase = CCC_PHASES.find((p) => p.order === phase.order + 1) ?? null;
  const consideration = cccInjuryConsideration(inp.injuryCategory);
  const quantitative = inp.hasGps && inp.matchUnit != null;

  const bands: CccBandRead[] = [];
  if (quantitative && inp.matchUnit) {
    for (const [variable, band] of Object.entries(phase.bands) as [CccVariable, { low: number; high: number | null }][]) {
      const meta = CCC_VARIABLES[variable];
      const typical = inp.matchUnit[meta.matchAxis]?.typical ?? null;
      const actual = inp.recentActual[variable] ?? null;
      const targetLow = typical != null ? round(band.low * typical) : null;
      const targetHigh = typical != null && band.high != null ? round(band.high * typical) : null;
      const pctOfGame = typical != null && typical > 0 && actual != null ? round((actual / typical) * 100) : null;
      const status = actual != null && typical != null ? bandStatus(actual, band.low * typical, band.high != null ? band.high * typical : null) : null;
      bands.push({
        variable, bandPctLow: band.low, bandPctHigh: band.high,
        typicalGame: typical != null ? round(typical) : null,
        targetLow, targetHigh, recentActual: actual != null ? round(actual) : null, pctOfGame, status,
      });
    }
  }

  // "load tolerance" = the player has actually reached this phase's floor on every
  // introduced variable (pain-free is the clinician's separate judgement). Only
  // computable with GPS; otherwise it stays a clinician checkbox (null).
  const loadReached: boolean | null = quantitative
    ? (bands.length > 0 ? bands.every((b) => b.recentActual != null && b.typicalGame != null && b.recentActual >= (b.bandPctLow * b.typicalGame)) : null)
    : null;

  const criteria = phase.exitCriteria.map((c) => {
    // Hide pure force-plate criteria as "unavailable" (met=null) when there is no VALD.
    if (c.key !== "load_tolerance" && !inp.hasForcePlate) return { ...c, value: null, met: null };
    return evalCriterion(c, inp.gateValues, loadReached);
  });
  const evaluable = criteria.some((c) => c.met != null);
  const allMet = criteria.length > 0 && criteria.every((c) => c.met === true);

  return {
    phase, nextPhase, consideration, quantitative, bands,
    gate: { criteria, evaluable, allMet },
    baselineConfidence: inp.matchUnit?.confidence ?? null,
  };
}
