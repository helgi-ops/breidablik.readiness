/**
 * Goal plan: top speed (football outfield only). Doses come from the top-speed methods library
 * (`speedMethods`), the one source for sprint doses in MicroPulse; this file only picks the start from the
 * player's data and lays the doses into an 8-week add-on.
 *
 * Start: days since a run at 90% of own top speed (`nearMaxExposure`). Over 10 days, or none on record →
 * two build-up weeks first, test in week 3. Emphasis of session B: the strength read (DSI, else IMTP band).
 */

import { DUE_DAYS, LONG_GAP_DAYS } from "@/lib/micropulse/nearMaxExposure";
import { MAX_FLYING_M_PER_SESSION, SPEED_REFS, type SpeedRefKey } from "@/lib/micropulse/speedMethods";
import { BAND_LABEL, WHEN, expandWeeks, weekLabel } from "./common";
import type { Bi, GoalBlock, GoalPlanInput, GoalRef, GoalSession, GoalWeek } from "./types";

export type TopSpeedStart = "build_first" | "ready";
export type SessionBEmphasis = "strength" | "power" | "balanced";

const flying = (reps: number, metres: number, buildUp: string): GoalBlock => ({
  method: "flying_sprints",
  topSpeed: true,
  flatOutM: reps * metres,
  what: { en: "Flying sprints", is: "Fljúgandi sprettir" },
  dose: {
    en: `${reps} × ${metres} m flat out · ${buildUp} m build-up · 4+ min rest`,
    is: `${reps} × ${metres} m á fullu · ${buildUp} m aðhlaup · 4+ mín hvíld`,
  },
});

const buildUps = (reps: string): GoalBlock => ({
  method: "flying_sprints",
  what: { en: "Build-up runs (not flat out)", is: "Uppbyggingarsprettir (ekki á fullu)" },
  dose: { en: `${reps} × 60 m, reaching 80–90% of top speed · walk back`, is: `${reps} × 60 m, upp í 80–90% af hámarkshraða · ganga til baka` },
});

const starts90: GoalBlock = {
  method: "accel_sprints",
  what: { en: "Short sprints from a standing start", is: "Stuttir sprettir frá kyrrstöðu" },
  dose: { en: "3 × 20 m at 90% · walk back", is: "3 × 20 m á 90% · ganga til baka" },
};

const speedTest = (reps: number): GoalBlock => ({
  method: "flying_sprints",
  topSpeed: true,
  test: true,
  flatOutM: reps * 20,
  what: { en: "Speed test", is: "Hraðapróf" },
  dose: {
    en: `${reps} × flying 20 m (timing gates or GPS top speed) · 30 m build-up · full rest · keep the best`,
    is: `${reps} × fljúgandi 20 m (tímahlið eða hámarkshraði úr GPS) · 30 m aðhlaup · full hvíld · besti gildir`,
  },
});

/** Session B by emphasis. `light` = test week / ease-off week. */
function sessionB(emphasis: SessionBEmphasis, light: boolean): GoalSession {
  const blocks: GoalBlock[] =
    emphasis === "strength"
      ? [
          { method: "heavy_strength", what: { en: "Heavy legs", is: "Þungar fætur" }, dose: light
            ? { en: "Squat or trap-bar deadlift 2 × 3 heavy", is: "Hnébeygja eða trap bar 2 × 3 þungt" }
            : { en: "Squat or trap-bar deadlift 3–4 × 3–5 heavy · Romanian deadlift 3 × 6", is: "Hnébeygja eða trap bar 3–4 × 3–5 þungt · rúmensk réttstöðulyfta 3 × 6" } },
          { method: "nordic", what: { en: "Nordic curls (for the hamstrings, not for speed)", is: "Nordic (fyrir aftanlærið, ekki fyrir hraða)" }, dose: { en: light ? "2 × 3" : "2–3 × 4", is: light ? "2 × 3" : "2–3 × 4" } },
        ]
      : emphasis === "power"
        ? [
            { method: "plyometrics", contacts: light ? 40 : 60, what: { en: "Jumps and forward bounds", is: "Hopp og skrefstökk áfram" }, dose: { en: `${light ? 40 : 60} foot contacts`, is: `${light ? 40 : 60} snertingar` } },
            { method: "jump_squat", what: { en: "Light jump squats", is: "Hnébeygjuhopp með léttri þyngd" }, dose: { en: `${light ? 2 : 4} × 5, fast`, is: `${light ? 2 : 4} × 5, hratt` } },
          ]
        : [
            { method: "heavy_strength", what: { en: "Heavy legs", is: "Þungar fætur" }, dose: { en: light ? "Squat or trap-bar deadlift 2 × 3" : "Squat or trap-bar deadlift 2–3 × 3–5 heavy", is: light ? "Hnébeygja eða trap bar 2 × 3" : "Hnébeygja eða trap bar 2–3 × 3–5 þungt" } },
            { method: "jump_squat", what: { en: "Light jump squats", is: "Hnébeygjuhopp með léttri þyngd" }, dose: { en: `${light ? 2 : 3} × 5, fast`, is: `${light ? 2 : 3} × 5, hratt` } },
          ];
  return {
    slot: "B",
    focus: emphasis === "strength" ? { en: "Gym: strength", is: "Salur: styrkur" } : emphasis === "power" ? { en: "Gym: fast and light", is: "Salur: hratt og létt" } : { en: "Gym: strength + fast", is: "Salur: styrkur + hratt" },
    when: WHEN.gym_day,
    minutes: 20,
    blocks,
  };
}

const sessionA = (focus: Bi, blocks: GoalBlock[]): GoalSession => ({ slot: "A", focus, when: WHEN.speed_day, minutes: 15, blocks });
/** Out of season only: a second top-speed session, shorter. */
const sessionC = (blocks: GoalBlock[]): GoalSession => ({ slot: "C", focus: { en: "Sprint (short)", is: "Sprettir (stutt)" }, when: WHEN.off_day, minutes: 12, blocks });

export function topSpeedStart(input: GoalPlanInput): TopSpeedStart {
  const t = input.topSpeed;
  if (!t || t.daysSince == null || t.daysSince > DUE_DAYS) return "build_first";
  return "ready";
}

/** DSI wins when on record (it is the player's own ratio); else the IMTP band; else balanced. */
export function strengthEmphasis(input: GoalPlanInput): SessionBEmphasis {
  const s = input.strength;
  if (s?.dsiTier === "max_strength") return "strength";
  if (s?.dsiTier === "ballistic") return "power";
  if (s?.dsiTier === "concurrent") return "balanced";
  if (s?.imtpBand === "below" || s?.imtpBand === "average") return "strength";
  if (s?.imtpBand === "good" || s?.imtpBand === "elite") return "power";
  return "balanced";
}

export function topSpeedWeeks(start: TopSpeedStart, emphasis: SessionBEmphasis): GoalWeek[] {
  const B = sessionB(emphasis, false);
  const Blight = sessionB(emphasis, true);
  const rows =
    start === "build_first"
      ? [
          { weeks: [1, 2], label: (w: number) => weekLabel(w, "build-up", "uppbygging"), sessions: [sessionA({ en: "Build-up runs", is: "Uppbyggingarsprettir" }, [buildUps("4–6"), starts90]), B, sessionC([buildUps("4")])] },
          { weeks: [3], label: (w: number) => weekLabel(w, "test + short flying sprints", "mæling + stuttir fljúgandi sprettir"), sessions: [sessionA({ en: "Test + sprint", is: "Mæling + sprettir" }, [speedTest(2), flying(3, 10, "20")]), B, sessionC([flying(3, 10, "20")])] },
          { weeks: [4], label: (w: number) => weekLabel(w, "", ""), sessions: [sessionA({ en: "Sprint", is: "Sprettir" }, [flying(4, 15, "20–30")]), B, sessionC([flying(3, 15, "20–30")])] },
          { weeks: [5, 6], label: (w: number) => weekLabel(w, "", ""), sessions: [sessionA({ en: "Sprint", is: "Sprettir" }, [flying(4, 20, "30")]), B, sessionC([flying(3, 20, "30")])] },
          { weeks: [7], label: (w: number) => weekLabel(w, "ease off", "minna magn"), sessions: [sessionA({ en: "Sprint", is: "Sprettir" }, [flying(3, 20, "30")]), Blight] },
          { weeks: [8], label: (w: number) => weekLabel(w, "test", "mæling"), sessions: [sessionA({ en: "Test", is: "Mæling" }, [speedTest(3)]), Blight] },
        ]
      : [
          { weeks: [1], label: (w: number) => weekLabel(w, "test + short flying sprints", "mæling + stuttir fljúgandi sprettir"), sessions: [sessionA({ en: "Test + sprint", is: "Mæling + sprettir" }, [speedTest(2), flying(3, 10, "20")]), B, sessionC([flying(3, 10, "20")])] },
          { weeks: [2, 3], label: (w: number) => weekLabel(w, "", ""), sessions: [sessionA({ en: "Sprint", is: "Sprettir" }, [flying(4, 15, "20–30")]), B, sessionC([flying(3, 15, "20–30")])] },
          { weeks: [4, 5], label: (w: number) => weekLabel(w, "", ""), sessions: [sessionA({ en: "Sprint", is: "Sprettir" }, [flying(4, 20, "30")]), B, sessionC([flying(3, 20, "30")])] },
          { weeks: [6], label: (w: number) => weekLabel(w, "", ""), sessions: [sessionA({ en: "Sprint", is: "Sprettir" }, [flying(3, 30, "30–40")]), B, sessionC([flying(3, 20, "30")])] },
          { weeks: [7], label: (w: number) => weekLabel(w, "ease off", "minna magn"), sessions: [sessionA({ en: "Sprint", is: "Sprettir" }, [flying(3, 20, "30")]), Blight] },
          { weeks: [8], label: (w: number) => weekLabel(w, "test", "mæling"), sessions: [sessionA({ en: "Test", is: "Mæling" }, [speedTest(3)]), Blight] },
        ];
  return expandWeeks(rows);
}

export const TOP_SPEED_REF_KEYS: SpeedRefKey[] = ["nicholson2022", "haugen2019", "mendiguchia2020", "saez2012", "loturco2016", "ronnestad2011", "malone2017", "buchheit2023", "gomezpiqueras2024", "seitz2014"];

export function topSpeedRefs(): GoalRef[] {
  return TOP_SPEED_REF_KEYS.map((k) => ({ ...SPEED_REFS[k] }));
}

export const TOP_SPEED_SAFETY: Bi[] = [
  {
    en: `At most ${MAX_FLYING_M_PER_SESSION} m flat out in a session, and at least 2 days between top-speed days (a match counts as one).`,
    is: `Mest ${MAX_FLYING_M_PER_SESSION} m á fullum hraða á æfingu, og minnst 2 dagar milli hámarkshraðadaga (leikur telst sem einn).`,
  },
  {
    en: `If more than ${LONG_GAP_DAYS} days pass without a run at 90% of top speed during the plan, the next speed session becomes build-up runs.`,
    is: `Ef meira en ${LONG_GAP_DAYS} dagar líða án spretts á 90% af hámarkshraða á meðan áætlunin er í gangi verður næsta hraðaæfing uppbyggingarsprettir.`,
  },
  {
    en: "Running near top speed regularly is associated with fewer hamstring injuries; a sudden jump after a long gap, or too much, is associated with more (Malone 2017; Buchheit 2023).",
    is: "Reglulegir sprettir nálægt hámarkshraða tengjast færri aftanlærismeiðslum; snögg aukning eftir langt hlé, eða of mikið, tengist fleiri (Malone 2017; Buchheit 2023).",
  },
];

/** Plain-language explanation of the start and the emphasis, for the verdict and facts. */
export function topSpeedReasons(input: GoalPlanInput, start: TopSpeedStart, emphasis: SessionBEmphasis): { startWhy: Bi; emphasisWhy: Bi; counterfactual: Bi } {
  const t = input.topSpeed;
  const startWhy: Bi = !t
    ? { en: "No top-speed reading on record yet, so the plan starts with two build-up weeks and the week-3 test becomes the baseline.", is: "Enginn hámarkshraði skráður enn, svo áætlunin byrjar á tveimur uppbyggingarvikum og prófið í viku 3 verður grunnlínan." }
    : t.daysSince == null
      ? { en: `No run at 90% of top speed (${t.targetKmh} km/h) in the last 12 months, so two build-up weeks come first.`, is: `Enginn sprettur á 90% af hámarkshraða (${t.targetKmh} km/klst) síðustu 12 mánuði, svo tvær uppbyggingarvikur koma fyrst.` }
      : start === "build_first"
        ? { en: `Last run at 90% of top speed was ${t.daysSince} days ago (more than ${DUE_DAYS}), so two build-up weeks come first.`, is: `Síðasti sprettur á 90% af hámarkshraða var fyrir ${t.daysSince} dögum (meira en ${DUE_DAYS}), svo tvær uppbyggingarvikur koma fyrst.` }
        : { en: `Ran at 90% of top speed ${t.daysSince} days ago, so flying sprints can start in week 1.`, is: `Hljóp á 90% af hámarkshraða fyrir ${t.daysSince} dögum, svo fljúgandi sprettir geta byrjað í viku 1.` };

  const s = input.strength;
  const emphasisWhy: Bi =
    s?.dsiTier
      ? emphasis === "strength"
        ? { en: "Force-plate tests show the player already uses most of the strength there is, so raising strength is the next step (session B: heavy legs).", is: "Kraftplötumælingar sýna að leikmaðurinn nýtir nú þegar mest af styrknum sem er til, svo næsta skref er að auka styrkinn (æfing B: þungar fætur)." }
        : emphasis === "power"
          ? { en: "Force-plate tests show more strength than the player turns into speed, so session B is fast and light (jumps, jump squats).", is: "Kraftplötumælingar sýna meiri styrk en leikmaðurinn nær að breyta í hraða, svo æfing B er hröð og létt (hopp, hnébeygjuhopp)." }
          : { en: "Force-plate tests show strength and speed of force in balance, so session B mixes both.", is: "Kraftplötumælingar sýna styrk og hraða kraftsins í jafnvægi, svo æfing B blandar hvoru tveggja." }
      : s?.imtpBand
        ? { en: `The force-plate strength test is ${BAND_LABEL[s.imtpBand].en} for the player's group, so session B is ${emphasis === "strength" ? "heavy legs" : emphasis === "power" ? "fast and light" : "a mix"}.`, is: `Styrkpróf á kraftplötu er ${BAND_LABEL[s.imtpBand].is} miðað við hóp leikmannsins, svo æfing B er ${emphasis === "strength" ? "þungar fætur" : emphasis === "power" ? "hröð og létt" : "blanda"}.` }
        : { en: "No strength test on record, so session B mixes heavy and fast work.", is: "Engin styrkmæling skráð, svo æfing B blandar þungu og hröðu." };

  const counterfactual: Bi = start === "build_first"
    ? { en: `If the last run at 90% had been within ${DUE_DAYS} days, flying sprints would start in week 1 instead of two build-up weeks.`, is: `Ef síðasti sprettur á 90% hefði verið innan ${DUE_DAYS} daga byrjuðu fljúgandi sprettir í viku 1 í stað tveggja uppbyggingarvikna.` }
    : { en: `If the last run at 90% had been more than ${DUE_DAYS} days ago, the plan would start with two build-up weeks.`, is: `Ef síðasti sprettur á 90% hefði verið fyrir meira en ${DUE_DAYS} dögum byrjaði áætlunin á tveimur uppbyggingarvikum.` };

  return { startWhy, emphasisWhy, counterfactual };
}
