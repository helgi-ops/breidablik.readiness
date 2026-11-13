/**
 * Goal plan — rules shared by all four qualities: who may get a plan, the age gate, supervision, sessions per
 * week, and the blocked messages. Pure and client-safe.
 */

import type { Bi, GoalBlock, GoalBlockReason, GoalPlanInput, GoalQuality, GoalSession, GoalWeek, StrengthBand } from "./types";

export const GOAL_ENGINE_VERSION = "goal-plan-1";
/** Bump when a dose, a method or a source changes. A plan approved earlier keeps its frozen copy. */
export const GOAL_CONTENT_VERSION = "2026-11-13";

export const PLAN_WEEKS = 8;
/** In-season add-on sessions a week (MicroPulse rule, not from a study). */
export const IN_SEASON_SESSIONS = 2;
/** Out of season (MicroPulse rule, not from a study). */
export const OFF_SEASON_SESSIONS = 3;
/** Most minutes one add-on session takes (MicroPulse rule). */
export const MAX_SESSION_MINUTES = 20;
/** Under this age everything hard is supervised and the easier level is used. */
export const ADULT_AGE = 18;

export const QUALITY_LABEL: Record<GoalQuality, Bi> = {
  top_speed: { en: "Top speed", is: "Hámarkshraði" },
  acceleration: { en: "Acceleration", is: "Hröðun" },
  braking: { en: "Braking", is: "Bremsun" },
  jump: { en: "Vertical jump", is: "Lóðrétt stökk" },
};

export const EVIDENCE_LABEL: Record<"researched" | "partly" | "rule_of_thumb", Bi> = {
  researched: { en: "Researched", is: "Rannsakað" },
  partly: { en: "Partly researched", is: "Að hluta rannsakað" },
  rule_of_thumb: { en: "Rule of thumb", is: "Þumalputtaregla" },
};

/** Under 18, or age unknown (unknown is never read as adult). */
/** The coach's start when the safety rules allow it, else the rule's start. */
export function pickStart<T extends string>(input: GoalPlanInput, rule: T, allowed: readonly T[]): T {
  const o = input.startOverride;
  return o && (allowed as readonly string[]).includes(o) ? (o as T) : rule;
}

export function isYouth(ageYears: number | null): boolean {
  return ageYears == null || ageYears < ADULT_AGE;
}

export function sessionsPerWeek(inSeason: boolean): number {
  return inSeason ? IN_SEASON_SESSIONS : OFF_SEASON_SESSIONS;
}

const BLOCKED_TEXT: Record<GoalBlockReason, Bi> = {
  injured_or_rtt: {
    en: "Not now: the player is marked injured or is returning from injury. The coach starts this once the player is back in full training.",
    is: "Ekki núna: leikmaðurinn er skráður meiddur eða í endurkomu. Þjálfari setur þetta af stað þegar leikmaðurinn er kominn í fullar æfingar.",
  },
  goalkeeper: {
    en: "Not offered to goalkeepers: they rarely sprint flat out (same rule as \"Top speed due\").",
    is: "Ekki í boði fyrir markmenn: þeir spretta sjaldan á fullu (sama regla og í „Tími á hámarkshraða\").",
  },
  not_for_sport: {
    en: "Top speed is a football plan: basketball rarely reaches top speed on a court. Acceleration fits better.",
    is: "Hámarkshraði er fótboltaáætlun: í körfubolta næst hámarkshraði sjaldan á vellinum. Hröðun hentar betur.",
  },
  sport_not_supported: {
    en: "Goal plans are for football and basketball teams for now.",
    is: "Markmiðsáætlanir eru fyrir fótbolta- og körfuboltalið í bili.",
  },
  player_inactive: {
    en: "The player is not active on the squad.",
    is: "Leikmaðurinn er ekki virkur í hópnum.",
  },
};

/** The first rule that stops a plan, or null. Injury comes first: it beats every other reason. */
export function blockReason(input: GoalPlanInput): GoalBlockReason | null {
  if (!input.isActive) return "player_inactive";
  if (input.unavailable) return "injured_or_rtt";
  if (input.sport === "other") return "sport_not_supported";
  if (input.quality === "top_speed" && input.sport !== "football") return "not_for_sport";
  if (input.quality === "top_speed" && input.isGoalkeeper) return "goalkeeper";
  return null;
}

export function blockedText(reason: GoalBlockReason): Bi {
  return BLOCKED_TEXT[reason];
}

export const SUPERVISION: { adult: Bi; youth: Bi } = {
  adult: {
    en: "Flat-out sprints, hard stops and drop jumps are done in the team warm-up with a coach there, never alone.",
    is: "Sprettir á fullu, harðar bremsur og fallhopp eru gerð í upphitun með liðinu og þjálfari á staðnum, aldrei einn.",
  },
  youth: {
    en: "Under 18 (or age not on record): every session is done with a coach there, and the easier level is used.",
    is: "Undir 18 ára (eða aldur ekki skráður): hver æfing er gerð með þjálfara á staðnum og léttara stigið er notað.",
  },
};

/** Rules every plan carries, whatever the quality. */
export const COMMON_SAFETY: Bi[] = [
  {
    en: "A yellow day means the lighter version of the session; a red day means skip it. The plan reads the colour, it never sets it.",
    is: "Gulur dagur þýðir léttari útgáfu af æfingunni; rauður dagur þýðir að sleppa henni. Áætlunin les litinn, hún setur hann aldrei.",
  },
  {
    en: "If the player is marked injured or starts a return to training, the plan pauses. Only the coach restarts it.",
    is: "Ef leikmaðurinn er skráður meiddur eða byrjar endurkomu fer áætlunin í bið. Aðeins þjálfari setur hana aftur af stað.",
  },
  {
    en: "The add-on never goes on the day before a match (MD-1) or the day after (MD+1).",
    is: "Viðbótin fer aldrei á daginn fyrir leik (MD-1) né daginn eftir (MD+1).",
  },
  {
    en: "Stop the set when the movement gets slower or sloppier: quality first.",
    is: "Hættu settinu þegar hreyfingin hægist eða verður ónákvæm: gæði fyrst.",
  },
];

export const PLAN_BASIS: Bi = {
  en: "No study tested this exact plan. The doses come from the studies cited; choosing the start from the player's data and fitting it into the week is MicroPulse's work. Two sessions a week in season is MicroPulse's rule.",
  is: "Engin rannsókn prófaði nákvæmlega þessa áætlun. Skammtarnir koma úr rannsóknunum sem vísað er í; að velja upphafið út frá gögnum leikmannsins og raða því í vikuna er MicroPulse. Tvær æfingar á viku á tímabili er regla MicroPulse.",
};

export const BAND_LABEL: Record<StrengthBand, Bi> = {
  elite: { en: "elite", is: "afburða" },
  good: { en: "above average", is: "yfir meðallagi" },
  average: { en: "average", is: "í meðallagi" },
  below: { en: "below average", is: "undir meðallagi" },
};

/** Expand a list of [weeks, label, sessions] rows into exactly PLAN_WEEKS numbered weeks. */
export function expandWeeks(rows: Array<{ weeks: number[]; label: (w: number) => Bi; sessions: GoalSession[] }>): GoalWeek[] {
  const out: GoalWeek[] = [];
  for (const r of rows) for (const w of r.weeks) out.push({ week: w, label: r.label(w), sessions: r.sessions });
  return out.sort((a, b) => a.week - b.week);
}

export const weekLabel = (w: number, en: string, is: string): Bi => ({
  en: `Week ${w}${en ? `: ${en}` : ""}`,
  is: `Vika ${w}${is ? `: ${is}` : ""}`,
});

/** Mark the hard blocks supervised; for youth, every block in the session. */
export function applySupervision(weeks: GoalWeek[], youth: boolean): GoalWeek[] {
  const mark = (b: GoalBlock): GoalBlock => {
    const hard = (b.flatOutM ?? 0) > 0 || (b.hardStops ?? 0) > 0 || b.dropJumps === true;
    return hard || youth ? { ...b, supervised: true } : b;
  };
  return weeks.map((w) => ({ ...w, sessions: w.sessions.map((s) => ({ ...s, blocks: s.blocks.map(mark) })) }));
}

/** Keep only the first n sessions of each week (in season: A and B; out of season: A, B and C). */
export function trimSessions(weeks: GoalWeek[], n: number): GoalWeek[] {
  return weeks.map((w) => ({ ...w, sessions: w.sessions.slice(0, n) }));
}

export const WHEN: Record<"speed_day" | "gym_day" | "warmup_any" | "off_day", Bi> = {
  speed_day: {
    en: "In the team warm-up on the team's speed day (MD-3 or MD-4), before the main session.",
    is: "Í upphitun með liðinu á hraðadegi liðsins (MD-3 eða MD-4), á undan aðalæfingunni.",
  },
  gym_day: {
    en: "On the team's gym day, at least 2 days after session A, never MD-1.",
    is: "Á styrktardegi liðsins, minnst 2 dögum eftir æfingu A, aldrei MD-1.",
  },
  warmup_any: {
    en: "After the team warm-up, early in the session, not MD-1 or MD+1.",
    is: "Eftir upphitun með liðinu, snemma á æfingu, ekki MD-1 né MD+1.",
  },
  off_day: {
    en: "Out of season only: a third session at least 2 days from the others.",
    is: "Aðeins utan tímabils: þriðja æfing minnst 2 dögum frá hinum.",
  },
};
