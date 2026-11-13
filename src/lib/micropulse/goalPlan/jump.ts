/**
 * Goal plan: vertical jump (CMJ). Football and basketball.
 *
 * Read in full for this (Nov 2026): Bedoya 2015 (youth soccer plyometrics), Ebben (plyometric volume),
 * Marshall 2021 (training sequences), Jiménez-Reyes 2017 (individualised by force–velocity profile),
 * Lloyd & Oliver 2012 (Youth Physical Development model), Sánchez-Sixto 2021 (female basketball).
 *
 * Start (MicroPulse rule): the only TESTED data-based choice is Jiménez-Reyes' loaded squat-jump force–velocity
 * profile, which MicroPulse does not measure. So the start uses the force-plate numbers it has, in the same
 * spirit: strength low → strength first; strong but jumps slow off the ground → fast short-contact jumps; else
 * the combined squat + rebound-jump programme (Sánchez-Sixto 2021). Under 18 or age unknown → the youth
 * progression (Bedoya 2015), body weight only, whatever the data say.
 */

import { SPEED_REFS } from "@/lib/micropulse/speedMethods";
import { ACCEL_REFS } from "./acceleration";
import { BAND_LABEL, WHEN, expandWeeks, isYouth, pickStart, weekLabel } from "./common";
import type { GoalParts } from "./index";
import type { Bi, GoalBlock, GoalMethod, GoalPlanInput, GoalRef, GoalSession } from "./types";

export const JUMP_REFS: Record<string, GoalRef> = {
  bedoya2015: { key: "bedoya2015", short: "Bedoya 2015", cite: "Bedoya AA, Miltenberger MR, Lopez RM. Plyometric training effects on athletic performance in youth soccer athletes: a systematic review. J Strength Cond Res 2015;29(8):2351–2360.", verifiedFrom: "full_text" },
  ebben: { key: "ebben", short: "Ebben (plyometric volume)", cite: "Ebben WP, Suchomel TJ, Garceau LR. The effect of plyometric training volume on jumping performance. Conference paper, pp. 566–569 (journal not printed; likely ISBS 2014 proceedings).", verifiedFrom: "full_text" },
  marshall2021: { key: "marshall2021", short: "Marshall 2021", cite: "Marshall J, Bishop C, Turner A, Haff GG. Optimal training sequences to develop lower body force, velocity, power, and jump height: a systematic review with meta-analysis. Sports Med 2021;51:1245–1271. doi:10.1007/s40279-021-01430-z", verifiedFrom: "full_text" },
  jimenezreyes2017: { key: "jimenezreyes2017", short: "Jiménez-Reyes 2017", cite: "Jiménez-Reyes P, Samozino P, Brughelli M, Morin J-B. Effectiveness of an individualized training based on force-velocity profiling during jumping. Front Physiol 2017;7:677. doi:10.3389/fphys.2016.00677", verifiedFrom: "full_text" },
  lloyd2012: { key: "lloyd2012", short: "Lloyd & Oliver 2012", cite: "Lloyd RS, Oliver JL. The Youth Physical Development Model: a new approach to long-term athletic development. Strength Cond J 2012;34(3):61–72.", verifiedFrom: "full_text" },
  sanchezsixto2021: { key: "sanchezsixto2021", short: "Sánchez-Sixto 2021", cite: "Sánchez-Sixto A, Harrison AJ, Floría P. Effects of plyometric vs. combined plyometric training on vertical jump biomechanics in female basketball players. J Hum Kinet 2021;77:25–35. doi:10.2478/hukin-2021-0009", verifiedFrom: "full_text" },
  suchomel2020: ACCEL_REFS.suchomel2020,
  wangk2026: ACCEL_REFS.wangk2026,
  oliver2024: { ...SPEED_REFS.oliver2024 },
};

export const JUMP_METHODS: GoalMethod[] = [
  {
    key: "rebound_jumps",
    label: { en: "Rebound jumps", is: "Endurkastshopp" },
    summary: { en: "Jump, land and jump straight up again: short ground contact, full height.", is: "Hoppa, lenda og hoppa strax upp aftur: stutt snerting, full hæð." },
    basis: "trial",
    dose: { en: "5–7 × 5 · 1 min between sets", is: "5–7 × 5 · 1 mín milli setta" },
    findings: [
      { ref: "sanchezsixto2021", text: { en: "Female basketball players, 6 weeks, twice a week: rebound jumps plus squats raised CMJ 12.2%; rebound jumps plus drop jumps 7.2%; no change without them.", is: "Körfuboltakonur, 6 vikur, tvisvar í viku: endurkastshopp ásamt hnébeygju hækkuðu CMJ um 12,2%; endurkastshopp ásamt fallhoppum 7,2%; engin breyting án þeirra." } },
    ],
  },
  {
    key: "drop_jumps",
    label: { en: "Drop jumps", is: "Fallhopp" },
    summary: { en: "Step off a low box, land and jump up at once. Box height rises over the weeks.", is: "Stígðu af lágum kassa, lentu og hoppaðu strax upp. Kassinn hækkar yfir vikurnar." },
    basis: "trial",
    dose: { en: "3–4 × 3–6 · box 20 → 40 cm", is: "3–4 × 3–6 · kassi 20 → 40 cm" },
    findings: [
      { ref: "sanchezsixto2021", text: { en: "Box 20 cm in week 1 up to 40 cm by week 4, 3–4 × 3–6, alongside rebound jumps: CMJ +7.2% in 6 weeks.", is: "Kassi 20 cm í viku 1 upp í 40 cm í viku 4, 3–4 × 3–6, ásamt endurkastshoppum: CMJ +7,2% á 6 vikum." } },
    ],
    caution: { en: "Under 18: no drop jumps before the last two weeks of the youth level, with a coach there.", is: "Undir 18 ára: engin fallhopp fyrr en í síðustu tveimur vikum unglingastigsins, og þjálfari á staðnum." },
  },
  {
    key: "squat_bar_speed",
    label: { en: "Squats by bar speed", is: "Hnébeygja eftir stangarhraða" },
    summary: { en: "Full squats with a weight you can still move fast, getting heavier over the weeks.", is: "Djúp hnébeygja með þyngd sem enn má hreyfa hratt, þyngist yfir vikurnar." },
    basis: "trial",
    dose: { en: "3 × 6 (fast, about 50–65% of max) → 3–4 × 3–4 (heavier)", is: "3 × 6 (hratt, um 50–65% af hámarki) → 3–4 × 3–4 (þyngra)" },
    findings: [
      { ref: "sanchezsixto2021", text: { en: "Squats kept force up while jumps alone lowered it; the combined group jumped more (12.2% vs 7.2%).", is: "Hnébeygjan hélt kraftinum uppi en hopp ein lækkuðu hann; samsetti hópurinn stökk hærra (12,2% á móti 7,2%)." } },
    ],
  },
  {
    key: "heavy_strength",
    label: { en: "Heavy leg strength", is: "Þungur fótastyrkur" },
    summary: { en: "Heavy squats or deadlifts for players whose strength test is low.", is: "Þungar hnébeygjur eða réttstöðulyftur fyrir leikmenn með lágt styrkpróf." },
    basis: "trial",
    dose: { en: "3–4 × 3–5 at 80–90% of max", is: "3–4 × 3–5 á 80–90% af hámarki" },
    findings: [
      { ref: "jimenezreyes2017", text: { en: "Adult footballers and rugby players short of force trained mostly heavy for 9 weeks: squat jump +14.2%, all 22 improved. A plan matched to the profile beat the same mixed plan for everyone (+2.3%).", is: "Fullorðnir fótbolta- og ruðningsleikmenn sem vantaði kraft æfðu mest þungt í 9 vikur: hnébeygjuhopp +14,2%, allir 22 bættu sig. Áætlun sniðin að prófílnum skilaði meiru en sama blandaða áætlunin fyrir alla (+2,3%)." } },
      { ref: "marshall2021", text: { en: "Review: being strong comes before heavy-then-fast pairs (contrast) pay off.", is: "Yfirlit: styrkur þarf að vera til staðar áður en þungt-svo-hratt pör (contrast) skila sér." } },
    ],
  },
  {
    key: "youth_hops",
    label: { en: "Youth hops progression", is: "Hoppstigi fyrir unglinga" },
    summary: { en: "Body-weight hops that build from 56 to about 110 foot contacts over 8 weeks.", is: "Hopp með eigin þyngd sem byggjast upp úr 56 í um 110 snertingar á 8 vikum." },
    basis: "review",
    dose: { en: "Start 50–60 contacts, never over 80–120 · body weight only · 72 h between sessions", is: "Byrja á 50–60 snertingum, aldrei yfir 80–120 · aðeins eigin þyngd · 72 klst milli æfinga" },
    findings: [
      { ref: "bedoya2015", text: { en: "Review of 7 youth soccer trials (10–17 y): plyometrics raised CMJ in most. Raise the number of jumps or their height, never both at once.", is: "Yfirlit 7 rannsókna á unglingum í fótbolta (10–17 ára): hopp hækkuðu CMJ í flestum. Fjölgaðu hoppum eða hækkaðu þau, aldrei hvoru tveggja í einu." } },
      { ref: "wangk2026", text: { en: "Youth soccer (55 trials for jumping): mixed neuromuscular training ranked first and strength plus plyometrics second. Low certainty; few trials reported injuries or safety.", is: "Unglingar í fótbolta (55 rannsóknir á stökki): blönduð taugavöðvaþjálfun var efst og styrkur ásamt hoppum næst. Lítil vissa; fáar rannsóknir skráðu meiðsli eða öryggi." } },
      { ref: "lloyd2012", text: { en: "Youth model: strength is a priority at every age; power work grows from the start of adolescence.", is: "Unglingalíkan: styrkur er forgangsatriði á öllum aldri; kraftþjálfun vex frá byrjun unglingsára." } },
    ],
  },
];

export type JumpStart = "youth" | "strength_first" | "fast_jumps" | "combined";

/** Starts the coach may choose: under 18 (or age unknown) always stays on the youth hops. */
export function jumpAllowed(input: GoalPlanInput): JumpStart[] {
  return isYouth(input.ageYears) ? ["youth"] : ["strength_first", "fast_jumps", "combined"];
}

export function jumpStart(input: GoalPlanInput): JumpStart {
  if (isYouth(input.ageYears)) return "youth";
  const s = input.strength;
  const lowStrength = s?.imtpBand === "below" || s?.imtpBand === "average";
  if (lowStrength || (s?.imtpBand == null && s?.dsiTier === "max_strength")) return "strength_first";
  const strong = s?.imtpBand === "good" || s?.imtpBand === "elite";
  const slowOffGround = input.cmj?.rsiBand === "below" || input.cmj?.rsiBand === "average";
  if ((strong && slowOffGround) || (s?.imtpBand == null && s?.dsiTier === "ballistic")) return "fast_jumps";
  return "combined";
}

const contactsOf = (sets: number, reps: number) => sets * reps;

const rebound = (sets: number): GoalBlock => ({
  method: "rebound_jumps",
  contacts: contactsOf(sets, 5),
  what: { en: "Rebound jumps", is: "Endurkastshopp" },
  dose: { en: `${sets} × 5 · short contact, full height · 1 min between sets`, is: `${sets} × 5 · stutt snerting, full hæð · 1 mín milli setta` },
});

const drop = (sets: number, reps: number, cm: number): GoalBlock => ({
  method: "drop_jumps",
  dropJumps: true,
  contacts: contactsOf(sets, reps),
  what: { en: "Drop jumps", is: "Fallhopp" },
  dose: { en: `${sets} × ${reps} from a ${cm} cm box`, is: `${sets} × ${reps} af ${cm} cm kassa` },
});

const squatSpeed = (dose: string, doseIs: string): GoalBlock => ({
  method: "squat_bar_speed",
  what: { en: "Full squat, moved fast", is: "Djúp hnébeygja, hreyfð hratt" },
  dose: { en: dose, is: doseIs },
});

const heavy = (light: boolean): GoalBlock => ({
  method: "heavy_strength",
  what: { en: "Heavy legs", is: "Þungar fætur" },
  dose: light ? { en: "Squat or trap-bar deadlift 2 × 3", is: "Hnébeygja eða trap bar 2 × 3" } : { en: "Squat or trap-bar deadlift 3–4 × 3–5 at 80–90% of max", is: "Hnébeygja eða trap bar 3–4 × 3–5 á 80–90% af hámarki" },
});

const cmjTest: GoalBlock = {
  method: "rebound_jumps",
  test: true,
  contacts: 3,
  what: { en: "Jump test (CMJ)", is: "Stökkpróf (CMJ)" },
  dose: { en: "3 × countermovement jump, hands on hips, on the force plates or a jump mat · same device each time", is: "3 × CMJ-stökk, hendur á mjöðmum, á kraftplötu eða stökkmottu · sama tæki í hvert sinn" },
};

/** Bedoya 2015 Table 4 (youth soccer), body weight only. Contacts as counted from the table. */
function youthHops(stage: 1 | 2 | 3 | 4): GoalBlock {
  const rows: Record<number, { en: string; is: string; contacts: number; drop?: boolean }> = {
    1: { en: "Forward/back hops 2 × 8 · side hops 2 × 8 · power skips 3 × 8", is: "Hopp fram/aftur 2 × 8 · hliðarhopp 2 × 8 · kraftskref 3 × 8", contacts: 56 },
    2: { en: "Hops over a low cone 2 × 8 · side hops 3 × 12 · single-leg hops 2 × 10 each leg", is: "Hopp yfir lága keilu 2 × 8 · hliðarhopp 3 × 12 · einfótahopp 2 × 10 hvor fótur", contacts: 92 },
    3: { en: "On-off box jumps (30 cm) 2 × 10 · side hops over low hurdles 3 × 6 · power skips 4 × 8", is: "Upp og niður af kassa (30 cm) 2 × 10 · hliðarhopp yfir lágar grindur 3 × 6 · kraftskref 4 × 8", contacts: 70 },
    4: { en: "On-off box jumps (30–45 cm) 2 × 12 · drop jumps from a low box 3 × 10 · single-leg hops over a cone 2 × 8 each leg", is: "Upp og niður af kassa (30–45 cm) 2 × 12 · fallhopp af lágum kassa 3 × 10 · einfótahopp yfir keilu 2 × 8 hvor fótur", contacts: 86, drop: true },
  };
  const r = rows[stage];
  return { method: "youth_hops", contacts: r.contacts, dropJumps: r.drop, what: { en: "Hops (body weight only)", is: "Hopp (aðeins eigin þyngd)" }, dose: { en: r.en, is: r.is } };
}

const sessA = (blocks: GoalBlock[], test = false): GoalSession => ({
  slot: "A",
  focus: test ? { en: "Test + jumps", is: "Mæling + hopp" } : { en: "Jumps", is: "Hopp" },
  when: WHEN.warmup_any,
  minutes: 15,
  blocks,
});

const sessB = (focus: Bi, blocks: GoalBlock[]): GoalSession => ({ slot: "B", focus, when: WHEN.gym_day, minutes: 20, blocks });
const sessC = (blocks: GoalBlock[]): GoalSession => ({ slot: "C", focus: { en: "Jumps (short)", is: "Hopp (stutt)" }, when: WHEN.off_day, minutes: 10, blocks });

export function jumpWeeks(start: JumpStart) {
  if (start === "youth") {
    const strengthYouth = sessB({ en: "Strength (light)", is: "Styrkur (létt)" }, [{
      method: "heavy_strength",
      what: { en: "Squat and lunge, technique first", is: "Hnébeygja og framstig, tækni fyrst" },
      dose: { en: "1–2 × 8–15 at a light-to-moderate weight (about 60% of max)", is: "1–2 × 8–15 með léttri til miðlungs þyngd (um 60% af hámarki)" },
    }]);
    return expandWeeks([
      { weeks: [1], label: (w) => weekLabel(w, "test + hops", "mæling + hopp"), sessions: [sessA([cmjTest, youthHops(1)], true), strengthYouth] },
      { weeks: [2], label: (w) => weekLabel(w, "", ""), sessions: [sessA([youthHops(1)]), strengthYouth] },
      { weeks: [3], label: (w) => weekLabel(w, "", ""), sessions: [sessA([youthHops(2)]), strengthYouth] },
      { weeks: [4], label: (w) => weekLabel(w, "test", "mæling"), sessions: [sessA([cmjTest, youthHops(2)], true), strengthYouth] },
      { weeks: [5, 6], label: (w) => weekLabel(w, "", ""), sessions: [sessA([youthHops(3)]), strengthYouth] },
      { weeks: [7], label: (w) => weekLabel(w, "", ""), sessions: [sessA([youthHops(4)]), strengthYouth] },
      { weeks: [8], label: (w) => weekLabel(w, "test", "mæling"), sessions: [sessA([cmjTest, youthHops(1)], true), strengthYouth] },
    ]);
  }
  // Sánchez-Sixto 2021: weeks 1–6 as tested (drop-jump boxes 20, 25, 30, 40, 40, 40 cm; rebound sets 5, 5, 6, 6, 7, 4).
  const reboundSets = [5, 5, 6, 6, 7, 4];
  const dropDose: Array<[number, number, number]> = [[3, 6, 20], [3, 6, 25], [3, 6, 30], [3, 4, 40], [4, 4, 40], [3, 3, 40]];
  const squatDose: Array<[string, string]> = [
    ["3 × 6, fast (bar about 1.0 m/s, roughly 50–60% of max)", "3 × 6, hratt (stöng um 1,0 m/s, u.þ.b. 50–60% af hámarki)"],
    ["3 × 6, fast (bar about 1.0 m/s)", "3 × 6, hratt (stöng um 1,0 m/s)"],
    ["3 × 6, a little heavier (bar about 0.9 m/s)", "3 × 6, aðeins þyngra (stöng um 0,9 m/s)"],
    ["3 × 4, heavier (bar about 0.8 m/s)", "3 × 4, þyngra (stöng um 0,8 m/s)"],
    ["4 × 4 (bar about 0.8 m/s)", "4 × 4 (stöng um 0,8 m/s)"],
    ["3 × 3 (bar about 0.8 m/s)", "3 × 3 (stöng um 0,8 m/s)"],
  ];
  const week = (i: number): GoalSession[] => {
    const testWeek = i === 0 || i === 3;
    if (start === "fast_jumps") {
      const [s, r, cm] = dropDose[i];
      return [
        sessA([...(testWeek ? [cmjTest] : []), drop(s, r, cm), rebound(reboundSets[i])], testWeek),
        sessB({ en: "Gym: fast + keep strength", is: "Salur: hratt + halda styrk" }, [{ method: "squat_bar_speed", what: { en: "Light jump squats", is: "Hnébeygjuhopp með léttri þyngd" }, dose: { en: "3 × 5, fast", is: "3 × 5, hratt" } }, heavy(true)]),
        sessC([rebound(3)]),
      ];
    }
    if (start === "strength_first") {
      return [
        sessA([...(testWeek ? [cmjTest] : []), rebound(reboundSets[i])], testWeek),
        sessB({ en: "Gym: strength", is: "Salur: styrkur" }, [heavy(i === 5)]),
        sessC([rebound(3)]),
      ];
    }
    const [en, is] = squatDose[i];
    return [
      sessA([...(testWeek ? [cmjTest] : []), rebound(reboundSets[i])], testWeek),
      sessB({ en: "Gym: squats by bar speed", is: "Salur: hnébeygja eftir stangarhraða" }, [squatSpeed(en, is)]),
      sessC([rebound(3)]),
    ];
  };
  const light: GoalSession[] = start === "fast_jumps"
    ? [sessA([drop(2, 3, 30), rebound(3)]), sessB({ en: "Gym: light", is: "Salur: létt" }, [heavy(true)])]
    : [sessA([rebound(3)]), sessB({ en: "Gym: light", is: "Salur: létt" }, [start === "combined" ? squatSpeed("2 × 3, fast", "2 × 3, hratt") : heavy(true)])];
  return expandWeeks([
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ weeks: [i + 1], label: (w: number) => weekLabel(w, i === 0 ? "test + start" : i === 3 ? "test" : "", i === 0 ? "mæling + byrjun" : i === 3 ? "mæling" : ""), sessions: week(i) })),
    { weeks: [7], label: (w) => weekLabel(w, "ease off", "minna magn"), sessions: light },
    { weeks: [8], label: (w) => weekLabel(w, "test", "mæling"), sessions: [sessA([cmjTest, rebound(2)], true), sessB({ en: "Gym: light", is: "Salur: létt" }, [heavy(true)])] },
  ]);
}

export const JUMP_START_LABEL: Record<JumpStart, Bi> = {
  youth: { en: "Youth level", is: "Unglingastig" },
  strength_first: { en: "Strength first", is: "Styrkur fyrst" },
  fast_jumps: { en: "Fast short-contact jumps", is: "Hröð hopp með stuttri snertingu" },
  combined: { en: "Squats + rebound jumps", is: "Hnébeygja + endurkastshopp" },
};

export function buildJumpParts(input: GoalPlanInput): GoalParts {
  const start = pickStart(input, jumpStart(input), jumpAllowed(input));
  const s = input.strength;
  const c = input.cmj;
  const used: Bi[] = [];
  const missing: Bi[] = [];
  if (c?.heightCm != null) used.push({ en: `Jump height ${c.heightCm.toFixed(1)} cm${c.date ? ` (${c.date})` : ""}`, is: `Stökkhæð ${c.heightCm.toFixed(1)} cm${c.date ? ` (${c.date})` : ""}` });
  else missing.push({ en: "Jump test on the force plates or a jump mat — taken in week 1", is: "Stökkpróf á kraftplötu eða stökkmottu — tekið í viku 1" });
  if (s?.imtpBand || s?.dsiTier) used.push({ en: "Force-plate strength test", is: "Styrkmæling á kraftplötu" });
  else missing.push({ en: "Strength test on the force plates", is: "Styrkmæling á kraftplötu" });
  if (c?.rsiMod != null) used.push({ en: `Jump speed off the ground (RSI-mod ${c.rsiMod.toFixed(2)})`, is: `Hraði í uppstökki (RSI-mod ${c.rsiMod.toFixed(2)})` });
  if (input.ageYears == null) missing.push({ en: "Date of birth", is: "Fæðingardagur" });

  const startWhy: Bi =
    start === "youth"
      ? { en: "Under 18 (or age unknown): the youth progression, body weight only, building from about 56 to 110 foot contacts.", is: "Undir 18 ára (eða aldur óþekktur): unglingastiginn, aðeins eigin þyngd, frá um 56 upp í 110 snertingar." }
      : start === "strength_first"
        ? s?.imtpBand
          ? { en: `The force-plate strength test is ${BAND_LABEL[s.imtpBand].en} for the player's group, so strength comes first, with rebound jumps each week.`, is: `Styrkpróf á kraftplötu er ${BAND_LABEL[s.imtpBand].is} miðað við hóp leikmannsins, svo styrkur kemur fyrst, með endurkastshoppum í hverri viku.` }
          : { en: "Force-plate tests show the player already uses most of the strength there is, so strength comes first.", is: "Kraftplötumælingar sýna að leikmaðurinn nýtir nú þegar mest af styrknum sem er til, svo styrkur kemur fyrst." }
        : start === "fast_jumps"
          ? s?.imtpBand
            ? { en: `Strength is ${BAND_LABEL[s.imtpBand].en} but the jump is slow off the ground, so the plan uses drop jumps and rebound jumps.`, is: `Styrkur er ${BAND_LABEL[s.imtpBand].is} en uppstökkið er hægt, svo áætlunin notar fallhopp og endurkastshopp.` }
            : { en: "Force-plate tests show more strength than the player turns into jump, so the plan uses drop jumps and rebound jumps.", is: "Kraftplötumælingar sýna meiri styrk en leikmaðurinn nær að breyta í stökk, svo áætlunin notar fallhopp og endurkastshopp." }
          : { en: "No clear gap in the data, so the plan uses squats plus rebound jumps, the mix that did best in a 6-week trial (+12.2%).", is: "Ekkert skýrt bil í gögnunum, svo áætlunin notar hnébeygju og endurkastshopp, blönduna sem gaf mest í 6 vikna rannsókn (+12,2%)." };

  const counterfactual: Bi =
    start === "youth"
      ? { en: "From 18 (with the date of birth on record), the plan would start from the force-plate numbers instead.", is: "Frá 18 ára aldri (með fæðingardag skráðan) myndi áætlunin byrja út frá kraftplötutölunum í staðinn." }
      : start === "strength_first"
        ? { en: "If the strength test had been above average, the plan would use squats plus rebound jumps, or drop jumps if the jump is slow off the ground.", is: "Ef styrkprófið hefði verið yfir meðallagi notaði áætlunin hnébeygju og endurkastshopp, eða fallhopp ef uppstökkið er hægt." }
        : start === "fast_jumps"
          ? { en: "If the jump had been quick off the ground, the plan would use squats plus rebound jumps.", is: "Ef uppstökkið hefði verið hratt notaði áætlunin hnébeygju og endurkastshopp." }
          : { en: "If the strength test had been average or below, the plan would start with strength.", is: "Ef styrkprófið hefði verið í meðallagi eða undir byrjaði áætlunin á styrk." };

  return {
    verdict:
      start === "youth"
        ? { en: "Body-weight hops twice a week for 8 weeks, building up slowly, plus light strength.", is: "Hopp með eigin þyngd tvisvar í viku í 8 vikur, byggð hægt upp, auk létts styrks." }
        : start === "strength_first"
          ? { en: "Build leg strength with rebound jumps each week: twice a week for 8 weeks.", is: "Byggðu upp fótastyrk með endurkastshoppum í hverri viku: tvisvar í viku í 8 vikur." }
          : start === "fast_jumps"
            ? { en: "Drop jumps and rebound jumps twice a week for 8 weeks; strength is already there.", is: "Fallhopp og endurkastshopp tvisvar í viku í 8 vikur; styrkurinn er þegar til staðar." }
            : { en: "Squats plus rebound jumps twice a week for 8 weeks.", is: "Hnébeygja og endurkastshopp tvisvar í viku í 8 vikur." },
    facts: [
      startWhy,
      start === "youth"
        ? { en: "In youth soccer, plyometrics raised jump height in most trials; raise the number of jumps or their height, never both at once (Bedoya 2015).", is: "Hjá unglingum í fótbolta hækkuðu hopp stökkhæð í flestum rannsóknum; fjölgaðu hoppum eða hækkaðu þau, aldrei hvoru tveggja í einu (Bedoya 2015)." }
        : { en: "In trials, 60–100 foot contacts a session worked as well as double that (Ebben), and a plan matched to the player beat one mix for everyone (Jiménez-Reyes 2017).", is: "Í rannsóknum dugðu 60–100 snertingar á æfingu jafn vel og tvöfalt meira (Ebben), og áætlun sniðin að leikmanninum skilaði meiru en ein blanda fyrir alla (Jiménez-Reyes 2017)." },
      { en: "Choosing the start from the strength and jump tests was not tested in any study: that choice is MicroPulse's rule.", is: "Að velja upphafið út frá styrk- og stökkprófum var ekki prófað í neinni rannsókn: það val er regla MicroPulse." },
    ],
    branch: { key: start, label: JUMP_START_LABEL[start], why: startWhy },
    start,
    counterfactual,
    evidence: "partly",
    confidence: { level: used.length >= 2 ? "high" : used.length === 1 ? "moderate" : "low", used, missing },
    weeks: jumpWeeks(start),
    tests: {
      weeks: [1, 4, 8],
      what: { en: "Jump test (CMJ) in weeks 1, 4 and 8, same device each time. Gains often show 1–2 weeks after the last hard week (Ebben), so test again a week after the plan ends too.", is: "Stökkpróf (CMJ) í vikum 1, 4 og 8, sama tæki í hvert sinn. Bæting sést oft 1–2 vikum eftir síðustu erfiðu vikuna (Ebben), svo prófaðu líka aftur viku eftir að áætluninni lýkur." },
      change: { en: "Under 2% higher (about 0.7 cm on a 35 cm jump) is read as no clear change — a MicroPulse rule. The trials used 0.2 × the spread between players, about 0.6–1.2 cm.", is: "Undir 2% hækkun (um 0,7 cm á 35 cm stökki) er lesin sem engin skýr breyting — regla MicroPulse. Rannsóknirnar notuðu 0,2 × dreifingu milli leikmanna, um 0,6–1,2 cm." },
    },
    safety: [
      { en: "Land soft and quiet; stop the set when the landings get heavy or the knees cave in.", is: "Lentu mjúkt og hljóðlega; hættu settinu þegar lendingar þyngjast eða hnén falla inn." },
      { en: "Under 18: body weight only, at most 120 foot contacts a session, and drop jumps only in the last two weeks with a coach there (Bedoya 2015).", is: "Undir 18 ára: aðeins eigin þyngd, mest 120 snertingar á æfingu, og fallhopp aðeins í síðustu tveimur vikunum með þjálfara á staðnum (Bedoya 2015)." },
    ],
    limits: [
      { en: "No study tested choosing the start from the strength and jump tests: that choice is MicroPulse's rule.", is: "Engin rannsókn prófaði að velja upphafið út frá styrk- og stökkprófum: það val er regla MicroPulse." },
      { en: "The adult weekly doses come mostly from one 6-week trial in women's basketball (Sánchez-Sixto 2021); weeks 7–8 are MicroPulse's.", is: "Vikuskammtar fullorðinna koma að mestu úr einni 6 vikna rannsókn í kvennakörfubolta (Sánchez-Sixto 2021); vikur 7–8 eru MicroPulse." },
      { en: "Youth evidence is mostly from boys, and its certainty is low (Wang K 2026).", is: "Gögn um unglinga eru mest frá strákum og vissan er lítil (Wang K 2026)." },
    ],
    refs: Object.values(JUMP_REFS),
  };
}
