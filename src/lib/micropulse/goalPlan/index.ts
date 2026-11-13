/**
 * Player goal plan — `buildGoalPlan(input)`: one player's own data → an 8-week ADD-ON plan for one quality
 * (top speed, acceleration, braking or vertical jump).
 *
 * Pure, deterministic, client-safe. No DB, no AI: rules decide. The loader (`loader.ts`, server-only) reads
 * the data; this file only decides.
 *
 * The plan is an add-on on its own card: two short sessions a week in season. It never writes "Today's
 * session" (`player_today_strength_override`), the readiness colour, a load target or a daily decision.
 * Lota 1 (Nov 2026): coach preview only; nothing reaches a player.
 */

import {
  COMMON_SAFETY,
  GOAL_CONTENT_VERSION,
  GOAL_ENGINE_VERSION,
  PLAN_BASIS,
  QUALITY_LABEL,
  SUPERVISION,
  applySupervision,
  blockReason,
  blockedText,
  isYouth,
  pickStart,
  sessionsPerWeek,
  trimSessions,
} from "./common";
import {
  TOP_SPEED_SAFETY,
  TOP_SPEED_START_LABEL,
  strengthEmphasis,
  topSpeedAllowed,
  topSpeedReasons,
  topSpeedRefs,
  topSpeedStart,
  topSpeedWeeks,
} from "./topSpeed";
import { ACCEL_START_LABEL, accelAllowed, accelStart, buildAccelerationParts } from "./acceleration";
import { BRAKING_START_LABEL, brakingAllowed, brakingStart, buildBrakingParts } from "./braking";
import { JUMP_START_LABEL, buildJumpParts, jumpAllowed, jumpStart } from "./jump";
import type { Bi, GoalEvidence, GoalPlan, GoalPlanInput, GoalQuality, GoalRef, GoalWeek } from "./types";

export * from "./types";
export { QUALITY_LABEL, EVIDENCE_LABEL, isYouth, PLAN_WEEKS } from "./common";

/** What a quality builder returns; `buildGoalPlan` adds the shared parts. */
export type GoalParts = {
  verdict: Bi;
  facts: Bi[];
  branch: { key: string; label: Bi; why: Bi };
  /** The start the plan uses (rule's or the coach's allowed choice). */
  start: string;
  counterfactual: Bi | null;
  evidence: GoalEvidence;
  confidence: { level: "high" | "moderate" | "low"; used: Bi[]; missing: Bi[] };
  weeks: GoalWeek[];
  tests: { weeks: number[]; what: Bi; change: Bi };
  safety: Bi[];
  /** What the research does not show (shown behind "Show details"). */
  limits: Bi[];
  refs: GoalRef[];
};

function topSpeedParts(input: GoalPlanInput): GoalParts {
  const start = pickStart(input, topSpeedStart(input), topSpeedAllowed(input));
  const emphasis = strengthEmphasis(input);
  const why = topSpeedReasons(input, start, emphasis);
  const used: Bi[] = [];
  const missing: Bi[] = [];
  if (input.topSpeed) used.push({ en: `GPS top speed ${input.topSpeed.refKmh} km/h`, is: `Hámarkshraði úr GPS ${input.topSpeed.refKmh} km/klst` });
  else missing.push({ en: "Top speed (GPS or sprint test)", is: "Hámarkshraði (GPS eða sprettpróf)" });
  if (input.strength?.dsiTier || input.strength?.imtpBand) used.push({ en: "Force-plate strength test", is: "Styrkmæling á kraftplötu" });
  else missing.push({ en: "Strength test on the force plates", is: "Styrkmæling á kraftplötu" });
  const level = input.topSpeed && used.length === 2 ? (input.topSpeed.confidence === "high" ? "high" : "moderate") : input.topSpeed ? "moderate" : "low";
  const testWeeks = start === "build_first" ? [3, 8] : [1, 8];
  return {
    verdict: start === "build_first"
      ? { en: "Two build-up weeks, then flying sprints once a week with the team, plus one short gym session.", is: "Tvær uppbyggingarvikur, svo fljúgandi sprettir einu sinni í viku með liðinu, auk einnar stuttrar styrktaræfingar." }
      : { en: "Flying sprints once a week with the team from week 1, plus one short gym session.", is: "Fljúgandi sprettir einu sinni í viku með liðinu frá viku 1, auk einnar stuttrar styrktaræfingar." },
    facts: [
      why.startWhy,
      why.emphasisWhy,
      { en: "Expect small gains: about 1.5–3.5% over 6–9 weeks in the trials behind these doses (Nicholson 2022).", is: "Búast má við lítilli bætingu: um 1,5–3,5% á 6–9 vikum í rannsóknunum að baki skömmtunum (Nicholson 2022)." },
    ],
    branch: {
      key: `${start}_${emphasis}`,
      label: TOP_SPEED_START_LABEL[start],
      why: why.startWhy,
    },
    start,
    counterfactual: why.counterfactual,
    evidence: "researched",
    confidence: { level, used, missing },
    weeks: topSpeedWeeks(start, emphasis),
    tests: {
      weeks: testWeeks,
      what: { en: `Flying 20 m or GPS top speed in week ${testWeeks[0]} and week 8.`, is: `Fljúgandi 20 m eða hámarkshraði úr GPS í viku ${testWeeks[0]} og viku 8.` },
      change: { en: "Under 1% faster counts as no clear change (MicroPulse rule, not from a study: timing gates and GPS both vary a little day to day).", is: "Undir 1% bæting telst engin skýr breyting (regla MicroPulse, ekki úr rannsókn: tímahlið og GPS sveiflast bæði aðeins milli daga)." },
    },
    safety: TOP_SPEED_SAFETY,
    limits: [
      { en: "The gains in these trials were small (about 1.5–3.5% over 6–9 weeks), and most trials were not in season.", is: "Bætingin í þessum rannsóknum var lítil (um 1,5–3,5% á 6–9 vikum) og flestar voru ekki á keppnistímabili." },
      { en: "Getting stronger went with faster sprints under 30 m; whether it raises top speed is not known (Seitz 2014, whose effect sizes a 2022 re-analysis found inflated).", is: "Aukinn styrkur fór saman við hraðari spretti undir 30 m; hvort hann hækkar hámarkshraða er ekki vitað (Seitz 2014, en endurgreining 2022 fann áhrifastærðirnar ofmetnar)." },
      { en: "No study tested choosing the start from days since a fast run or from a strength test: that choice is MicroPulse's rule.", is: "Engin rannsókn prófaði að velja upphafið út frá dögum frá hröðum spretti eða styrkprófi: það val er regla MicroPulse." },
    ],
    refs: topSpeedRefs(),
  };
}

/** The rule's start for this player, before any coach choice. */
export function ruleStart(input: GoalPlanInput): string {
  switch (input.quality) {
    case "top_speed": return topSpeedStart(input);
    case "acceleration": return accelStart(input);
    case "braking": return brakingStart(input);
    case "jump": return jumpStart(input);
  }
}

const START_LABELS: Record<GoalQuality, Record<string, Bi>> = {
  top_speed: TOP_SPEED_START_LABEL,
  acceleration: ACCEL_START_LABEL,
  braking: BRAKING_START_LABEL,
  jump: JUMP_START_LABEL,
};

/**
 * The starts a coach may choose for this player, rule's start first. The safety rules decide the list: under 18
 * keeps the youth level, a player already braking hard a lot gets technique only, and flying sprints from week 1
 * need a fast run within the long-gap limit.
 */
export function allowedStarts(input: GoalPlanInput): { key: string; label: Bi; rule: boolean }[] {
  const keys: string[] = (() => {
    switch (input.quality) {
      case "top_speed": return topSpeedAllowed(input);
      case "acceleration": return accelAllowed(input);
      case "braking": return brakingAllowed(input);
      case "jump": return jumpAllowed(input);
    }
  })();
  const rule = ruleStart(input);
  const ordered = [rule, ...keys.filter((k) => k !== rule)].filter((k) => keys.includes(k));
  return ordered.map((key) => ({ key, label: START_LABELS[input.quality][key], rule: key === rule }));
}

function partsFor(input: GoalPlanInput): GoalParts {
  switch (input.quality) {
    case "top_speed": return topSpeedParts(input);
    case "acceleration": return buildAccelerationParts(input);
    case "braking": return buildBrakingParts(input);
    case "jump": return buildJumpParts(input);
  }
}

export function buildGoalPlan(input: GoalPlanInput): GoalPlan {
  const youth = isYouth(input.ageYears);
  const perWeek = sessionsPerWeek(input.inSeason);
  const reason = blockReason(input);
  const base = {
    quality: input.quality,
    engineVersion: GOAL_ENGINE_VERSION,
    contentVersion: GOAL_CONTENT_VERSION,
    sessionsPerWeek: perWeek,
    youthLevel: youth,
    supervision: youth ? SUPERVISION.youth : SUPERVISION.adult,
    basis: PLAN_BASIS,
  };
  if (reason) {
    const text = blockedText(reason);
    return {
      ...base,
      status: "blocked",
      blocked: { reason, text },
      verdict: { en: `${QUALITY_LABEL[input.quality].en}: no plan now.`, is: `${QUALITY_LABEL[input.quality].is}: engin áætlun núna.` },
      facts: [text],
      branch: null,
      start: null,
      startOverride: null,
      counterfactual: null,
      evidence: "rule_of_thumb",
      confidence: { level: "low", used: [], missing: [] },
      weeks: [],
      tests: { weeks: [], what: { en: "", is: "" }, change: { en: "", is: "" } },
      safety: [],
      limits: [],
      refs: [],
    };
  }
  const p = partsFor(input);
  // The coach chose another allowed start: the data-based "why" no longer explains the start, so it is replaced
  // by a plain note that the coach chose it (the reason is logged with the decision), and the "what would change
  // it" line is dropped.
  const rule = ruleStart(input);
  const overridden = p.start !== rule;
  if (overridden) {
    const ruleLabel = START_LABELS[input.quality][rule];
    const coachWhy: Bi = {
      en: `The coach chose this start ("${p.branch.label.en}") instead of the rule's suggestion ("${ruleLabel.en}"). The safety rules still apply.`,
      is: `Þjálfarinn valdi þetta upphaf („${p.branch.label.is}") í stað tillögu reglunnar („${ruleLabel.is}"). Öryggisreglurnar gilda áfram.`,
    };
    const old = p.branch.why;
    const i = p.facts.findIndex((f) => f.en === old.en);
    p.facts = i >= 0 ? p.facts.map((f, j) => (j === i ? coachWhy : f)) : [coachWhy, ...p.facts];
    p.branch = { ...p.branch, why: coachWhy };
    p.counterfactual = null;
  }
  const facts = youth
    ? [...p.facts.slice(0, 2), input.ageYears == null
        ? { en: "Age not on record, so the plan uses the easier level and a coach is there for every session. Add the date of birth to change this.", is: "Aldur ekki skráður, svo áætlunin notar léttara stigið og þjálfari er við hverja æfingu. Skráðu fæðingardag til að breyta því." }
        : { en: `Under 18 (${input.ageYears}), so the plan uses the easier level and a coach is there for every session.`, is: `Undir 18 ára (${input.ageYears}), svo áætlunin notar léttara stigið og þjálfari er við hverja æfingu.` }]
    : p.facts.slice(0, 3);
  return {
    ...base,
    status: "ok",
    blocked: null,
    verdict: p.verdict,
    facts,
    branch: p.branch,
    start: p.start,
    startOverride: overridden ? { rule, chosen: p.start } : null,
    counterfactual: p.counterfactual,
    evidence: p.evidence,
    confidence: p.confidence,
    weeks: applySupervision(trimSessions(p.weeks, perWeek), youth),
    tests: p.tests,
    safety: [...p.safety, ...COMMON_SAFETY],
    limits: p.limits,
    refs: p.refs,
  };
}
