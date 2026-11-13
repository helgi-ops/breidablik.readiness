/**
 * Goal plan: braking (deceleration). Football and basketball.
 *
 * The drills and the week-by-week progression are the tested programme of Dos'Santos 2019 (youth soccer, 70° cut)
 * and 2021 (amateur men, 180° turn): two 20–30 min sessions a week in place of the team warm-up, 6 weeks,
 * stops first at 50–75% → full effort pre-planned → full effort reacting to a partner. Read in full (Europe PMC
 * full text + supplementary programme tables), with McBurnie 2022, Harper 2022, Asadi 2016 and Silva 2022.
 *
 * Honest limits, shown on the card: MicroPulse counts how often a player brakes hard (GPS), but nothing in the
 * data measures how WELL the player brakes. The trials measured cutting/turning time and technique, not injuries;
 * their injury wording is "may decrease potential injury-risk" (risk surrogates), so this plan never claims to
 * prevent injury.
 *
 * Start (MicroPulse rule): hard-braking load over 28 days above own usual (McBurnie overload flag yellow/red) →
 * technique only at 50–75%, no extra full-effort stops. A VALD single-leg test with ≥10% difference → an extra
 * single-leg set on the weaker leg (Harper 2022: train both legs, extra for the non-preferred braking leg).
 *
 * Second batch (Nov 2026, read in full): Marvin 2024 — 12 adult trials, pooled deceleration outcomes showed no
 * gain vs control (SMD −0.04), all at high risk of bias, none trained braking on purpose. Chen 2025 — 36
 * adolescent trials: change-of-direction drills improve pre-planned cutting tests (−0.83); slow-lowering /
 * eccentric-overload work ranked first overall (−1.40, Table 3) and for turns of 90°+, but had no clear effect
 * under 90°. Chen's abstract numbers differ from its tables; the tables are used here.
 */

import { COD_CONCERN_PCT } from "@/lib/micropulse/codAsymmetry";
import { WHEN, expandWeeks, pickStart, weekLabel } from "./common";
import type { GoalParts } from "./index";
import type { Bi, GoalBlock, GoalMethod, GoalPlanInput, GoalRef, GoalSession } from "./types";

export const BRAKING_REFS: Record<string, GoalRef> = {
  dossantos2019: { key: "dossantos2019", short: "Dos'Santos 2019", cite: "Dos'Santos T, McBurnie A, Comfort P, Jones PA. The effects of six-weeks change of direction speed and technique modification training on cutting performance and movement quality in male youth soccer players. Sports 2019;7(9):205. doi:10.3390/sports7090205", verifiedFrom: "full_text" },
  dossantos2021: { key: "dossantos2021", short: "Dos'Santos 2021", cite: "Dos'Santos T, Thomas C, McBurnie A, Comfort P, Jones PA. Change of direction speed and technique modification training improves 180° turning performance, kinetics, and kinematics. Sports 2021;9(6):73. doi:10.3390/sports9060073", verifiedFrom: "full_text" },
  mcburnie2022: { key: "mcburnie2022", short: "McBurnie 2022", cite: "McBurnie AJ, Harper DJ, Jones PA, Dos'Santos T. Deceleration training in team sports: another potential 'vaccine' for sports-related injury? Sports Med 2022;52:1–12. doi:10.1007/s40279-021-01583-x", verifiedFrom: "full_text" },
  harper2022: { key: "harper2022", short: "Harper 2022", cite: "Harper DJ, McBurnie AJ, Dos'Santos T, et al. Biomechanical and neuromuscular performance requirements of horizontal deceleration: a review with implications for random intermittent multi-directional sports. Sports Med 2022;52:2321–2354. doi:10.1007/s40279-022-01693-0", verifiedFrom: "full_text" },
  asadi2016: { key: "asadi2016", short: "Asadi 2016", cite: "Asadi A, Arazi H, Young WB, Sáez de Villarreal E. The effects of plyometric training on change of direction ability: a meta analysis. Int J Sports Physiol Perform 2016. doi:10.1123/ijspp.2015-0694 (accepted manuscript)", verifiedFrom: "full_text" },
  silva2022: { key: "silva2022", short: "Silva 2022", cite: "Silva H, Nakamura FY, Beato M, Marcelino R. Acceleration and deceleration demands during training sessions in football: a systematic review. Sci Med Football 2022. doi:10.1080/24733938.2022.2090600", verifiedFrom: "full_text" },
  marvin2024: { key: "marvin2024", short: "Marvin 2024", cite: "Marvin LA, Read P, McLean B, Palmer S, Fransen J. Training interventions for improved deceleration ability in adult team-based field sports athletes: a systematic review and meta-analysis of the literature. Int J Strength Cond 2024. doi:10.47206/ijsc.v4i1.313", verifiedFrom: "full_text" },
  chen2025: { key: "chen2025", short: "Chen 2025", cite: "Chen Y, Tulhongjiang M, Ling T, Feng X, Mi J, Liu R. The optimal training intervention for improving the change of direction performance of adolescent team-sport athletes: a systematic review and network meta-analysis. PeerJ 2025;13:e18971. doi:10.7717/peerj.18971", verifiedFrom: "full_text" },
  lockie2014: { key: "lockie2014", short: "Lockie 2014", cite: "Lockie RG, Schultz AB, Callaghan SJ, Jeffriess MD. The effects of traditional and enforced stopping speed and agility training on multidirectional speed and athletic function. J Strength Cond Res 2014;28(6):1538–1551. doi:10.1519/JSC.0000000000000309", verifiedFrom: "abstract" },
};

export const BRAKING_METHODS: GoalMethod[] = [
  {
    key: "decel_technique",
    label: { en: "Braking and cutting drills", is: "Bremsu- og stefnubreytingaræfingar" },
    summary: { en: "Short runs into a stop, a cut or a turn, with a cue after every rep: stops first, then cuts, then reacting to a partner.", is: "Stutt hlaup inn í stopp, stefnubreytingu eða snúning, með leiðbeiningu eftir hverja endurtekningu: stopp fyrst, svo stefnubreytingar, svo viðbrögð við mótherja." },
    basis: "trial",
    dose: { en: "2 × 20 min a week in place of the warm-up · 30–60 s between full-effort reps · 2 min between drills", is: "2 × 20 mín á viku í stað upphitunar · 30–60 s milli endurtekninga á fullu · 2 mín milli æfinga" },
    findings: [
      { ref: "dossantos2019", text: { en: "Youth soccer (U17), 6 weeks: 70° cut time −9 to −12%, cutting technique score better by 23–34%; the control group's technique did not change.", is: "Unglingar í fótbolta (U17), 6 vikur: tími í 70° stefnubreytingu −9 til −12%, tækniskor betra um 23–34%; tækni samanburðarhópsins breyttist ekki." } },
      { ref: "dossantos2021", text: { en: "Amateur men, 6 weeks: 180° turn 0.096 s faster (about 3.5%) and braking force pointed more forward; no change in the control group.", is: "Áhugamenn, 6 vikur: 180° snúningur 0,096 s hraðari (um 3,5%) og bremsukrafturinn beindist meira fram; engin breyting í samanburðarhópnum." } },
      { ref: "chen2025", text: { en: "Adolescents (36 studies, mostly boys): change-of-direction drills improved pre-planned cutting tests (effect −0.83); in cuts under 90° they were among the best. Tests that react to a partner were left out.", is: "Unglingar (36 rannsóknir, mest strákar): stefnubreytingaæfingar bættu fyrirfram ákveðin stefnubreytingarpróf (áhrif −0,83); í beygjum undir 90° voru þær meðal þeirra bestu. Próf með viðbrögðum við mótherja voru ekki með." } },
      { ref: "marvin2024", text: { en: "Adults (12 trials): training did not improve braking itself compared with control groups (effect −0.04), but none of the trials trained braking on purpose, and all were at high risk of bias.", is: "Fullorðnir (12 rannsóknir): þjálfun bætti ekki bremsunina sjálfa miðað við samanburðarhópa (áhrif −0,04), en engin rannsóknanna æfði bremsun sérstaklega og allar voru með mikla skekkjuhættu." } },
    ],
    caution: { en: "Both Dos'Santos trials were small and not randomised, and neither checked whether the gains last. The reacting-to-a-partner weeks were part of their programme but were not measured on their own.", is: "Báðar Dos'Santos rannsóknirnar voru litlar og ekki slembaðar, og hvorug kannaði hvort bætingin endist. Vikurnar með viðbrögðum við félaga voru hluti af áætluninni en voru ekki mældar sérstaklega." },
  },
  {
    key: "landing_drills",
    label: { en: "Landings and hop-and-hold", is: "Lendingar og hopp-og-halda" },
    summary: { en: "Jump, land and hold still on one or both legs: control before speed.", is: "Hoppa, lenda og halda kyrru á öðrum eða báðum fótum: stjórn á undan hraða." },
    basis: "trial",
    dose: { en: "10–12 m of each drill · both legs equal", is: "10–12 m af hverri æfingu · báðir fætur jafnt" },
    findings: [
      { ref: "dossantos2021", text: { en: "Part of the tested sessions: broad jumps, single-leg hop-and-hold forward and zig-zag, 10–12 m each.", is: "Hluti af prófuðu æfingunum: langstökk, einfótahopp-og-halda fram og í sikk-sakk, 10–12 m hvert." } },
      { ref: "asadi2016", text: { en: "Meta-analysis: plyometric training improved change-of-direction tests (effect 0.96); a mix of jump types worked best. Braking itself was not measured.", is: "Safngreining: hoppþjálfun bætti stefnubreytingarpróf (áhrif 0,96); blanda af hopptegundum virkaði best. Bremsan sjálf var ekki mæld." } },
    ],
  },
  {
    key: "eccentric_strength",
    label: { en: "Slow-lowering leg strength", is: "Fótastyrkur með hægri niðurleið" },
    summary: { en: "Front-of-thigh strength while lowering goes with better braking; slow-lowering work helped sharp turns most in adolescents.", is: "Styrkur framan á læri á niðurleið fer saman við betri bremsun; æfingar með hægri niðurleið hjálpuðu mest í kröppum snúningum hjá unglingum." },
    basis: "review",
    dose: { en: "Split squat with a 3 s lowering, 3 × 6 each leg, in the team gym session", is: "Framstigsbeygja með 3 s niðurleið, 3 × 6 hvor fótur, á styrktaræfingu liðsins" },
    findings: [
      { ref: "harper2022", text: { en: "Review: eccentric thigh strength is the most consistent link with braking (r about 0.5–0.75), but only from snapshots, so cause is not shown. No exercise or dose is given: the dose here is MicroPulse's.", is: "Yfirlit: styrkur framan á læri á niðurleið tengist bremsun stöðugast (r um 0,5–0,75), en aðeins úr þversniðsrannsóknum, svo orsök er ekki sýnd. Engin æfing eða skammtur er gefinn: skammturinn hér er MicroPulse." } },
      { ref: "chen2025", text: { en: "Adolescents: work with a slow (about 3 s) or extra-loaded lowering ranked first for cutting overall (effect −1.40) and for turns of 90° or more, but had no clear effect in cuts under 90°. Based on few studies.", is: "Unglingar: æfingar með hægri (um 3 s) eða þyngdri niðurleið voru efstar fyrir stefnubreytingar í heild (áhrif −1,40) og fyrir snúninga 90° eða meira, en höfðu engin skýr áhrif í beygjum undir 90°. Byggt á fáum rannsóknum." } },
    ],
  },
];

export type BrakingStart = "technique_only" | "standard";

export const BRAKING_START_LABEL: Record<BrakingStart, Bi> = {
  technique_only: { en: "Technique only", is: "Aðeins tækni" },
  standard: { en: "Tested progression", is: "Prófaður stigi" },
};

/** Starts the coach may choose: a player already braking hard a lot gets no extra hard stops, so technique only. */
export function brakingAllowed(input: GoalPlanInput): BrakingStart[] {
  return brakingStart(input) === "technique_only" ? ["technique_only"] : ["standard", "technique_only"];
}

export function brakingStart(input: GoalPlanInput): BrakingStart {
  const f = input.braking?.overloadFlag;
  return f === "yellow" || f === "red" ? "technique_only" : "standard";
}

type DrillRow = { en: string; is: string; hardStops?: number };

const drills = (rows: DrillRow[], effort: Bi): GoalBlock => ({
  method: "decel_technique",
  hardStops: rows.reduce((s, r) => s + (r.hardStops ?? 0), 0) || undefined,
  what: { en: `Braking drills (${effort.en})`, is: `Bremsuæfingar (${effort.is})` },
  dose: { en: rows.map((r) => r.en).join(" · "), is: rows.map((r) => r.is).join(" · ") },
});

const SUB: Bi = { en: "50–75% effort, planned", is: "50–75% átak, fyrirfram ákveðið" };
const FULL: Bi = { en: "full effort, planned", is: "fullt átak, fyrirfram ákveðið" };
const REACT: Bi = { en: "full effort, reacting", is: "fullt átak, viðbrögð" };

const CUES: GoalBlock = {
  method: "decel_technique",
  what: { en: "Cues after every rep", is: "Leiðbeining eftir hverja endurtekningu" },
  dose: { en: "\"Slam on the brakes and drop the hips\" · \"push the ground away\" · \"face where you are going\"", is: "„Bremsaðu fast og lækkaðu mjaðmirnar\" · „ýttu jörðinni frá þér\" · „snúðu þér þangað sem þú ert að fara\"" },
};

const landings = (weakerLeg: GoalPlanInput["weakerLeg"]): GoalBlock => ({
  method: "landing_drills",
  contacts: 30,
  what: { en: "Landings and hop-and-hold", is: "Lendingar og hopp-og-halda" },
  dose: weakerLeg
    ? { en: `Broad jumps, single-leg hop-and-hold forward and zig-zag, 10 m each · one extra set on the ${weakerLeg.side} leg`, is: `Langstökk, einfótahopp-og-halda fram og í sikk-sakk, 10 m hvert · eitt auka sett á ${weakerLeg.side === "left" ? "vinstri" : "hægri"} fæti` }
    : { en: "Broad jumps, single-leg hop-and-hold forward and zig-zag, 10 m each · both legs equal", is: "Langstökk, einfótahopp-og-halda fram og í sikk-sakk, 10 m hvert · báðir fætur jafnt" },
});

const eccentric = (weakerLeg: GoalPlanInput["weakerLeg"]): GoalBlock => ({
  method: "eccentric_strength",
  what: { en: "In the team gym session: slow-lowering split squat", is: "Á styrktaræfingu liðsins: framstigsbeygja með hægri niðurleið" },
  dose: weakerLeg
    ? { en: `3 × 6 each leg, 3 s down · a 4th set on the ${weakerLeg.side} leg`, is: `3 × 6 hvor fótur, 3 s niður · 4. sett á ${weakerLeg.side === "left" ? "vinstri" : "hægri"} fæti` }
    : { en: "3 × 6 each leg, 3 s down", is: "3 × 6 hvor fótur, 3 s niður" },
});

const cutTest: GoalBlock = {
  method: "decel_technique",
  test: true,
  hardStops: 6,
  what: { en: "Cut test", is: "Stefnubreytingarpróf" },
  dose: { en: "5 m run-in, 70° cut, 5 m out · 3 each side · plus 2 × 10 m sprint · timing gates or video", is: "5 m aðhlaup, 70° stefnubreyting, 5 m út · 3 á hvora hlið · auk 2 × 10 m spretts · tímahlið eða myndband" },
};

const sessA = (blocks: GoalBlock[], test = false): GoalSession => ({
  slot: "A",
  focus: test ? { en: "Test + braking", is: "Mæling + bremsun" } : { en: "Braking drills", is: "Bremsuæfingar" },
  when: { en: "In place of the team warm-up, MD+3 (or MD+2).", is: "Í stað upphitunar liðsins, MD+3 (eða MD+2)." },
  minutes: 20,
  blocks,
});
const sessB = (blocks: GoalBlock[]): GoalSession => ({
  slot: "B",
  focus: { en: "Braking + landings", is: "Bremsun + lendingar" },
  when: { en: "In place of the team warm-up, MD-2, at least 2 days after session A.", is: "Í stað upphitunar liðsins, MD-2, minnst 2 dögum eftir æfingu A." },
  minutes: 20,
  blocks,
});
const sessC = (blocks: GoalBlock[]): GoalSession => ({ slot: "C", focus: { en: "Landings (short)", is: "Lendingar (stutt)" }, when: WHEN.off_day, minutes: 10, blocks });

// Dos'Santos 2019 Table S1 (sessions as printed; full-effort stop counts from the table's first count column).
const W1: DrillRow[] = [
  { en: "10 × 5 m run into a stop", is: "10 × 5 m hlaup inn í stopp" },
  { en: "12 × 5 m into a side-step (20–60°), 5 m out into a stop", is: "12 × 5 m inn í hliðarskref (20–60°), 5 m út í stopp" },
  { en: "8 × 5 m into a 135° turn, 5 m out into a stop", is: "8 × 5 m inn í 135° snúning, 5 m út í stopp" },
];
const W2: DrillRow[] = [
  { en: "4 × 5 m and 4 × 10 m into a stop", is: "4 × 5 m og 4 × 10 m inn í stopp", hardStops: 8 },
  { en: "4 × zig-zag 80°, 2 cuts, 5 m apart, into a 5 m stop", is: "4 × sikk-sakk 80°, 2 stefnubreytingar, 5 m á milli, inn í 5 m stopp", hardStops: 4 },
  { en: "3 × 5 m to 180°, 5 m to 180°, 10 m stop", is: "3 × 5 m í 180°, 5 m í 180°, 10 m stopp", hardStops: 3 },
];
const W3A: DrillRow[] = [
  { en: "4 × 10 m into a stop", is: "4 × 10 m inn í stopp", hardStops: 4 },
  { en: "5 × zig-zag 45°, 2 cuts, 5 m apart", is: "5 × sikk-sakk 45°, 2 stefnubreytingar, 5 m á milli", hardStops: 5 },
  { en: "10 × Y-cut 45° on a partner's signal, 5 m in and out", is: "10 × Y-stefnubreyting 45° eftir merki félaga, 5 m inn og út", hardStops: 5 },
];
const W3B: DrillRow[] = [
  { en: "4 × 2.5–10 m stop on a shout", is: "4 × 2,5–10 m stopp á kalli", hardStops: 4 },
  { en: "2 × 15 m zig-zag (2 × 90°), into a 5 m stop", is: "2 × 15 m sikk-sakk (2 × 90°), inn í 5 m stopp", hardStops: 2 },
  { en: "8 × Y-cut 60° on a partner's signal, 7.5 m in and out", is: "8 × Y-stefnubreyting 60° eftir merki félaga, 7,5 m inn og út", hardStops: 5 },
];
const W4A: DrillRow[] = [
  { en: "4 × 20 m into a stop", is: "4 × 20 m inn í stopp", hardStops: 4 },
  { en: "4 × zig-zag 45°, 2 cuts, 6 m apart", is: "4 × sikk-sakk 45°, 2 stefnubreytingar, 6 m á milli" },
  { en: "4 × 15 m tunnel: side-step past 2 opponents", is: "4 × 15 m göng: hliðarskref fram hjá 2 mótherjum" },
  { en: "6 × Y-cut 45° on a partner's signal", is: "6 × Y-stefnubreyting 45° eftir merki félaga" },
];
const W4B: DrillRow[] = [
  { en: "4 × 5–15 m stop when the partner stops", is: "4 × 5–15 m stopp þegar félaginn stoppar", hardStops: 4 },
  { en: "2 × 15 m and 2 × 30 m zig-zag (90°), into a 5 m stop", is: "2 × 15 m og 2 × 30 m sikk-sakk (90°), inn í 5 m stopp", hardStops: 6 },
  { en: "4 × 45° cut on a shout · 6 × Y-cut 60°, 2 cuts", is: "4 × 45° stefnubreyting á kalli · 6 × Y-stefnubreyting 60°, 2 stefnubreytingar", hardStops: 6 },
];
const W5A: DrillRow[] = [
  { en: "2 × 15 m curved (S) sprint", is: "2 × 15 m bogaspretti (S)" },
  { en: "12 × 5 m into a side-step (60°), 5 m out into a stop", is: "12 × 5 m inn í hliðarskref (60°), 5 m út í stopp", hardStops: 6 },
  { en: "4 × 15 m tunnel · 4 × 45° cut on a shout · 6 × Y-cut 60°, 2 cuts", is: "4 × 15 m göng · 4 × 45° stefnubreyting á kalli · 6 × Y-stefnubreyting 60°, 2 stefnubreytingar", hardStops: 4 },
];
const W5B: DrillRow[] = [
  { en: "4 × 10–15 m stop when the partner stops", is: "4 × 10–15 m stopp þegar félaginn stoppar", hardStops: 4 },
  { en: "2 × 180° races, two turns in 15 m, partner leads", is: "2 × 180° kapphlaup, tveir snúningar á 15 m, félagi leiðir", hardStops: 4 },
  { en: "8 × X-drill: 1 pivot and 1 cut, up to 15 m", is: "8 × X-æfing: 1 snúningur og 1 stefnubreyting, allt að 15 m" },
  { en: "3 × 35 m zig-zag race (5 × 90°), first cut on a signal, into a 5 m stop", is: "3 × 35 m sikk-sakk kapphlaup (5 × 90°), fyrsta stefnubreyting á merki, inn í 5 m stopp", hardStops: 7 },
];
const W7: DrillRow[] = [
  { en: "6 × 5 m into a stop", is: "6 × 5 m inn í stopp", hardStops: 6 },
  { en: "8 × 5 m into a side-step (60°), 5 m out into a stop", is: "8 × 5 m inn í hliðarskref (60°), 5 m út í stopp", hardStops: 4 },
];

export function brakingWeeks(start: BrakingStart, weakerLeg: GoalPlanInput["weakerLeg"]) {
  const lands = landings(weakerLeg);
  const ecc = eccentric(weakerLeg);
  if (start === "technique_only") {
    // Already a lot of hard braking: the weeks 1–2 drills at 50–75% all the way, no full-effort stops added.
    const tech = drills(W1, SUB);
    return expandWeeks([
      { weeks: [1], label: (w) => weekLabel(w, "technique", "tækni"), sessions: [sessA([CUES, tech]), sessB([lands, ecc]), sessC([lands])] },
      { weeks: [2, 3, 4, 5, 6, 7], label: (w) => weekLabel(w, "technique", "tækni"), sessions: [sessA([CUES, tech]), sessB([lands, ecc]), sessC([lands])] },
      { weeks: [8], label: (w) => weekLabel(w, "review", "yfirferð"), sessions: [sessA([CUES, tech]), sessB([lands])] },
    ]);
  }
  return expandWeeks([
    { weeks: [1], label: (w) => weekLabel(w, "test + stops first", "mæling + stopp fyrst"), sessions: [sessA([cutTest, CUES, drills(W1.slice(0, 2), SUB)], true), sessB([drills(W1, SUB), lands, ecc]), sessC([lands])] },
    { weeks: [2], label: (w) => weekLabel(w, "stops first", "stopp fyrst"), sessions: [sessA([CUES, drills(W1, { en: "75% effort, planned", is: "75% átak, fyrirfram ákveðið" })]), sessB([drills(W2, FULL), lands, ecc]), sessC([lands])] },
    { weeks: [3], label: (w) => weekLabel(w, "full effort", "fullt átak"), sessions: [sessA([CUES, drills(W3A, FULL)]), sessB([drills(W3B, FULL), lands, ecc]), sessC([lands])] },
    { weeks: [4], label: (w) => weekLabel(w, "full effort + signals", "fullt átak + merki"), sessions: [sessA([CUES, drills(W4A, FULL)]), sessB([drills(W4B, REACT), lands, ecc]), sessC([lands])] },
    { weeks: [5, 6], label: (w) => weekLabel(w, "reacting to a partner", "viðbrögð við félaga"), sessions: [sessA([CUES, drills(W5A, REACT)]), sessB([drills(W5B, REACT), lands, ecc]), sessC([lands])] },
    { weeks: [7], label: (w) => weekLabel(w, "ease off", "minna magn"), sessions: [sessA([CUES, drills(W7, FULL)]), sessB([lands])] },
    { weeks: [8], label: (w) => weekLabel(w, "test", "mæling"), sessions: [sessA([cutTest, CUES], true), sessB([lands])] },
  ]);
}

export function buildBrakingParts(input: GoalPlanInput): GoalParts {
  const start = pickStart(input, brakingStart(input), brakingAllowed(input));
  const b = input.braking;
  const used: Bi[] = [];
  const missing: Bi[] = [];
  if (b?.overloadFlag && b.overloadFlag !== "unknown") used.push({ en: "Hard-braking count from GPS (last 28 days vs usual)", is: "Fjöldi harðra bremsa úr GPS (síðustu 28 dagar miðað við venjulega)" });
  else missing.push({ en: "Hard-braking count from GPS (none on record, so the plan starts at the trial's lowest level)", is: "Fjöldi harðra bremsa úr GPS (ekkert skráð, svo áætlunin byrjar á lægsta stigi rannsóknarinnar)" });
  if (input.weakerLeg) used.push({ en: `Single-leg test: ${input.weakerLeg.side} leg ${input.weakerLeg.asymPct.toFixed(0)}% lower (${input.weakerLeg.test})`, is: `Einfótapróf: ${input.weakerLeg.side === "left" ? "vinstri" : "hægri"} fótur ${input.weakerLeg.asymPct.toFixed(0)}% lægri (${input.weakerLeg.test})` });
  else missing.push({ en: "Single-leg force-plate test (to see if one leg is weaker)", is: "Einfótapróf á kraftplötu (til að sjá hvort annar fóturinn sé veikari)" });

  const leanPct = b?.codAsymHighPct ?? null;
  const lean = leanPct != null && leanPct >= COD_CONCERN_PCT && b?.codLean && b.codLean !== "balanced" ? b.codLean : null;

  const startWhy: Bi = start === "technique_only"
    ? { en: "The player already brakes hard more than usual over the last 4 weeks, so the plan teaches braking at 50–75% effort and adds no extra hard stops.", is: "Leikmaðurinn bremsar nú þegar harðar en venjulega síðustu 4 vikur, svo áætlunin kennir bremsun á 50–75% átaki og bætir engum hörðum stoppum við." }
    : { en: "The tested 6-week programme: stops at 50–75% first, then full-effort stops and cuts, then reacting to a partner.", is: "Prófaða 6 vikna áætlunin: stopp á 50–75% fyrst, svo stopp og stefnubreytingar á fullu, svo viðbrögð við mótherja." };

  const facts: Bi[] = [
    startWhy,
    { en: "Honest limit: nothing in the data measures how well the player brakes, and a review of 12 adult trials found no clear gain in braking itself (none trained braking on purpose). The drills here were tested for cutting time and technique.", is: "Sagt hreint út: ekkert í gögnunum mælir hversu vel leikmaðurinn bremsar, og yfirlit 12 rannsókna á fullorðnum fann enga skýra bætingu á bremsuninni sjálfri (engin æfði bremsun sérstaklega). Æfingarnar hér voru prófaðar fyrir tíma og tækni í stefnubreytingum." },
    input.weakerLeg
      ? { en: `The ${input.weakerLeg.side} leg tested ${input.weakerLeg.asymPct.toFixed(0)}% lower, so it gets one extra single-leg set; stops start and finish on both legs (Harper 2022).`, is: `${input.weakerLeg.side === "left" ? "Vinstri" : "Hægri"} fótur mældist ${input.weakerLeg.asymPct.toFixed(0)}% lægri, svo hann fær eitt auka einfótasett; stopp byrja og enda á báðum fótum (Harper 2022).` }
      : lean
        ? { en: `High-speed cutting leans ${lean === "left" ? "left" : "right"} (${leanPct!.toFixed(0)}%). That says which way the player cuts, not which leg is weaker, so both legs get equal work.`, is: `Stefnubreytingar á miklum hraða halla til ${lean === "left" ? "vinstri" : "hægri"} (${leanPct!.toFixed(0)}%). Það segir í hvaða átt leikmaðurinn sker, ekki hvor fóturinn er veikari, svo báðir fætur fá jafna vinnu.` }
        : { en: "In the trials, cutting got 3.5–12% faster and cutting technique better; injuries were not measured.", is: "Í rannsóknunum urðu stefnubreytingar 3,5–12% hraðari og tæknin betri; meiðsli voru ekki mæld." },
  ];

  return {
    verdict: start === "technique_only"
      ? { en: "Braking technique at 50–75% twice a week, in place of the warm-up; no extra hard stops while braking load is already high.", is: "Bremsutækni á 50–75% tvisvar í viku í stað upphitunar; engin auka hörð stopp meðan bremsuálagið er þegar hátt." }
      : { en: "Braking and cutting drills twice a week in place of the warm-up, building from easy stops to reacting to a partner.", is: "Bremsu- og stefnubreytingaræfingar tvisvar í viku í stað upphitunar, frá léttum stoppum upp í viðbrögð við mótherja." },
    facts,
    branch: {
      key: start,
      label: BRAKING_START_LABEL[start],
      why: startWhy,
    },
    start,
    counterfactual: start === "technique_only"
      ? { en: "If hard braking over the last 4 weeks had been at the usual level, the plan would build up to full-effort stops from week 3.", is: "Ef harðar bremsur síðustu 4 vikur hefðu verið á venjulegu stigi byggðist áætlunin upp í stopp á fullu frá viku 3." }
      : { en: "If the player had been braking hard much more than usual, the plan would stay at 50–75% technique with no extra hard stops.", is: "Ef leikmaðurinn hefði bremsað hart mun meira en venjulega héldist áætlunin á 50–75% tækni án auka harðra stoppa." },
    evidence: "partly",
    confidence: { level: used.length === 2 ? "high" : used.length === 1 ? "moderate" : "low", used, missing },
    weeks: brakingWeeks(start, input.weakerLeg),
    tests: {
      weeks: start === "technique_only" ? [] : [1, 8],
      what: start === "technique_only"
        ? { en: "Sessions done, plus a test the coach picks once the braking load is back to usual.", is: "Æfingar kláraðar, auk prófs sem þjálfari velur þegar bremsuálagið er komið í venjulegt horf." }
        : { en: "Cut test (5 m in, 70° cut, 5 m out, 3 each side) and 10 m sprint in weeks 1 and 8, as in the 2019 trial.", is: "Stefnubreytingarpróf (5 m inn, 70° stefnubreyting, 5 m út, 3 á hvora hlið) og 10 m sprettur í vikum 1 og 8, eins og í rannsókninni 2019." },
      change: { en: "The extra time a cut costs over a straight 10 m varied 12–21% within one session in the trial, so read small changes as no clear change.", is: "Aukatíminn sem stefnubreyting kostar umfram beinan 10 m sveiflaðist um 12–21% innan einnar æfingar í rannsókninni, svo lestu litlar breytingar sem enga skýra breytingu." },
    },
    safety: [
      { en: "Never on MD-1: the team's lightest day stays light (Silva 2022). MD-4 and MD-3 already carry the team's most braking.", is: "Aldrei á MD-1: léttasti dagur liðsins helst léttur (Silva 2022). MD-4 og MD-3 bera nú þegar mesta bremsuálag liðsins." },
      { en: "Stop and finish on both legs, not always the same one: stopping training has been seen to widen left–right strength gaps (Lockie 2014).", is: "Stoppaðu og kláraðu á báðum fótum, ekki alltaf þeim sama: stoppþjálfun hefur sést auka mun á styrk milli fóta (Lockie 2014)." },
      { en: "The trials measured cutting time and technique, not injuries. Hard braking piling up over 2–4 weeks is associated with more overuse injuries (an observational study cited by McBurnie 2022), so the GPS count is checked each week.", is: "Rannsóknirnar mældu tíma og tækni í stefnubreytingum, ekki meiðsli. Mikið uppsafnað bremsuálag yfir 2–4 vikur tengist fleiri álagsmeiðslum (athugunarrannsókn sem McBurnie 2022 vísar í), svo GPS-talningin er skoðuð í hverri viku." },
    ],
    limits: [
      { en: "In adults, training has not been shown to improve braking itself (Marvin 2024: 12 trials, all at high risk of bias, none trained braking on purpose).", is: "Hjá fullorðnum hefur þjálfun ekki verið sýnd bæta bremsunina sjálfa (Marvin 2024: 12 rannsóknir, allar með mikla skekkjuhættu, engin æfði bremsun sérstaklega)." },
      { en: "The tested drills improved pre-planned cutting tests; the weeks reacting to a partner were not measured on their own.", is: "Prófuðu æfingarnar bættu fyrirfram ákveðin stefnubreytingarpróf; vikurnar með viðbrögðum við félaga voru ekki mældar sérstaklega." },
      { en: "Slow-lowering strength helped sharp turns (90° or more) in adolescents, not shallow cuts, and rests on few studies (Chen 2025).", is: "Styrkur með hægri niðurleið hjálpaði í kröppum snúningum (90° eða meira) hjá unglingum, ekki í grunnum beygjum, og byggir á fáum rannsóknum (Chen 2025)." },
      { en: "No trial measured injuries, and none tested 20-minute sessions in place of the warm-up beyond Dos'Santos.", is: "Engin rannsókn mældi meiðsli og engin prófaði 20 mínútna æfingar í stað upphitunar umfram Dos'Santos." },
    ],
    refs: Object.values(BRAKING_REFS),
  };
}
