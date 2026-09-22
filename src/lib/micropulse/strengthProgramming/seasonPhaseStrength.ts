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

// ───────────────────── MESO — strength scheme per block ─────────────────────
// The macro→meso→micro spine is shared with the LOAD periodization (Accumulation → Transmutation →
// Realization + deload, Issurin 2010). This is the STRENGTH lane on the SAME blocks: given a block's
// goalKey and the phase it sits in, prescribe the quality + %1RM zone + set/rep intent + citation.
// Descriptive overview — the micro engine (distributeStrengthVolume) still places the dose on MD-days,
// and the per-player emphasis biases WHICH quality each athlete leans to inside the block.

export type BlockGoalKey = "accum" | "transmute" | "realize" | "deload";

export interface BlockStrengthScheme {
  goalKey: BlockGoalKey;
  quality: Bi;      // short lane label (layer-0)
  pct1rm: Bi;       // intensity zone
  scheme: Bi;       // set × rep + intent (layer-1)
  cite: string;
}

const CITE_MESO = "Issurin 2010 (block); González-Badillo & Sánchez-Medina 2010; Suchomel 2016; Rønnestad 2011";

/**
 * Strength scheme for one meso block. Accumulation reads differently in pre-season (tissue base =
 * hypertrophy) vs an in-season re-accumulation (max-strength base) — the phase refines it. Pure.
 */
export function strengthForBlockGoal(goalKey: BlockGoalKey, phase: SeasonPhaseKey): BlockStrengthScheme {
  if (goalKey === "deload") {
    return {
      goalKey, quality: { en: "Deload", is: "Niðurtröppun" },
      pct1rm: { en: "keep intensity, cut volume ~40–50%", is: "haltu ákefð, skerðu magn ~40–50%" },
      scheme: { en: "1–2 crisp heavy singles/doubles, half the sets — unload, don't detrain.", is: "1–2 skörp þung stök/tvennt, helmingi færri sett — aflest, ekki afþjálfa." },
      cite: CITE_MESO,
    };
  }
  if (goalKey === "accum") {
    return phase === "preseason"
      ? {
        goalKey, quality: { en: "Hypertrophy + base", is: "Hypertrophy + grunnur" },
        pct1rm: { en: "65–80% 1RM", is: "65–80% 1RM" },
        scheme: { en: "3–4 × 8–12, moderate load, higher volume — build tissue + work capacity.", is: "3–4 × 8–12, hófleg þyngd, meira magn — byggðu vef + vinnugetu." },
        cite: CITE_MESO,
      }
      : {
        goalKey, quality: { en: "Max-strength base", is: "Hámarksstyrks-grunnur" },
        pct1rm: { en: "80–90% 1RM", is: "80–90% 1RM" },
        scheme: { en: "4–5 × 4–6, heavy — re-accumulate a strength base in the gap (a break / mini-block).", is: "4–5 × 4–6, þungt — endurhladdu styrk-grunn í svigrúmi (hlé / mini-blokk)." },
        cite: CITE_MESO,
      };
  }
  if (goalKey === "transmute") {
    return {
      goalKey, quality: { en: "Strength–power", is: "Styrkur–kraftur" },
      pct1rm: { en: "70–85% 1RM", is: "70–85% 1RM" },
      scheme: phase === "preseason"
        ? { en: "3–5 × 3–5, explosive concentric, ~10–20% velocity-loss cap — convert strength to football power.", is: "3–5 × 3–5, sprengikraftur, ~10–20% hraðatap-þak — umbreyttu styrk í fótbolta-kraft." }
        : { en: "in-season: microdosed — 1–2 explosive quality sets, ~10–20% velocity-loss cap; express strength-power at LOW volume, don't accumulate.", is: "á tímabili: microdosed — 1–2 sprengi-gæðasett, ~10–20% hraðatap-þak; tjáðu styrk-kraft í LÁGU magni, ekki safna." },
      cite: CITE_MESO,
    };
  }
  // realize
  return {
    goalKey, quality: { en: "Power / speed-strength", is: "Kraftur / hraði-styrkur" },
    pct1rm: { en: "30–60% 1RM (ballistic / WL derivatives)", is: "30–60% 1RM (kast / lyftinga-afleiður)" },
    scheme: phase === "preseason"
      ? { en: "low volume, high output — jumps/throws + clean/pull derivatives; taper into the opener (RFD + PAP).", is: "lágt magn, há afköst — stökk/köst + clean/pull afleiður; trappa niður í fyrsta leik (RFD + PAP)." }
      : { en: "in-season: already low volume — a jumps/throws + contrast primer for freshness + peak power, taper into the fixture (RFD + PAP).", is: "á tímabili: nú þegar lágt magn — stökk/köst + kontrast inngangur fyrir ferskleika + hámarkskraft, taper í leikinn (RFD + PAP)." },
    cite: CITE_MESO,
  };
}

/** Which pre-season block a player is in, by weeks to the opener (everyone runs the sequence). */
export function preseasonBlockForWeeksOut(weeksToOpener: number | null): PreseasonEmphasis | null {
  if (weeksToOpener == null || !Number.isFinite(weeksToOpener) || weeksToOpener < 0) return null;
  if (weeksToOpener > 8) return "hypertrophy";       // far out: build tissue base
  if (weeksToOpener >= 4) return "max_strength";      // mid: raise the ceiling
  return "power";                                     // near the opener: convert + taper
}
