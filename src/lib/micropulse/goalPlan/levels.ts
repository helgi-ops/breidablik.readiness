/**
 * Training levels for the Programme Library "Speed & power" plans (lota 4, step 2, coach's choice 2026-11-15):
 * beginner · intermediate · advanced, for all four qualities and all three plan tabs. Pure and client-safe.
 *
 * Intermediate IS the plan as built from the studies (byte-for-byte the plans before levels existed; a golden test
 * pins it). Beginner and advanced are MicroPulse's, kept inside the doses the studies used. The coach picks the level;
 * the lines below say who each level is for, as guidance, not as a rule from a study. Under 18 the youth rules hold
 * at every level, and the youth start in "Individual" is its own level (no picker).
 *
 * Player goal plans use the same levels since lota 5 (the coach picks one at approval; `allowedLevels`).
 */

import type { Bi, GoalQuality } from "./types";

export type TrainingLevel = "beginner" | "intermediate" | "advanced";

export const TRAINING_LEVELS: TrainingLevel[] = ["beginner", "intermediate", "advanced"];

export const DEFAULT_LEVEL: TrainingLevel = "intermediate";

export function isTrainingLevel(x: unknown): x is TrainingLevel {
  return x === "beginner" || x === "intermediate" || x === "advanced";
}

export const LEVEL_LABEL: Record<TrainingLevel, Bi> = {
  beginner: { en: "Beginner", is: "Byrjandi" },
  intermediate: { en: "Intermediate", is: "Miðlungs" },
  advanced: { en: "Advanced", is: "Framhald" },
};

/** Who each level is for: guidance for the coach, not a rule from a study. */
export const LEVEL_WHO: Record<TrainingLevel, Bi> = {
  beginner: {
    en: "New to this kind of training, or back from a long break (2 months or more).",
    is: "Nýr í svona þjálfun, eða að koma úr löngu hléi (2 mánuðir eða meira).",
  },
  intermediate: {
    en: "Has done sprints, jumps and lifts before with good technique: the level the plans were built from.",
    is: "Hefur æft spretti, hopp og lyftingar áður með góða tækni: stigið sem áætlanirnar eru byggðar á.",
  },
  advanced: {
    en: "Has finished a block like this before, handled it well, and keeps good technique when tired.",
    is: "Hefur áður klárað blokk eins og þessa, þolað hana vel, og heldur góðri tækni undir þreytu.",
  },
};

export const LEVEL_GUIDE_NOTE: Bi = {
  en: "The coach picks the level. Who each level is for is MicroPulse's guidance, not a rule from a study.",
  is: "Þjálfarinn velur stigið. Fyrir hvern hvert stig er, er leiðbeining MicroPulse, ekki regla úr rannsókn.",
};

/** Shown with every level. */
export const LEVEL_BASIS: Bi = {
  en: "The studies tested the intermediate level. The beginner and advanced levels are MicroPulse's, within the doses the studies used.",
  is: "Rannsóknirnar prófuðu miðlungsstigið. Byrjenda- og framhaldsstigin eru MicroPulse, innan þeirra skammta sem rannsóknirnar nota.",
};

export const LEVEL_YOUTH_NOTE: Bi = {
  en: "Under 18 the youth rules hold at every level (no sled, body-weight hops, at most 120 foot contacts, no lifts over 75% of max). The youth start under \"Individual\" is its own level.",
  is: "Undir 18 ára gilda unglingareglurnar á öllum stigum (enginn sleði, hopp með eigin þyngd, mest 120 snertingar, engar lyftur yfir 75% af hámarki). Unglingaupphafið undir „Einstaklingur\" er sitt eigið stig.",
};

/** What the level changes against intermediate, one line per quality (the first fact of a non-intermediate plan). */
export const LEVEL_CHANGES: Record<GoalQuality, Record<Exclude<TrainingLevel, "intermediate">, Bi>> = {
  top_speed: {
    beginner: {
      en: "Beginner: build-up runs at 90–95% for the first 2 weeks, then flying sprints of 10–15 m, fewer of them, with technique-first lifting.",
      is: "Byrjandi: uppbyggingarsprettir á 90–95% fyrstu 2 vikurnar, svo fljúgandi sprettir á 10–15 m, færri, með lyftingum þar sem tæknin kemur fyrst.",
    },
    advanced: {
      en: "Advanced: flying sprints of 20–30 m and more of them, never more than 150 m flat out a session, with heavier lifts.",
      is: "Framhald: fljúgandi sprettir á 20–30 m og fleiri, aldrei meira en 150 m á fullu á æfingu, með þyngri lyftingum.",
    },
  },
  acceleration: {
    beginner: {
      en: "Beginner: one sprint fewer each session, all of them 10 m, no sled, lower bounds and technique-first lifting.",
      is: "Byrjandi: einum spretti færra á hverri æfingu, allir 10 m, enginn sleði, lægri skrefstökk og lyftingar þar sem tæknin kemur fyrst.",
    },
    advanced: {
      en: "Advanced: one sprint more each session, one more sled run (still inside 60–340 m), single-leg bounds and lifts at about 80–90% of max.",
      is: "Framhald: einum spretti fleira á hverri æfingu, einum sleðaspretti fleira (áfram innan 60–340 m), einfóta skrefstökk og lyftingar á um 80–90% af hámarki.",
    },
  },
  braking: {
    beginner: {
      en: "Beginner: the same drills, but two more weeks at 50–75% effort before full effort, and landings on both legs.",
      is: "Byrjandi: sömu æfingar, en tvær vikur til viðbótar á 50–75% átaki áður en fullt átak tekur við, og lendingar á báðum fótum.",
    },
    advanced: {
      en: "Advanced: the same drills, with full effort and reacting to a partner a week sooner, and single-leg landings.",
      is: "Framhald: sömu æfingar, með fullu átaki og viðbrögðum við félaga viku fyrr, og einfóta lendingar.",
    },
  },
  jump: {
    beginner: {
      en: "Beginner: about 50 foot contacts a session, one rebound set fewer, every landing held still, no drop jumps, and technique-first squats.",
      is: "Byrjandi: um 50 snertingar á æfingu, einu endurkastssetti færra, hverri lendingu haldið kyrri, engin fallhopp, og hnébeygja þar sem tæknin kemur fyrst.",
    },
    advanced: {
      en: "Advanced: about 70 foot contacts a session (60–80), drop jumps from 30–40 cm boxes from week 3, and squats one step heavier.",
      is: "Framhald: um 70 snertingar á æfingu (60–80), fallhopp af 30–40 cm kössum frá viku 3, og hnébeygja einu skrefi þyngri.",
    },
  },
};

/** Foot contacts in one adult jump session, by level (intermediate = ADULT_SESSION_CONTACTS in jump.ts). */
export const JUMP_LEVEL_CONTACTS: Record<TrainingLevel, { target: number; min: number; max: number }> = {
  beginner: { target: 50, min: 45, max: 55 },
  intermediate: { target: 55, min: 50, max: 60 },
  advanced: { target: 70, min: 60, max: 80 },
};
