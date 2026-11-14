/**
 * Programme Library "Speed & power" tab, lota 2: three plans each for acceleration, braking and jump height
 * (in season / pre-season / individual), next to the top-speed plans in `@/lib/micropulse/speedMethods`.
 * Pure and client-safe. Coach-only reference: nothing here is sent to a player or written to a week plan.
 *
 * Every block comes from the goal plans' own builders (ACCEL_BLOCKS / BRAKING_BLOCKS / JUMP_BLOCKS), so a dose
 * on this page is the same dose a player's goal plan uses. The individual plan IS the goal plan's 8 weeks for
 * the chosen start (`accelWeeks` / `brakingWeeks` / `jumpWeeks`, supervision applied the same way).
 *
 * Coach's choices (2026-11-14): in season = a 6-week block (what the trials tested), not a fixed maintenance
 * week; one adult team plan per quality plus explicit under-18 rules (the youth level lives in "Individual").
 *
 * Team days: the match is on Saturday (day 5). MD-4 (Tuesday) is the force / accel-decel day in both
 * Periodization Hub week models, so one week version fits both. Pre-season days are Monday and Thursday.
 */

import { ACCEL_BLOCKS, ACCEL_START_LABEL, accelWeeks, type AccelStart } from "./acceleration";
import { BRAKING_BLOCKS, BRAKING_START_LABEL, brakingWeeks, type BrakingStart } from "./braking";
import { JUMP_BLOCKS, JUMP_START_LABEL, jumpWeeks, type JumpStart } from "./jump";
import { PLAN_BASIS, applySupervision } from "./common";
import type { LibraryQuality } from "./qualityLibrary";
import type { Bi, GoalBlock, GoalWeek } from "./types";

export type QualityPlanKey = "in_season" | "pre_season" | "individual";

export const QUALITY_PLAN_KEYS: QualityPlanKey[] = ["in_season", "pre_season", "individual"];

export const QUALITY_PLAN_TAB: Record<QualityPlanKey, Bi> = {
  in_season: { en: "In season", is: "Á tímabili" },
  pre_season: { en: "Pre-season", is: "Undirbúningur" },
  individual: { en: "Individual", is: "Einstaklingur" },
};

export type QualitySession = {
  /** 0 = Monday … 6 = Sunday (team plans only). */
  day: number | null;
  dayLabel: Bi;
  focus: Bi;
  /** When it fits in the week (individual plan). */
  when?: Bi;
  blocks: GoalBlock[];
};

export type QualityWeek = { label: Bi; sessions: QualitySession[] };

export type QualityPlan = {
  quality: LibraryQuality;
  key: QualityPlanKey;
  /** Individual plan only: the start it shows. */
  start: string | null;
  title: Bi;
  who: Bi;
  verdict: Bi;
  facts: Bi[];
  /** "No study tested this exact plan." */
  basis: Bi;
  /** Match day (0 = Monday) when the plan sits around a weekly match. */
  matchDay: number | null;
  weeks: QualityWeek[];
  /** What the research does not show, for this plan. */
  limits: Bi[];
  refs: string[];
};

export const TEAM_PLAN_BASIS: Bi = {
  en: "No study tested these exact plans. The doses come from the studies cited; fitting them into a team week is MicroPulse's work.",
  is: "Engin rannsókn prófaði nákvæmlega þessar áætlanir. Skammtarnir koma úr rannsóknunum sem vísað er í; að raða þeim í viku liðsins er MicroPulse.",
};

/** Rules in every plan (the goal plans' own rules; no new numbers). */
export const QUALITY_PLAN_RULES: Bi[] = [
  {
    en: "Never on the day before a match (MD-1) or the day after (MD+1), and at least 2 days between two of these sessions.",
    is: "Aldrei daginn fyrir leik (MD-1) né daginn eftir (MD+1), og minnst 2 dagar milli tveggja slíkra æfinga.",
  },
  {
    en: "One quality at a time on top of team training (MicroPulse's rule).",
    is: "Einn eiginleiki í einu ofan á liðsæfingar (regla MicroPulse).",
  },
  {
    en: "Flat-out sprints, hard stops and drop jumps are done with a coach there, never alone.",
    is: "Sprettir á fullu, harðar bremsur og fallhopp eru gerð með þjálfara á staðnum, aldrei einn.",
  },
  {
    en: "Under 18: no sled, hops with body weight only and at most 120 foot contacts a session, drop jumps only near the end with a coach there, and no lifts over 75% of max (MicroPulse's rules). The youth level is under \"Individual\".",
    is: "Undir 18 ára: enginn sleði, hopp aðeins með eigin þyngd og mest 120 snertingar á æfingu, fallhopp aðeins undir lokin með þjálfara á staðnum, og engar lyftur yfir 75% af hámarki (reglur MicroPulse). Unglingastigið er undir „Einstaklingur\".",
  },
  {
    en: "A yellow day means the lighter version; a red day means skip it. The plan reads the readiness colour, it never sets it.",
    is: "Gulur dagur þýðir léttari útgáfu; rauður dagur þýðir að sleppa. Áætlunin les litinn, hún setur hann aldrei.",
  },
  {
    en: "Stop the set when the movement gets slower or sloppier: quality first.",
    is: "Hættu settinu þegar hreyfingin hægist eða verður ónákvæm: gæði fyrst.",
  },
];

/** Most hops / bounds / landings in one session at the youth level (MicroPulse rule, from Bedoya 2015). */
export const YOUTH_MAX_CONTACTS = 120;
/** Sled metres per session that worked in Petrakos 2016. */
export const SLED_M_RANGE = { min: 60, max: 340 } as const;

// ─── Shared helpers ────────────────────────────────────────────────────────

const MATCH_DAY = 5;
const MD4: Bi = { en: "MD-4", is: "MD-4" };
const MD2: Bi = { en: "MD-2", is: "MD-2" };
const MON: Bi = { en: "Monday", is: "Mánudagur" };
const THU: Bi = { en: "Thursday", is: "Fimmtudagur" };
const wk = (en: string, is: string): Bi => ({ en, is });
const optional = (b: GoalBlock): GoalBlock => ({ ...b, what: { en: `${b.what.en} (optional)`, is: `${b.what.is} (valfrjálst)` } });

// ─── Acceleration ──────────────────────────────────────────────────────────

const A = ACCEL_BLOCKS;
/** Light jump squats, then heavy legs (power before strength): the goal plan's "balanced" gym session. */
const accelGym = (light: boolean): GoalBlock[] => A.gym("balanced", light, false).blocks;
const jumpSquats = (light: boolean): GoalBlock => accelGym(light)[0];
const accelHeavy = (light: boolean): GoalBlock => accelGym(light)[1];

const ACCEL_IN_SEASON: QualityPlan = {
  quality: "acceleration",
  key: "in_season",
  start: null,
  title: { en: "Acceleration in season: a 6-week block", is: "Hröðun á tímabili: 6 vikna blokk" },
  who: { en: "Football team in season, match on Saturday (MD). One quality at a time.", is: "Fótboltalið á tímabili, leikur á laugardegi (MD). Einn eiginleiki í einu." },
  verdict: {
    en: "Short sprints from a standing start after the warm-up on MD-4, and heavy legs in the gym the same day, for 6 weeks.",
    is: "Stuttir sprettir frá kyrrstöðu eftir upphitun á MD-4, og þungar fætur í sal sama dag, í 6 vikur.",
  },
  facts: [
    { en: "MD-4 is the force and accel-decel day in both Periodization Hub week models, so the block fits either week.", is: "MD-4 er kraft- og hröðunar/bremsudagurinn í báðum vikulíkönum Periodization Hub, svo blokkin passar í hvora vikuna sem er." },
    { en: "Sled sprints are optional: they helped the first steps about as much as the same sprints without a sled (Alcaraz 2018; Petrakos 2016).", is: "Sleðasprettir eru valfrjálsir: þeir hjálpuðu fyrstu skrefunum álíka mikið og sömu sprettir án sleða (Alcaraz 2018; Petrakos 2016)." },
    { en: "Timed 10 m in week 1 and week 6. Expect smaller gains in season than in pre-season.", is: "Tímamældur 10 m í viku 1 og viku 6. Búast má við minni bætingu á tímabili en á undirbúningstímabili." },
  ],
  basis: TEAM_PLAN_BASIS,
  matchDay: MATCH_DAY,
  weeks: [
    { label: wk("Week 1: test + starts", "Vika 1: mæling + stört"), sessions: [
      { day: 1, dayLabel: MD4, focus: { en: "Test + starts, then gym", is: "Mæling + stört, svo salur" }, blocks: [A.test10, A.starts("4", "10"), jumpSquats(false), accelHeavy(false)] },
    ] },
    { label: wk("Weeks 2–3", "Vikur 2–3"), sessions: [
      { day: 1, dayLabel: MD4, focus: { en: "Starts, then gym", is: "Stört, svo salur" }, blocks: [optional(A.sled(4, 15)), A.starts("4", "10–15"), jumpSquats(false), accelHeavy(false)] },
    ] },
    { label: wk("Weeks 4–5", "Vikur 4–5"), sessions: [
      { day: 1, dayLabel: MD4, focus: { en: "Starts, then gym", is: "Stört, svo salur" }, blocks: [optional(A.sled(5, 20)), A.starts("5", "15–20"), jumpSquats(false), accelHeavy(false)] },
    ] },
    { label: wk("Week 6: lighter + test", "Vika 6: léttari + mæling"), sessions: [
      { day: 1, dayLabel: MD4, focus: { en: "Test + starts, light gym", is: "Mæling + stört, léttur salur" }, blocks: [A.test10, A.starts("2", "10"), accelHeavy(true)] },
    ] },
  ],
  limits: [
    { en: "Once a week is less than the 2–3 a week in the trials, so expect smaller gains (Petrakos 2016).", is: "Einu sinni í viku er minna en 2–3 á viku í rannsóknunum, svo búast má við minni bætingu (Petrakos 2016)." },
    { en: "Sled sprints are not shown to beat the same sprints without a sled.", is: "Sleðasprettir eru ekki sýndir betri en sömu sprettir án sleða." },
  ],
  refs: ["mendiguchia2020", "haugen2019", "alcaraz2018", "petrakos2016", "seitz2014", "loturco2016"],
};

const ACCEL_PRE_SEASON: QualityPlan = {
  quality: "acceleration",
  key: "pre_season",
  start: null,
  title: { en: "Acceleration in pre-season: 6 weeks", is: "Hröðun á undirbúningstímabili: 6 vikur" },
  who: { en: "Football team in pre-season, alongside normal team training.", is: "Fótboltalið á undirbúningstímabili, samhliða venjulegum liðsæfingum." },
  verdict: {
    en: "Two acceleration days a week for 6 weeks, 72 hours apart: sled, starts and heavy legs on day 1; starts, bounds and jump squats on day 2.",
    is: "Tveir hröðunardagar á viku í 6 vikur, 72 klst á milli: sleði, stört og þungar fætur á degi 1; stört, skrefstökk og hnébeygjuhopp á degi 2.",
  },
  facts: [
    { en: "Sled volume builds from 60 to 120 m a session, inside the 60–340 m that worked (Petrakos 2016). It is an option, not an upgrade: sprints without a sled did as well.", is: "Sleðamagnið vex úr 60 í 120 m á æfingu, innan 60–340 m sem virkaði (Petrakos 2016). Sleðinn er valkostur, ekki betri leið: sprettir án sleða gerðu jafn vel." },
    { en: "Two gym sessions a week did as well as more for sprint gains (Seitz 2014).", is: "Tvær styrktaræfingar á viku dugðu eins vel og fleiri fyrir sprettbætingu (Seitz 2014)." },
    { en: "Timed 10 m in week 1 and week 6.", is: "Tímamældur 10 m í viku 1 og viku 6." },
  ],
  basis: TEAM_PLAN_BASIS,
  matchDay: null,
  weeks: [
    { label: wk("Week 1: test + start", "Vika 1: mæling + byrjun"), sessions: [
      { day: 0, dayLabel: MON, focus: { en: "Test + sled + starts, then gym", is: "Mæling + sleði + stört, svo salur" }, blocks: [A.test10, A.sled(4, 15), A.starts("4", "10"), accelHeavy(false)] },
      { day: 3, dayLabel: THU, focus: { en: "Starts + bounds + jump squats", is: "Stört + skrefstökk + hnébeygjuhopp" }, blocks: [A.starts("5", "10–15"), A.bounds(3), jumpSquats(false)] },
    ] },
    { label: wk("Weeks 2–3", "Vikur 2–3"), sessions: [
      { day: 0, dayLabel: MON, focus: { en: "Sled + starts, then gym", is: "Sleði + stört, svo salur" }, blocks: [A.sled(5, 20), A.starts("4", "10–20"), accelHeavy(false)] },
      { day: 3, dayLabel: THU, focus: { en: "Starts + bounds + jump squats", is: "Stört + skrefstökk + hnébeygjuhopp" }, blocks: [A.starts("6", "10–20"), A.bounds(4), jumpSquats(false)] },
    ] },
    { label: wk("Weeks 4–5", "Vikur 4–5"), sessions: [
      { day: 0, dayLabel: MON, focus: { en: "Sled + starts, then gym", is: "Sleði + stört, svo salur" }, blocks: [A.sled(6, 20), A.starts("4", "15–20"), accelHeavy(false)] },
      { day: 3, dayLabel: THU, focus: { en: "Starts + bounds + jump squats", is: "Stört + skrefstökk + hnébeygjuhopp" }, blocks: [A.starts("6", "15–20"), A.bounds(5), jumpSquats(false)] },
    ] },
    { label: wk("Week 6: lighter + test", "Vika 6: léttari + mæling"), sessions: [
      { day: 0, dayLabel: MON, focus: { en: "Test + starts, light gym", is: "Mæling + stört, léttur salur" }, blocks: [A.test10, A.starts("3", "10"), accelHeavy(true)] },
      { day: 3, dayLabel: THU, focus: { en: "Starts + bounds (short)", is: "Stört + skrefstökk (stutt)" }, blocks: [A.starts("4", "10–15"), A.bounds(2)] },
    ] },
  ],
  limits: [
    { en: "Sled sprints are not shown to beat the same sprints without a sled (Alcaraz 2018; Petrakos 2016).", is: "Sleðasprettir eru ekki sýndir betri en sömu sprettir án sleða (Alcaraz 2018; Petrakos 2016)." },
    { en: "The strength-to-sprint link is from group results, and a 2022 re-analysis found Seitz 2014's effect sizes inflated.", is: "Tengsl styrks og spretta byggja á hópniðurstöðum, og endurgreining 2022 fann áhrifastærðir Seitz 2014 ofmetnar." },
  ],
  refs: ["mendiguchia2020", "haugen2019", "alcaraz2018", "petrakos2016", "seitz2014", "hicks2020", "loturco2016"],
};

// ─── Braking ───────────────────────────────────────────────────────────────

const B = BRAKING_BLOCKS;
const QUARTER: Bi = { en: "75% effort, planned", is: "75% átak, fyrirfram ákveðið" };

/** Dos'Santos 2019's 6 weeks as two sessions a week: [session 1 blocks, session 2 blocks] per week. */
function brakingSixWeeks(withGym: boolean): Array<[GoalBlock[], GoalBlock[]]> {
  const lands = B.landings(null);
  const second = (blocks: GoalBlock[]): GoalBlock[] => (withGym ? [...blocks, lands, B.eccentric(null)] : [...blocks, lands]);
  const first = (blocks: GoalBlock[]): GoalBlock[] => (withGym ? [...blocks, B.eccentric(null)] : blocks);
  return [
    [first([B.cutTest, B.CUES, B.drills(B.W1.slice(0, 2), B.SUB)]), second([B.drills(B.W1, B.SUB)])],
    [first([B.CUES, B.drills(B.W1, QUARTER)]), second([B.drills(B.W2, B.FULL)])],
    [first([B.CUES, B.drills(B.W3A, B.FULL)]), second([B.drills(B.W3B, B.FULL)])],
    [first([B.CUES, B.drills(B.W4A, B.FULL)]), second([B.drills(B.W4B, B.REACT)])],
    [first([B.CUES, B.drills(B.W5A, B.REACT)]), second([B.drills(B.W5B, B.REACT)])],
    [[B.cutTest, B.CUES, B.drills(B.W7, B.FULL)], [lands]],
  ];
}

const BRAKING_WEEK_LABELS: Bi[] = [
  wk("Week 1: test + stops first", "Vika 1: mæling + stopp fyrst"),
  wk("Week 2: stops first", "Vika 2: stopp fyrst"),
  wk("Week 3: full effort", "Vika 3: fullt átak"),
  wk("Week 4: full effort + signals", "Vika 4: fullt átak + merki"),
  wk("Week 5: reacting to a partner", "Vika 5: viðbrögð við félaga"),
  wk("Week 6: lighter + test", "Vika 6: léttari + mæling"),
];

const DRILL_FOCUS: Bi = { en: "In place of the warm-up: braking drills", is: "Í stað upphitunar: bremsuæfingar" };
const DRILL_FOCUS_2: Bi = { en: "In place of the warm-up: braking + landings", is: "Í stað upphitunar: bremsun + lendingar" };

const BRAKING_IN_SEASON: QualityPlan = {
  quality: "braking",
  key: "in_season",
  start: null,
  title: { en: "Braking in season: a 6-week block", is: "Bremsun á tímabili: 6 vikna blokk" },
  who: { en: "Football team in season, match on Saturday (MD). One quality at a time.", is: "Fótboltalið á tímabili, leikur á laugardegi (MD). Einn eiginleiki í einu." },
  verdict: {
    en: "The tested programme: 2 × 20 minutes a week in place of the warm-up on MD-4 and MD-2, from easy stops to reacting to a partner.",
    is: "Prófaða áætlunin: 2 × 20 mínútur á viku í stað upphitunar á MD-4 og MD-2, frá léttum stoppum upp í viðbrögð við félaga.",
  },
  facts: [
    { en: "Youth footballers who did this for 6 weeks cut 9–12% faster with better technique (Dos'Santos 2019).", is: "Unglingar í fótbolta sem gerðu þetta í 6 vikur urðu 9–12% hraðari í stefnubreytingum með betri tækni (Dos'Santos 2019)." },
    { en: "It replaces the warm-up, so it adds little time. MD-4 and MD-3 already carry the team's most braking; never on MD-1.", is: "Það kemur í stað upphitunar, svo það bætir litlum tíma við. MD-4 og MD-3 bera nú þegar mesta bremsuálag liðsins; aldrei á MD-1." },
    { en: "Cut test in week 1 and week 6.", is: "Stefnubreytingarpróf í viku 1 og viku 6." },
  ],
  basis: TEAM_PLAN_BASIS,
  matchDay: MATCH_DAY,
  weeks: brakingSixWeeks(false).map(([s1, s2], i) => ({
    label: BRAKING_WEEK_LABELS[i],
    sessions: [
      { day: 1, dayLabel: MD4, focus: DRILL_FOCUS, blocks: s1 },
      { day: 3, dayLabel: MD2, focus: DRILL_FOCUS_2, blocks: s2 },
    ],
  })),
  limits: [
    { en: "In adults, trials have not shown braking itself getting better, but none of them trained braking on purpose (Marvin 2024).", is: "Hjá fullorðnum hafa rannsóknir ekki sýnt að bremsunin sjálf batni, en engin þeirra æfði bremsun sérstaklega (Marvin 2024)." },
    { en: "The reacting-to-a-partner weeks were part of the programme but were not measured on their own. No trial measured injuries.", is: "Vikurnar með viðbrögðum við félaga voru hluti af áætluninni en voru ekki mældar sérstaklega. Engin rannsókn mældi meiðsli." },
  ],
  refs: ["dossantos2019", "dossantos2021", "silva2022", "marvin2024", "asadi2016"],
};

const BRAKING_PRE_SEASON: QualityPlan = {
  quality: "braking",
  key: "pre_season",
  start: null,
  title: { en: "Braking in pre-season: 6 weeks", is: "Bremsun á undirbúningstímabili: 6 vikur" },
  who: { en: "Football team in pre-season, alongside normal team training.", is: "Fótboltalið á undirbúningstímabili, samhliða venjulegum liðsæfingum." },
  verdict: {
    en: "The same tested 6-week drills twice a week in place of the warm-up, plus landings and slow-lowering leg strength twice a week in the gym.",
    is: "Sömu prófuðu 6 vikna æfingarnar tvisvar í viku í stað upphitunar, auk lendinga og fótastyrks með hægri niðurleið tvisvar í viku í sal.",
  },
  facts: [
    { en: "The drills follow Dos'Santos 2019 and 2021 week by week: stops at 50–75%, then full effort, then reacting to a partner.", is: "Æfingarnar fylgja Dos'Santos 2019 og 2021 viku fyrir viku: stopp á 50–75%, svo fullt átak, svo viðbrögð við félaga." },
    { en: "Thigh strength while lowering is the clearest link with good braking (Harper 2022). A link, not proof.", is: "Styrkur framan á læri á niðurleið tengist góðri bremsun skýrast (Harper 2022). Tengsl, ekki sönnun." },
    { en: "Cut test in week 1 and week 6.", is: "Stefnubreytingarpróf í viku 1 og viku 6." },
  ],
  basis: TEAM_PLAN_BASIS,
  matchDay: null,
  weeks: brakingSixWeeks(true).map(([s1, s2], i) => ({
    label: BRAKING_WEEK_LABELS[i],
    sessions: [
      { day: 0, dayLabel: MON, focus: { en: "Braking drills, then gym", is: "Bremsuæfingar, svo salur" }, blocks: s1 },
      { day: 3, dayLabel: THU, focus: { en: "Braking + landings, then gym", is: "Bremsun + lendingar, svo salur" }, blocks: s2 },
    ],
  })),
  limits: [
    { en: "Slow-lowering strength helped sharp turns (90° or more) in adolescents, not shallow cuts, and rests on few studies (Chen 2025).", is: "Styrkur með hægri niðurleið hjálpaði í kröppum snúningum (90° eða meira) hjá unglingum, ekki í grunnum beygjum, og byggir á fáum rannsóknum (Chen 2025)." },
    { en: "In adults, trials have not shown braking itself getting better (Marvin 2024). No trial measured injuries.", is: "Hjá fullorðnum hafa rannsóknir ekki sýnt að bremsunin sjálf batni (Marvin 2024). Engin rannsókn mældi meiðsli." },
  ],
  refs: ["dossantos2019", "dossantos2021", "harper2022", "chen2025", "asadi2016", "marvin2024"],
};

// ─── Jump ──────────────────────────────────────────────────────────────────

const J = JUMP_BLOCKS;
const sq = (i: number): GoalBlock => J.squatSpeed(J.TESTED_SQUAT_DOSE[i][0], J.TESTED_SQUAT_DOSE[i][1]);

// Lota 4 (coach, 2026-11-15): jump team blocks run 8 weeks and every jump session reaches about 55 foot contacts
// (rebound jumps as tested, topped up with squat + countermovement jumps). Tests in weeks 1, 4 and 8.
const JUMP_WEEK_LABEL = (i: number): Bi =>
  i === 0 ? wk("Week 1: test + start", "Vika 1: mæling + byrjun")
    : i === 3 ? wk("Week 4: test", "Vika 4: mæling")
      : i === 7 ? wk("Week 8: lighter + test", "Vika 8: léttari + mæling")
        : wk(`Week ${i + 1}`, `Vika ${i + 1}`);
const JUMP_TEST_WEEK = (i: number) => i === 0 || i === 3 || i === 7;
/** In season: rebound sets per week (fewer than the trial's 5–7) and which tested squat dose (index into TESTED_SQUAT_DOSE). */
const JUMP_IN_SEASON_REBOUND = [3, 4, 4, 5, 5, 5, 5, 3];
const JUMP_IN_SEASON_SQUAT = [0, 1, 2, 3, 3, 4, 4, -1];
/** Pre-season: the trial's rebound sets for weeks 1–5, held at 7 for weeks 6–7, week 8 lighter (MicroPulse). */
const JUMP_PRE_SEASON_REBOUND = [5, 5, 6, 6, 7, 7, 7, 4];
const JUMP_PRE_SEASON_SQUAT = [0, 1, 2, 3, 4, 4, 4, 5];
const lightSquat = (): GoalBlock => J.squatSpeed("2 × 3, fast", "2 × 3, hratt");
const jumpSession = (i: number, sets: number): GoalBlock[] => {
  const light = i === 7;
  const jumps = light ? [J.rebound(sets), J.jumpMix(2)] : J.withTopUp([J.rebound(sets)]);
  return [...(JUMP_TEST_WEEK(i) ? [J.cmjTest] : []), ...jumps];
};

const JUMP_IN_SEASON: QualityPlan = {
  quality: "jump",
  key: "in_season",
  start: null,
  title: { en: "Jump height in season: an 8-week block", is: "Stökkhæð á tímabili: 8 vikna blokk" },
  who: { en: "Football team in season, match on Saturday (MD). One quality at a time.", is: "Fótboltalið á tímabili, leikur á laugardegi (MD). Einn eiginleiki í einu." },
  verdict: {
    en: "About 55 jumps after the warm-up on MD-4 and squats by bar speed in the gym the same day, for 8 weeks.",
    is: "Um 55 hopp eftir upphitun á MD-4 og hnébeygja eftir stangarhraða í sal sama dag, í 8 vikur.",
  },
  facts: [
    { en: "In one 6-week trial, jumps plus squats raised jump height +12.2% against +7.2% for jumps only (Sánchez-Sixto 2021); across many studies, weights added little on average.", is: "Í einni 6 vikna rannsókn hækkuðu hopp ásamt hnébeygju stökkið um 12,2% á móti 7,2% fyrir hopp ein (Sánchez-Sixto 2021); í mörgum rannsóknum bættu lyftingar litlu við að meðaltali." },
    { en: "8 weeks and over 50 jumps a session: reviews found more with longer blocks and more jumps (Thapa 2021, Sáez de Villarreal 2009). Once a week in season, so expect a smaller gain than in pre-season.", is: "8 vikur og yfir 50 hopp á æfingu: yfirlit fundu meira með lengri blokkum og fleiri hoppum (Thapa 2021, Sáez de Villarreal 2009). Einu sinni í viku á tímabili, svo búast má við minni bætingu en á undirbúningstímabili." },
    { en: "Jump test in weeks 1, 4 and 8, same device each time.", is: "Stökkpróf í vikum 1, 4 og 8, sama tæki í hvert sinn." },
  ],
  basis: TEAM_PLAN_BASIS,
  matchDay: MATCH_DAY,
  weeks: JUMP_IN_SEASON_REBOUND.map((sets, i) => {
    const sqi = JUMP_IN_SEASON_SQUAT[i];
    const test = JUMP_TEST_WEEK(i);
    return {
      label: JUMP_WEEK_LABEL(i),
      sessions: [{
        day: 1,
        dayLabel: MD4,
        focus: i === 7 ? { en: "Test + jumps, light gym", is: "Mæling + hopp, léttur salur" } : test ? { en: "Test + jumps, then gym", is: "Mæling + hopp, svo salur" } : { en: "Jumps, then gym", is: "Hopp, svo salur" },
        blocks: [...jumpSession(i, sets), sqi < 0 ? lightSquat() : sq(sqi)],
      }],
    };
  }),
  limits: [
    { en: "The weekly doses come mostly from one 6-week trial in women's basketball (Sánchez-Sixto 2021); the 8 weeks, the lower in-season volume and the extra jump types are MicroPulse's, from the reviews.", is: "Vikuskammtarnir koma að mestu úr einni 6 vikna rannsókn í kvennakörfubolta (Sánchez-Sixto 2021); 8 vikurnar, minna magn á tímabili og auka hopptegundirnar eru MicroPulse, úr yfirlitunum." },
  ],
  refs: ["sanchezsixto2021", "saezdevillarreal2009", "thapa2021", "ma2025", "bedoya2015", "jimenezreyes2017", "marshall2021"],
};

const JUMP_PRE_SEASON: QualityPlan = {
  quality: "jump",
  key: "pre_season",
  start: null,
  title: { en: "Jump height in pre-season: 8 weeks", is: "Stökkhæð á undirbúningstímabili: 8 vikur" },
  who: { en: "Football team in pre-season, alongside normal team training.", is: "Fótboltalið á undirbúningstímabili, samhliða venjulegum liðsæfingum." },
  verdict: {
    en: "Twice a week for 8 weeks: about 55 jumps (rebound jumps building from 5 to 7 sets, plus squat and countermovement jumps), then squats that get heavier as the bar slows.",
    is: "Tvisvar í viku í 8 vikur: um 55 hopp (endurkastshopp sem fara úr 5 í 7 sett, auk hoppa úr hnébeygjustöðu og CMJ-hoppa), svo hnébeygja sem þyngist eftir því sem stöngin hægist.",
  },
  facts: [
    { en: "Jumps plus squats: +12.2% in 6 weeks, against +7.2% for jumps plus drop jumps (Sánchez-Sixto 2021).", is: "Hopp ásamt hnébeygju: +12,2% á 6 vikum, á móti +7,2% fyrir hopp ásamt fallhoppum (Sánchez-Sixto 2021)." },
    { en: "Over 50 jumps a session and a mix of jump types went with bigger gains across studies (Sáez de Villarreal 2009).", is: "Yfir 50 hopp á æfingu og blanda af hopptegundum fóru saman við meiri bætingu milli rannsókna (Sáez de Villarreal 2009)." },
    { en: "Jump test in weeks 1, 4 and 8, same device each time.", is: "Stökkpróf í vikum 1, 4 og 8, sama tæki í hvert sinn." },
  ],
  basis: TEAM_PLAN_BASIS,
  matchDay: null,
  weeks: JUMP_PRE_SEASON_REBOUND.map((sets, i) => {
    const test = JUMP_TEST_WEEK(i);
    const gym = sq(JUMP_PRE_SEASON_SQUAT[i]);
    return {
      label: JUMP_WEEK_LABEL(i),
      sessions: [
        { day: 0, dayLabel: MON, focus: test ? { en: "Test + jumps, then gym", is: "Mæling + hopp, svo salur" } : { en: "Jumps, then gym", is: "Hopp, svo salur" }, blocks: [...jumpSession(i, sets), gym] },
        { day: 3, dayLabel: THU, focus: { en: "Jumps, then gym", is: "Hopp, svo salur" }, blocks: [...(i === 7 ? [J.rebound(sets), J.jumpMix(2)] : J.withTopUp([J.rebound(sets)])), gym] },
      ],
    };
  }),
  limits: [
    { en: "One 6-week trial in women's basketball (Sánchez-Sixto 2021); weeks 7–8 and the extra jump types are MicroPulse's, from the reviews. Results in footballers may differ.", is: "Ein 6 vikna rannsókn í kvennakörfubolta (Sánchez-Sixto 2021); vikur 7–8 og auka hopptegundirnar eru MicroPulse, úr yfirlitunum. Niðurstöður hjá fótboltafólki gætu verið aðrar." },
    { en: "Without a gym, drop jumps (boxes 20 to 40 cm) can replace the squats: the +7.2% pairing in the same trial.", is: "Án salar geta fallhopp (kassar 20 upp í 40 cm) komið í stað hnébeygjunnar: +7,2% samsetningin í sömu rannsókn." },
    { en: "Players short of strength may gain more from lifting heavy first (Jiménez-Reyes 2017): see \"Individual\".", is: "Leikmenn sem vantar styrk gætu grætt meira á því að lyfta þungt fyrst (Jiménez-Reyes 2017): sjá „Einstaklingur\"." },
  ],
  refs: ["sanchezsixto2021", "saezdevillarreal2009", "markovic2007", "jimenezreyes2017", "marshall2021", "bedoya2015"],
};

// ─── Individual: the goal plan's own 8 weeks ───────────────────────────────

type StartKey = AccelStart | BrakingStart | JumpStart;

export const INDIVIDUAL_STARTS: Record<LibraryQuality, { key: StartKey; label: Bi; who: Bi }[]> = {
  acceleration: [
    { key: "strength_first", label: ACCEL_START_LABEL.strength_first, who: { en: "For a player whose strength test is average or below: heavy lifts and sled sprints first.", is: "Fyrir leikmann með styrkpróf í meðallagi eða undir: þungar lyftur og sleðasprettir fyrst." } },
    { key: "starts_first", label: ACCEL_START_LABEL.starts_first, who: { en: "For a player whose strength test is above average: fast starts and bounds.", is: "Fyrir leikmann með styrkpróf yfir meðallagi: hröð stört og skrefstökk." } },
    { key: "balanced", label: ACCEL_START_LABEL.balanced, who: { en: "When there is no strength test: sled sprints and strength mixed with fast starts.", is: "Þegar engin styrkmæling er til: sleðasprettir og styrkur í bland við hröð stört." } },
    { key: "youth", label: ACCEL_START_LABEL.youth, who: { en: "Under 18 or age not on record: short sprints and low hops with technique strength, no sled.", is: "Undir 18 ára eða aldur ekki skráður: stuttir sprettir og lág hopp með tæknistyrk, enginn sleði." } },
  ],
  braking: [
    { key: "standard", label: BRAKING_START_LABEL.standard, who: { en: "The tested progression: stops at 50–75%, then full effort, then reacting to a partner.", is: "Prófaði stiginn: stopp á 50–75%, svo fullt átak, svo viðbrögð við félaga." } },
    { key: "technique_only", label: BRAKING_START_LABEL.technique_only, who: { en: "For a player already braking hard more than usual over 4 weeks: technique at 50–75% only, no extra hard stops.", is: "Fyrir leikmann sem bremsar nú þegar harðar en venjulega í 4 vikur: aðeins tækni á 50–75%, engin auka hörð stopp." } },
  ],
  jump: [
    { key: "combined", label: JUMP_START_LABEL.combined, who: { en: "Rebound jumps plus squats by bar speed: the pairing that did best in its trial (+12.2%).", is: "Endurkastshopp ásamt hnébeygju eftir stangarhraða: samsetningin sem gaf mest í sinni rannsókn (+12,2%)." } },
    { key: "strength_first", label: JUMP_START_LABEL.strength_first, who: { en: "For a player whose strength test is average or below: rebound jumps plus heavy lifts.", is: "Fyrir leikmann með styrkpróf í meðallagi eða undir: endurkastshopp ásamt þungum lyftum." } },
    { key: "fast_jumps", label: JUMP_START_LABEL.fast_jumps, who: { en: "For a strong player who is slow off the ground: drop jumps and rebound jumps, strength kept.", is: "Fyrir sterkan leikmann sem er hægur upp af jörðinni: fallhopp og endurkastshopp, styrknum haldið." } },
    { key: "youth", label: JUMP_START_LABEL.youth, who: { en: "Under 18 or age not on record: body-weight hops building from 56 contacts; drop jumps only in the last weeks.", is: "Undir 18 ára eða aldur ekki skráður: hopp með eigin þyngd sem byggjast upp frá 56 snertingum; fallhopp aðeins í síðustu vikunum." } },
  ],
};

const INDIVIDUAL_TEST: Record<LibraryQuality, Bi> = {
  acceleration: { en: "Timed 10 m in week 1 and week 8.", is: "Tímamældur 10 m í viku 1 og viku 8." },
  braking: { en: "Cut test in week 1 and week 8.", is: "Stefnubreytingarpróf í viku 1 og viku 8." },
  jump: { en: "Jump test in weeks 1, 4 and 8, same device each time.", is: "Stökkpróf í vikum 1, 4 og 8, sama tæki í hvert sinn." },
};

const INDIVIDUAL_REFS: Record<LibraryQuality, string[]> = {
  acceleration: ["mendiguchia2020", "alcaraz2018", "petrakos2016", "seitz2014", "wangk2026", "hicks2020"],
  braking: ["dossantos2019", "dossantos2021", "harper2022", "marvin2024", "chen2025"],
  jump: ["sanchezsixto2021", "jimenezreyes2017", "bedoya2015", "wangk2026", "lloyd2012"],
};

const QUALITY_TITLE: Record<LibraryQuality, Bi> = {
  acceleration: { en: "Acceleration", is: "Hröðun" },
  braking: { en: "Braking", is: "Bremsun" },
  jump: { en: "Jump height", is: "Stökkhæð" },
};

/** The goal plan's 8 weeks for one start, all three session slots (C is out of season only, as its "when" says). */
export function individualWeeks(quality: LibraryQuality, start: string): GoalWeek[] {
  const youth = start === "youth";
  const raw = quality === "acceleration"
    ? accelWeeks(start as AccelStart, youth)
    : quality === "braking"
      ? brakingWeeks(start as BrakingStart, null)
      : jumpWeeks(start as JumpStart);
  return applySupervision(raw, youth);
}

const SLOT_LABEL: Record<"A" | "B" | "C", Bi> = {
  A: { en: "Session A", is: "Æfing A" },
  B: { en: "Session B", is: "Æfing B" },
  C: { en: "Session C", is: "Æfing C" },
};

export function individualPlan(quality: LibraryQuality, start?: string | null): QualityPlan {
  const options = INDIVIDUAL_STARTS[quality];
  const pick = options.find((o) => o.key === start) ?? options[0];
  const weeks: QualityWeek[] = individualWeeks(quality, pick.key).map((w) => ({
    label: w.label,
    sessions: w.sessions.map((s) => ({ day: null, dayLabel: SLOT_LABEL[s.slot], focus: s.focus, when: s.when, blocks: s.blocks })),
  }));
  return {
    quality,
    key: "individual",
    start: pick.key,
    title: { en: `${QUALITY_TITLE[quality].en}, individual: 8 weeks (${pick.label.en})`, is: `${QUALITY_TITLE[quality].is}, einstaklingur: 8 vikur (${pick.label.is})` },
    who: { en: "One player, on top of team training: the same plan a player's goal plan uses.", is: "Einn leikmaður, ofan á liðsæfingar: sama áætlun og markmiðsáætlun leikmanns notar." },
    verdict: {
      en: "Two short sessions a week on top of team training for 8 weeks (a third out of season).",
      is: "Tvær stuttar æfingar á viku ofan á liðsæfingar í 8 vikur (þriðja utan tímabils).",
    },
    facts: [
      pick.who,
      { en: "In a player's goal plan, MicroPulse picks this start from the player's own tests; the coach can change it with a reason.", is: "Í markmiðsáætlun leikmanns velur MicroPulse upphafið út frá prófum leikmannsins; þjálfarinn getur breytt því með rökstuðningi." },
      pick.key === "technique_only"
        ? { en: "No cut test in this start: it only teaches technique, and the GPS hard-braking count is checked each week.", is: "Ekkert stefnubreytingarpróf í þessu upphafi: það kennir aðeins tækni, og fjöldi harðra bremsa úr GPS er skoðaður í hverri viku." }
        : INDIVIDUAL_TEST[quality],
    ],
    basis: PLAN_BASIS,
    matchDay: null,
    weeks,
    limits: [],
    refs: INDIVIDUAL_REFS[quality],
  };
}

/** Same rule as the goal plans (`applySupervision`): flat-out sprints, hard stops and drop jumps with a coach there. */
function supervised(plan: QualityPlan): QualityPlan {
  const mark = (b: GoalBlock): GoalBlock => ((b.flatOutM ?? 0) > 0 || (b.hardStops ?? 0) > 0 || b.dropJumps === true ? { ...b, supervised: true } : b);
  return { ...plan, weeks: plan.weeks.map((w) => ({ ...w, sessions: w.sessions.map((s) => ({ ...s, blocks: s.blocks.map(mark) })) })) };
}

const TEAM_PLANS: Record<LibraryQuality, { in_season: QualityPlan; pre_season: QualityPlan }> = {
  acceleration: { in_season: supervised(ACCEL_IN_SEASON), pre_season: supervised(ACCEL_PRE_SEASON) },
  braking: { in_season: supervised(BRAKING_IN_SEASON), pre_season: supervised(BRAKING_PRE_SEASON) },
  jump: { in_season: supervised(JUMP_IN_SEASON), pre_season: supervised(JUMP_PRE_SEASON) },
};

/** One plan; `start` only matters for "individual" (unknown → the first start). */
export function qualityPlan(quality: LibraryQuality, key: QualityPlanKey, start?: string | null): QualityPlan {
  return key === "individual" ? individualPlan(quality, start) : TEAM_PLANS[quality][key];
}

/** Every plan, every individual start included (for tests and PDF checks). */
export function allQualityPlans(): QualityPlan[] {
  const out: QualityPlan[] = [];
  for (const q of ["acceleration", "braking", "jump"] as LibraryQuality[]) {
    out.push(TEAM_PLANS[q].in_season, TEAM_PLANS[q].pre_season);
    for (const s of INDIVIDUAL_STARTS[q]) out.push(individualPlan(q, s.key));
  }
  return out;
}

/** Method keys a plan uses, in first-use order. */
export function planMethodKeys(plan: QualityPlan): string[] {
  return [...new Set(plan.weeks.flatMap((w) => w.sessions.flatMap((s) => s.blocks.map((b) => b.method))))];
}
