/**
 * Season-phase strength goal — pure config layer on top of `detectSeasonPhases`.
 *
 * The MD-microdose engine already lays out per-MD sessions; this only says what the phase's GOAL,
 * intensity zone and volume should be, so the same engine expresses hypertrophy→max→power in
 * pre-season, retention in-season, and reconditioning off-season. Advisory; never the readiness colour.
 *
 * Cite: Rønnestad 2011 (in-season maintenance); Mujika & Padilla 2000 (detraining); Cormie/Suchomel
 *       2011/2016 (build sequence); Cuthbert 2021 (volume distribution).
 */

import type { Bi } from "@/lib/micropulse/load/peakPeriod";
import type { PreseasonEmphasis } from "./preseasonEmphasis";

export type SeasonPhaseKey = "preseason" | "competitive" | "offseason";
export type StrengthGoal = "recondition_maintain" | "build_sequence" | "retain";

export interface PhaseStrengthConfig {
  phase: SeasonPhaseKey;
  goal: StrengthGoal;
  volume: "low" | "moderate" | "high" | "descending";
  intensity: Bi;   // %1RM / velocity guidance for the engine's zone
  verdict: Bi;     // one-line goal (layer-0 read)
  flags: Bi[];     // e.g. congested-week protection, break = mini-block
  cite: string;
}

const CITE = "Rønnestad 2011; Mujika & Padilla 2000; Cormie/Suchomel 2011/2016; Cuthbert 2021";

/** The strength goal + zone for a season phase. `opts` refine the in-season flags. */
export function strengthConfigForPhase(
  phase: SeasonPhaseKey,
  opts?: { onBreak?: boolean; congestedWeek?: boolean },
): PhaseStrengthConfig {
  if (phase === "offseason") {
    return {
      phase, goal: "recondition_maintain", volume: "low",
      intensity: { en: "moderate load; a short true rest first, then recondition — keep ≥1 low-volume session/wk to protect the pre-season start.", is: "hófleg þyngd; stutt raunhvíld fyrst, svo enduruppbygging — haltu ≥1 léttri æfingu/viku til að vernda upphaf undirbúnings." },
      verdict: { en: "Off-season — recover, then stop the bleed (minimum maintenance).", is: "Undirbúningshlé — jafnaðu þig, svo stöðvaðu tapið (lágmarks-viðhald)." },
      flags: [{ en: "Screen (movement / force plate) to set individual pre-season targets.", is: "Skimaðu (hreyfing / kraftplata) til að setja einstaklings-markmið fyrir undirbúning." }],
      cite: CITE,
    };
  }
  if (phase === "preseason") {
    return {
      phase, goal: "build_sequence", volume: "descending",
      intensity: { en: "rising: hypertrophy (higher volume, moderate load) → max strength (heavy, low-rep, neural) → power (ballistic, taper volume into the opener).", is: "hækkandi: hypertrophy (meira magn, hófleg þyngd) → hámarksstyrkur (þungt, fáar endurt., taugalegt) → afl (ballistískt, trappa magn niður í fyrsta leik)." },
      verdict: { en: "Pre-season — build: hypertrophy → max strength → power (per-player start below).", is: "Undirbúningur — byggðu: hypertrophy → hámarksstyrkur → afl (per-leikmanns upphaf neðar)." },
      flags: [{ en: "Injury-prevention foundation built here + kept year-round; sequence heavy strength & hard running to limit interference.", is: "Meiðslavarnar-grunnur byggður hér + haldið árið um kring; raðaðu þungum styrk og hörðu hlaupi til að draga úr truflun." }],
      cite: CITE,
    };
  }
  // competitive (in-season)
  const flags: Bi[] = [];
  if (opts?.onBreak) flags.push({ en: "Break in the fixtures → trigger a mini-block (re-load strength while there's a gap).", is: "Hlé í leikjaskrá → keyrðu mini-blokk (endurhlaðið styrk meðan það er svigrúm)." });
  if (opts?.congestedWeek) flags.push({ en: "Congested week → protect the maintenance dose: 1×/wk keeps it, 1×/2wk loses ~10% 1RM (Rønnestad).", is: "Þétt vika → verndaðu viðhaldsskammtinn: 1×/viku heldur, 1×/2vikur tapar ~10% 1RM (Rønnestad)." });
  return {
    phase, goal: "retain", volume: "low",
    intensity: { en: "HIGH intensity (neural), LOW volume, microdosed — retain & express, don't build; one quality session/wk maintains.", is: "HÁ ákefð (taugaleg), LÁGT magn, microdosed — haltu & tjáðu, ekki byggja; ein gæðaæfing/viku viðheldur." },
    verdict: { en: "In-season — maintain strength/power, manage match fatigue.", is: "Keppnistímabil — viðhaltu styrk/afli, stýrðu leikþreytu." },
    flags,
    cite: CITE,
  };
}

/** Which pre-season block a player is in, by weeks to the opener (everyone runs the sequence). */
export function preseasonBlockForWeeksOut(weeksToOpener: number | null): PreseasonEmphasis | null {
  if (weeksToOpener == null || !Number.isFinite(weeksToOpener) || weeksToOpener < 0) return null;
  if (weeksToOpener > 8) return "hypertrophy";       // far out: build tissue base
  if (weeksToOpener >= 4) return "max_strength";      // mid: raise the ceiling
  return "power";                                     // near the opener: convert + taper
}
