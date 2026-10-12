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

import { computeDsi, type DsiResult } from "@/lib/lvProfile";
import type { Bi } from "@/lib/micropulse/load/peakPeriod";

export interface DsiCoverageInput {
  cmjPeakForceN: number | null; // ballistic term — CMJ trial-mean peak force
  imtpPeakForceN: number | null; // isometric term — IMTP trial-mean peak force
  cmjTrialCount?: number | null;
  imtpTrialCount?: number | null;
}

export type DsiCoverage = "full" | "cmj_only" | "imtp_only" | "none";

export interface DsiRead {
  dsi: DsiResult | null; // computeDsi output, or null when a term is missing
  coverage: DsiCoverage;
  confidence: "high" | "moderate" | "low";
  reason: Bi; // provenance / why insufficient
}

const finite = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;

/** Derive the DSI read for one player. Pure + deterministic. */
export function deriveDsiForPlayer(inp: DsiCoverageInput): DsiRead {
  const hasCmj = finite(inp.cmjPeakForceN);
  const hasImtp = finite(inp.imtpPeakForceN);

  if (hasCmj && hasImtp) {
    const dsi = computeDsi(inp.cmjPeakForceN as number, inp.imtpPeakForceN as number);
    // Trial-count confidence mirrors the ≥3-valid-trials discipline used elsewhere (post-match CMJ baselines).
    const bothSolid = (inp.cmjTrialCount ?? 0) >= 3 && (inp.imtpTrialCount ?? 0) >= 3;
    return {
      dsi,
      coverage: "full",
      confidence: bothSolid ? "high" : "moderate",
      reason: {
        en: `DSI from CMJ peak force ÷ IMTP peak force (trial-means).${bothSolid ? "" : " Based on a short trial count — treat as provisional."}`,
        is: `DSI úr CMJ hámarkskrafti ÷ IMTP hámarkskrafti (tilrauna-meðaltöl).${bothSolid ? "" : " Byggt á fáum tilraunum — líttu á sem bráðabirgða."}`,
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

  return { dsi: null, coverage, confidence: "low", reason };
}
