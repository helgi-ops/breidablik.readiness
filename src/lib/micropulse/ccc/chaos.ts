/**
 * CCC per-session chaos — the control↔chaos axis the volume bands can't see.
 *
 * The CCC volume bands (bands.ts) tell you HOW MUCH running a rehab session was
 * as a % of the player's own game; they say nothing about how *reactive /
 * multidirectional / unpredictable* it was. A player in the "Moderate Chaos"
 * phase can hit every volume band with purely linear running and never actually
 * be exposed to chaos. This module measures that missing axis.
 *
 * The objective proxy is high-intensity accel + decel effort DENSITY — hard
 * accelerations + decelerations (band 2–3 efforts) per km run — expressed as a %
 * of the player's OWN near-full-match density (consistent with CCC's "% of own
 * game" philosophy). Change-of-direction is physically decelerate → change →
 * reaccelerate, so acc+dec density per km tracks the reactive / multidirectional
 * content of a session: a linear run ≈ low per-km, a reactive/agility session ≈
 * high per-km. It is a PROXY, not a guarantee: the physio confirms or overrides
 * each session's level, and may tag a level by clinical judgment for a no-GPS
 * session. (The dedicated `ima_cod` field is not populated in daily GPS feeds; the
 * accel/decel effort counts and distance are, which is why the proxy uses them.)
 *
 * Pure / IO-free / serialisable. Descriptive decision-support — never a diagnosis,
 * never the readiness colour.
 *
 * Refs: Taberner, Allen & Cohen 2019 (BJSM) + Taberner et al. 2025 (JOSPT) for the
 * control-chaos construct; accel/decel effort density as a reactive-content proxy
 * is our own operationalisation.
 */

import type { Bi } from "@/lib/micropulse/periodization";
import { CCC_PHASE_BY_KEY, type CccPhaseKey } from "./continuum";
import type { VcLevel } from "./visualCognitive";

/** A session's chaos level is one of the 5 continuum phases (each carries `chaos` 0–4). */
export type CccChaosLevel = CccPhaseKey;

/** % of own-game CoD density → chaos level. Our own conservative, escalating cuts
 *  (mirroring the volume bands); the exact cuts matter less because the physio
 *  confirms each tag. Each entry: `[level, lowFraction]`, ordered ascending. */
const CHAOS_BANDS: Array<{ level: CccChaosLevel; low: number }> = [
  { level: "high_control", low: 0 },
  { level: "moderate_control", low: 0.15 },
  { level: "moderate_chaos", low: 0.35 },
  { level: "high_chaos", low: 0.65 },
  { level: "team_training", low: 1.0 },
];

/** The band table as `[level, lowPct, highPct|null]` for display/provenance. */
export const CHAOS_INDEX_BANDS: Array<{ level: CccChaosLevel; low: number; high: number | null }> =
  CHAOS_BANDS.map((b, i) => ({ level: b.level, low: b.low, high: i < CHAOS_BANDS.length - 1 ? CHAOS_BANDS[i + 1].low : null }));

/** Map a chaos index (fraction of own-game CoD density) to a continuum level.
 *  null index (no GPS / no baseline) → null (physio tags manually). */
export function chaosLevelFromIndex(pct: number | null): CccChaosLevel | null {
  if (pct == null || !Number.isFinite(pct) || pct < 0) return null;
  let level: CccChaosLevel = CHAOS_BANDS[0].level;
  for (const b of CHAOS_BANDS) if (pct >= b.low) level = b.level;
  return level;
}

/** One rehab session's chaos read. GPS fields are null for a manual no-GPS tag. */
export type ChaosSession = {
  date: string;
  source: string | null;
  distanceM: number | null;
  /** High-intensity accel + decel efforts (band 2–3) in the session. */
  effortsHi: number | null;
  /** Those efforts per km run — the directional/reactive density. */
  effortsPerKm: number | null;
  /** Density as a fraction of own-game density (1.0 = full-game reactive demand). */
  chaosIndexPct: number | null;
  /** Auto-suggested from the proxy (null when no index). */
  suggestedLevel: CccChaosLevel | null;
  /** Physio-confirmed / overridden physical-chaos level (null until tagged). */
  confirmedLevel: CccChaosLevel | null;
  /** Physio-classified visual-cognitive decision-load level (no sensor proxy). */
  cognitiveLevel: VcLevel | null;
  note: string | null;
};

/** The level actually used for exposure — the physio's confirmation wins over the proxy. */
export function effectiveChaosLevel(s: ChaosSession): CccChaosLevel | null {
  return s.confirmedLevel ?? s.suggestedLevel;
}

const chaosOrder = (level: CccChaosLevel): number => CCC_PHASE_BY_KEY[level]?.chaos ?? 0;

export type ChaosExposure = {
  counts: Record<CccChaosLevel, number>;
  /** ≥1 recent session whose effective chaos order reaches the current phase's. */
  exposureMet: boolean;
  /** Sessions whose effective level could be resolved (proxy or confirmed). */
  evaluated: number;
  summary: Bi;
};

const LEVEL_NAME = (level: CccChaosLevel, is: boolean): string => {
  const n = CCC_PHASE_BY_KEY[level]?.name;
  return (is ? n?.is : n?.en) ?? level;
};

/**
 * Over the recent window: has the player actually been exposed to this phase's
 * chaos, or only lower-chaos (more linear) sessions? `exposureMet` is the gap
 * read — e.g. "in Moderate Chaos but no chaos exposure yet". Descriptive — a
 * prompt beside the criteria gate, never a progression blocker.
 */
export function summarizeChaosExposure(sessions: ChaosSession[], phaseKey: CccPhaseKey): ChaosExposure {
  const counts = { high_control: 0, moderate_control: 0, moderate_chaos: 0, high_chaos: 0, team_training: 0 } as Record<CccChaosLevel, number>;
  let evaluated = 0;
  const phaseOrder = chaosOrder(phaseKey);
  let exposureMet = false;
  for (const s of sessions) {
    const lvl = effectiveChaosLevel(s);
    if (!lvl) continue;
    counts[lvl] += 1;
    evaluated += 1;
    if (chaosOrder(lvl) >= phaseOrder) exposureMet = true;
  }
  // The final phase has the highest chaos; reaching its own order is the bar.
  const phaseNameEn = LEVEL_NAME(phaseKey, false);
  const phaseNameIs = LEVEL_NAME(phaseKey, true);
  let summary: Bi;
  if (evaluated === 0) {
    summary = {
      en: `No tagged sessions yet — tag recent sessions to track chaos exposure for ${phaseNameEn}.`,
      is: `Engar merktar lotur enn — merktu nýlegar lotur til að fylgja kaos-álagi fyrir ${phaseNameIs}.`,
    };
  } else if (phaseOrder === 0) {
    summary = {
      en: `${evaluated} recent session${evaluated === 1 ? "" : "s"} tagged — High Control needs only planned, linear running.`,
      is: `${evaluated} nýleg${evaluated === 1 ? " lota" : "ar lotur"} merkt${evaluated === 1 ? "" : "ar"} — Mikil stjórn þarf aðeins skipulagt, línulegt hlaup.`,
    };
  } else if (exposureMet) {
    summary = {
      en: `Chaos exposure met for ${phaseNameEn} — ≥1 recent session reached this phase's reactive demand.`,
      is: `Kaos-álag náð fyrir ${phaseNameIs} — ≥1 nýleg lota náði viðbragðs-kröfu þessa fasa.`,
    };
  } else {
    summary = {
      en: `No chaos exposure yet for ${phaseNameEn} — recent sessions have been more linear than the phase demands.`,
      is: `Ekkert kaos-álag enn fyrir ${phaseNameIs} — nýlegar lotur hafa verið línulegri en fasinn krefst.`,
    };
  }
  return { counts, exposureMet, evaluated, summary };
}
