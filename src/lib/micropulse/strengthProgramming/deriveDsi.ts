/**
 * Auto-DSI — derive a player's Dynamic Strength Index from the VALD force-plate numbers the
 * system already stores, instead of the manual LV-Profile entry.
 *
 * DSI = ballistic peak force (CMJ) ÷ isometric peak force (IMTP). It answers the force-vs-power
 * question that drives the INDIVIDUALIZED strength emphasis (block direction):
 *   >0.8  → raise the max-strength ceiling   (already expresses force ballistically)
 *   0.6-0.8 → concurrent (alternate strength + ballistic)
 *   <0.6  → bias ballistic / RFD             (strong, but can't express it fast)
 *
 * Pure + side-effect free: it takes the two trial-mean peak forces (loaded by the caller via
 * `buildRtpAssessment` / `loadDsiForTeam`) and reuses the existing `computeDsi` maths unchanged.
 * Coverage matters: most squads lack IMTP for everyone, so when a term is missing this returns a
 * null DSI with a reason and the caller falls back to the strength/power percentiles.
 *
 * Descriptive / advisory — never reads or writes the readiness colour or the daily decision.
 */

import { computeDsi, type DsiResult, type DsiTier } from "@/lib/lvProfile";
import type { Bi } from "@/lib/micropulse/load/peakPeriod";

export interface DsiCoverageInput {
  cmjPeakForceN: number | null; // ballistic term — CMJ trial-mean peak force
  imtpPeakForceN: number | null; // isometric term — IMTP trial-mean peak force
  cmjTrialCount?: number | null;
  imtpTrialCount?: number | null;
}

export type DsiCoverage = "full" | "cmj_only" | "imtp_only" | "none";

export interface DsiRead {
  dsi: DsiResult | null; // computeDsi output (tier re-based to the squad when thresholds are given)
  coverage: DsiCoverage;
  confidence: "high" | "moderate" | "low";
  basis: "squad" | "absolute"; // how the tier was classified
  reason: Bi; // provenance / why insufficient
}

/**
 * Team-relative DSI thresholds (lower/upper tertiles of the squad's ratios). The stored CMJ
 * `peak_force_n` is a gross peak that sits above the textbook 0.6–0.8 DSI band, so an ABSOLUTE
 * cut would class the whole squad "max-strength". Classifying each player against the squad's own
 * distribution cancels that systematic offset and answers the actually-useful question: who needs
 * more max-strength vs more ballistic RELATIVE to his teammates.
 */
export interface SquadDsiThresholds { lower: number; upper: number; n: number }

/** Lower/upper tertile of the squad's valid DSI ratios; null when too few to calibrate (<4). */
export function squadDsiThresholds(ratios: number[]): SquadDsiThresholds | null {
  const vals = ratios.filter((r) => Number.isFinite(r) && r > 0).sort((a, b) => a - b);
  if (vals.length < 4) return null; // too few → caller keeps the absolute textbook tiers
  const q = (p: number) => {
    const i = (vals.length - 1) * p;
    const lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? vals[lo] : vals[lo] + (vals[hi] - vals[lo]) * (i - lo);
  };
  return { lower: q(1 / 3), upper: q(2 / 3), n: vals.length };
}

/** Re-tier a ratio against the squad distribution (low DSI → ballistic bias, high → max-strength). */
export function classifyDsiTierVsSquad(ratio: number, thr: SquadDsiThresholds): { tier: DsiTier; recommendation: string } {
  if (ratio < thr.lower) return { tier: "ballistic", recommendation: `DSI in the lower third for this squad (${thr.n} tested) — strength reserve high relative to ballistic output; bias power / fast force.` };
  if (ratio > thr.upper) return { tier: "max_strength", recommendation: `DSI in the upper third for this squad (${thr.n} tested) — already expresses force fast; raising the max-strength ceiling is the next gain.` };
  return { tier: "concurrent", recommendation: `Mid-squad DSI (${thr.n} tested) — concurrent strength + ballistic.` };
}

const finite = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;

/** Derive the DSI read for one player. Pure + deterministic. `squadThr` re-bases the tier to the
 *  squad distribution (recommended); absent → the absolute textbook tiers from `computeDsi`. */
export function deriveDsiForPlayer(inp: DsiCoverageInput, squadThr?: SquadDsiThresholds | null): DsiRead {
  const hasCmj = finite(inp.cmjPeakForceN);
  const hasImtp = finite(inp.imtpPeakForceN);

  if (hasCmj && hasImtp) {
    const abs = computeDsi(inp.cmjPeakForceN as number, inp.imtpPeakForceN as number);
    // Re-base the tier to the squad when we have a calibration; keep the raw ratio.
    const dsi: DsiResult | null = abs && squadThr ? { ...abs, ...classifyDsiTierVsSquad(abs.ratio, squadThr) } : abs;
    const basis: DsiRead["basis"] = abs && squadThr ? "squad" : "absolute";
    // Trial-count confidence mirrors the ≥3-valid-trials discipline used elsewhere (post-match CMJ baselines).
    const bothSolid = (inp.cmjTrialCount ?? 0) >= 3 && (inp.imtpTrialCount ?? 0) >= 3;
    return {
      dsi,
      coverage: "full",
      confidence: bothSolid ? "high" : "moderate",
      basis,
      reason: {
        en: `${basis === "squad" ? "Team-relative" : "Absolute"} DSI from CMJ peak force ÷ IMTP peak force (trial-means).${bothSolid ? "" : " Based on a short trial count — treat as provisional."}`,
        is: `${basis === "squad" ? "Liðs-afstætt" : "Algilt"} DSI úr CMJ hámarkskrafti ÷ IMTP hámarkskrafti (tilrauna-meðaltöl).${bothSolid ? "" : " Byggt á fáum tilraunum — líttu á sem bráðabirgða."}`,
      },
    };
  }

  const coverage: DsiCoverage = hasCmj ? "cmj_only" : hasImtp ? "imtp_only" : "none";
  const reason: Bi =
    coverage === "cmj_only"
      ? { en: "IMTP peak force not on record — DSI insufficient; using strength/power percentiles.", is: "IMTP hámarkskraftur ekki skráður — DSI ófullnægjandi; nota styrk-/afl-percentíl." }
      : coverage === "imtp_only"
        ? { en: "CMJ peak force not on record — DSI insufficient; using strength/power percentiles.", is: "CMJ hámarkskraftur ekki skráður — DSI ófullnægjandi; nota styrk-/afl-percentíl." }
        : { en: "No valid CMJ or IMTP force-plate test on record — DSI unavailable.", is: "Engin gild CMJ- eða IMTP-kraftplötumæling skráð — DSI ekki tiltækt." };

  return { dsi: null, coverage, confidence: "low", basis: "absolute", reason };
}
