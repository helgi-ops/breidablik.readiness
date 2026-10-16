/**
 * Visual-Cognitive axis (VC-CCC) — the decision-load dimension the physical chaos
 * proxy can't see.
 *
 * A rehab session can be physically chaotic (high accel+decel density) yet entirely
 * PRE-PLANNED: the athlete knows the pattern in advance, so it is pure motor
 * execution with little perceptual-cognitive demand. The return-to-sport literature
 * is clear that the *decision* content is what loads a healing joint and drives
 * re-injury — UNANTICIPATED cutting raises knee valgus / injurious loading vs
 * pre-planned cutting, and neurocognitive / reactive-agility capacity is tied to ACL
 * injury and re-injury risk. So the continuum needs a second axis: visual-cognitive
 * decision load, progressed alongside physical chaos.
 *
 * Unlike physical chaos there is NO sensor proxy — decision load is a property of how
 * the drill was DESIGNED (closed pattern vs react-to-stimulus), so it is a physio
 * classification, never auto-suggested. Pure / IO-free / serialisable. Descriptive
 * decision-support — never a diagnosis, never the readiness colour.
 *
 * Refs: Besier 2001; Brown 2014 (unanticipated vs pre-planned cutting & knee load);
 * Swanik 2015 (neuromechanical hypothesis); Herman & Barth 2016; Grooms 2018;
 * Gokeler 2019 (perceptual-cognitive / motor-learning in ACL return-to-sport).
 */

import type { Bi } from "@/lib/micropulse/periodization";
import { CCC_PHASE_BY_KEY, type CccPhaseKey } from "./continuum";

export const VC_CITATION = "Besier 2001; Brown 2014; Swanik 2015; Herman & Barth 2016; Grooms 2018; Gokeler 2019";

/** The cognitive-load level of a session's task design (ordered 0–3). */
export type VcLevel = "preplanned" | "cued" | "reactive" | "openplay";

export type VcLevelDef = { key: VcLevel; order: number; name: Bi; focus: Bi };

export const VC_LEVELS: VcLevelDef[] = [
  {
    key: "preplanned", order: 0,
    name: { en: "Pre-planned", is: "Fyrirfram skipulagt" },
    focus: { en: "Closed skill — the pattern is known in advance; pure motor execution, no decision.", is: "Lokað færni — mynstrið er þekkt fyrirfram; hrein hreyfiframkvæmd, engin ákvörðun." },
  },
  {
    key: "cued", order: 1,
    name: { en: "Cued (anticipated)", is: "Með vísbendingu (fyrirséð)" },
    focus: { en: "Movement triggered by a simple expected cue (coach 'go'); direction known in advance.", is: "Hreyfing ræst af einfaldri fyrirséðri vísbendingu (þjálfari „af stað\"); stefna þekkt fyrirfram." },
  },
  {
    key: "reactive", order: 2,
    name: { en: "Reactive (unanticipated)", is: "Viðbragð (ófyrirséð)" },
    focus: { en: "Direction/action set by a stimulus revealed late (coach points / light / 1v1 mirror): perceive → decide → act. The key re-injury exposure.", is: "Stefna/aðgerð ræðst af áreiti sem birtist seint (þjálfari bendir / ljós / 1v1 speglun): skynja → ákveða → bregðast. Lykil-endurmeiðslaálag." },
  },
  {
    key: "openplay", order: 3,
    name: { en: "Open play / dual-task", is: "Opið spil / tvíverk" },
    focus: { en: "Full game-like decision load — multiple stimuli, opponents, ball, dual-tasking under fatigue.", is: "Full leiklík ákvörðunarbyrði — mörg áreiti, andstæðingar, bolti, tvíverk undir þreytu." },
  },
];

export const VC_BY_KEY: Record<VcLevel, VcLevelDef> = Object.fromEntries(VC_LEVELS.map((v) => [v.key, v])) as Record<VcLevel, VcLevelDef>;
export const isVcLevel = (s: string): s is VcLevel => s in VC_BY_KEY;
const vcOrder = (level: VcLevel): number => VC_BY_KEY[level]?.order ?? 0;

/** The minimum cognitive level a phase is expected to introduce — maps off the
 *  phase's own control↔chaos order. Descriptive expectation, NOT a hard gate. */
export function vcTargetForPhase(phaseKey: CccPhaseKey): VcLevel {
  const chaos = CCC_PHASE_BY_KEY[phaseKey]?.chaos ?? 0;
  if (chaos >= 4) return "openplay";       // team_training
  if (chaos >= 3) return "reactive";       // high_chaos
  if (chaos >= 2) return "cued";           // moderate_chaos
  return "preplanned";                     // high_control / moderate_control
}

/** A session carrying a (physio-tagged) cognitive level — the slice VC exposure reads. */
type VcTaggable = { cognitiveLevel: VcLevel | null };

const LEVEL_NAME = (level: VcLevel, is: boolean): string => (is ? VC_BY_KEY[level]?.name.is : VC_BY_KEY[level]?.name.en) ?? level;

export type VcExposure = {
  counts: Record<VcLevel, number>;
  /** ≥1 recent session whose cognitive order reaches the phase's VC target. */
  exposureMet: boolean;
  evaluated: number;
  target: VcLevel;
  summary: Bi;
};

/**
 * Over the recent window: has the player actually been exposed to this phase's
 * decision load, or only lower-cognitive (more pre-planned) sessions? The gap read —
 * e.g. "physically progressing but all pre-planned". Descriptive, never a blocker.
 */
export function summarizeVcExposure(sessions: VcTaggable[], phaseKey: CccPhaseKey): VcExposure {
  const counts = { preplanned: 0, cued: 0, reactive: 0, openplay: 0 } as Record<VcLevel, number>;
  const target = vcTargetForPhase(phaseKey);
  const targetOrder = vcOrder(target);
  let evaluated = 0;
  let exposureMet = false;
  for (const s of sessions) {
    if (!s.cognitiveLevel) continue;
    counts[s.cognitiveLevel] += 1;
    evaluated += 1;
    if (vcOrder(s.cognitiveLevel) >= targetOrder) exposureMet = true;
  }
  const tEn = LEVEL_NAME(target, false);
  const tIs = LEVEL_NAME(target, true);
  let summary: Bi;
  if (evaluated === 0) {
    summary = {
      en: `No decision-load tags yet — classify sessions' cognitive demand to track VC exposure (target: ${tEn}).`,
      is: `Engar ákvörðunar-merkingar enn — flokkaðu vitræna kröfu lota til að fylgja VC-álagi (markmið: ${tIs}).`,
    };
  } else if (targetOrder === 0) {
    summary = {
      en: `${evaluated} session${evaluated === 1 ? "" : "s"} classified — this phase only needs pre-planned work.`,
      is: `${evaluated} lot${evaluated === 1 ? "a" : "ur"} flokkað${evaluated === 1 ? "" : "ar"} — þessi fasi þarf aðeins fyrirfram skipulagða vinnu.`,
    };
  } else if (exposureMet) {
    summary = {
      en: `Decision-load exposure met for ${tEn} — ≥1 recent session reached this phase's cognitive demand.`,
      is: `Ákvörðunar-álag náð fyrir ${tIs} — ≥1 nýleg lota náði vitrænni kröfu fasans.`,
    };
  } else {
    summary = {
      en: `Physically progressing but all pre-planned — no ${tEn}-level decision load yet for this phase.`,
      is: `Líkamlega á leið áfram en allt fyrirfram skipulagt — ekkert ${tIs}-ákvörðunarálag enn fyrir þennan fasa.`,
    };
  }
  return { counts, exposureMet, evaluated, target, summary };
}
