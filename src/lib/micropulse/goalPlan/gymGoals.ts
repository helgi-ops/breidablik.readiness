/**
 * Goal plans: the three gym-only goals (2026-11-18) — Maximal strength, Explosive power, Strength + power.
 * Football and basketball, goalkeepers included. Pure and client-safe; rules decide, no AI.
 *
 * No extra session: each week's two sessions are lifts for the team strength session (the goal's lifts take the place
 * of the matching team lifts, "one session, one whole"). Built in pre-season / off-season; in season the team session
 * holds what was built (delivery, not this file).
 *
 * Read in full for this (Nov 2026):
 *  - Cormie, McGuigan & Newton 2010a (ballistic power vs strength training, relatively weak men, 10 weeks, 3×/week):
 *    heavy back squats 3×3 @ 90%, 3×6 @ 75%, 3×4 @ 80% (5 min rest) raised the squat max ~31% against ~4.5% for jump
 *    squats; jump peak power, jump height and 40 m changed about the same in both groups.
 *  - Cormie, McGuigan & Newton 2010b (same power programme, stronger vs weaker men): jump squats 7×6 at body weight
 *    (2 days) + 5×5 at 30% of max (1 day). Stronger men tended to gain more, not significantly; strength fell without
 *    any strength work, so the authors advise keeping some heavy lifting in a power phase (advice, not tested).
 *  - Smilios 2013: the load that gave the most power (body mass included) was about 20–37% of max; heavy loads raised
 *    the half-squat max most.
 *  - Marshall 2021: the order of heavy and light sets within a session made no clear difference over weeks; no study
 *    in it tested a strength block before a power block.
 *  - Suchomel 2020 (Dynamic Strength Index): the 0.60 / 0.80 cut-offs are cited from another paper, not tested in
 *    training; the mid-thigh pull drives the score, so a low score often means a strong pull, not a weak jump. Read it
 *    with the strength test (their own case study sent a weak player with a low score to strength first).
 *  - Cuthbert 2021: spreading the same weekly work over more days did no better; in season 1 session a week kept
 *    squat strength for 12 weeks (cited study).
 *  - Stone 2002: the squat max went with jump height, agility and (per kg) sprint times (associations, no target number).
 *  - García-Valverde 2022: weightlifting + traditional lifts raised jump and sprint about as much as traditional lifts
 *    (within-group effects; no head-to-head difference).
 *
 * Start (MicroPulse rule): the strength test first, DSI second, as Suchomel 2020 advises. Under 18 or age unknown →
 * technique-first lifts and body-weight jumps only, whatever the data say.
 *
 * The coach's additions (brief §4a, 2026-11-23; GOAL_CONTENT_VERSION 2026-11-23.1): Maximal strength's heavy day also
 * holds an isometric mid-thigh pull and a one-leg lift; Explosive power's heavy day a fast isometric pull and its second
 * day low drop jumps (20–30 cm, never higher: the MD-3 day rule). The research doses above stay as they were. The
 * isometric pull and the one-leg lift doses are MicroPulse's (the coach's), not from a study; the drop jumps use the
 * jump plan's tested start (Sánchez-Sixto 2021: 20 → 30 cm) and stop at 30 cm.
 */

import { ACCEL_REFS, PULLING_DERIVATIVES } from "./acceleration";
import { BAND_LABEL, expandWeeks, isYouth, pickStart, weekLabel } from "./common";
import type { GoalParts } from "./index";
import { JUMP_BLOCKS, JUMP_METHODS, JUMP_REFS } from "./jump";
import type { TrainingLevel } from "./levels";
import type { Bi, GoalBlock, GoalMethod, GoalPlanInput, GoalRef, GoalSession, GymQuality } from "./types";

// ─── Sources ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const GYM_REFS: Record<string, GoalRef> = {
  cormie2010a: {
    key: "cormie2010a",
    short: "Cormie 2010a",
    cite: "Cormie P, McGuigan MR, Newton RU. Adaptations in athletic performance after ballistic power versus strength training. Med Sci Sports Exerc 2010;42(8):1582–1598. doi:10.1249/MSS.0b013e3181d2013a",
    verifiedFrom: "full_text",
  },
  cormie2010b: {
    key: "cormie2010b",
    short: "Cormie 2010b",
    cite: "Cormie P, McGuigan MR, Newton RU. Influence of strength on magnitude and mechanisms of adaptation to power training. Med Sci Sports Exerc 2010;42(8):1566–1581. doi:10.1249/MSS.0b013e3181cf818d",
    verifiedFrom: "full_text",
  },
  smilios2013: {
    key: "smilios2013",
    short: "Smilios 2013",
    cite: "Smilios I, Sotiropoulos K, Christou M, Douda H, Spaias A, Tokmakidis SP. Maximum power training load determination and its effects on load-power relationship, maximum strength, and vertical jump performance. J Strength Cond Res 2013;27(5):1223–1233. doi:10.1519/JSC.0b013e3182654a1c",
    verifiedFrom: "full_text",
  },
  stone2002: {
    key: "stone2002",
    short: "Stone 2002",
    cite: "Stone MH, Moir G, Glaister M, Sanders R. How much strength is necessary? Phys Ther Sport 2002;3(2):88–96. doi:10.1054/ptsp.2001.0102",
    verifiedFrom: "full_text",
  },
  // Same text as `RX_REFS.cuthbert2021` / `RX_REFS.cormie2007` in liftRx.ts (a test keeps them equal; liftRx imports
  // this module's library, so it can't be imported back here).
  cuthbert2021: {
    key: "cuthbert2021",
    short: "Cuthbert 2021",
    cite: "Cuthbert M, Haff GG, Arent SM, Ripley N, McMahon JJ, Evans M, Comfort P. Effects of variations in resistance training frequency on strength development in well-trained populations and implications for in-season athlete training: a systematic review and meta-analysis. Sports Med 2021;51:1967–1982.",
    verifiedFrom: "full_text",
  },
  cormie2007: {
    key: "cormie2007",
    short: "Cormie 2007",
    cite: "Cormie P, McCaulley GO, Triplett NT, McBride JM. Optimal loading for maximal power output during lower-body resistance exercises. Med Sci Sports Exerc 2007;39(2):340–349.",
    verifiedFrom: "full_text",
  },
  suchomel2020: ACCEL_REFS.suchomel2020,
  suchomel2017: ACCEL_REFS.suchomel2017,
  garciavalverde2022: ACCEL_REFS.garciavalverde2022,
  marshall2021: JUMP_REFS.marshall2021,
  sanchezsixto2021: JUMP_REFS.sanchezsixto2021,
  saezdevillarreal2009: JUMP_REFS.saezdevillarreal2009,
};

/** The jump plan's drop-jump card, with the gym goal's own dose (low box only). */
const JUMP_DROP_CARD = JUMP_METHODS.find((m) => m.key === "drop_jumps")!;

// ─── Methods (the coach's library cards and the sources each lift line is checked against) ───────────────────────

export const GYM_METHODS: GoalMethod[] = [
  {
    key: "heavy_strength",
    label: { en: "Heavy leg strength", is: "Þungur fótastyrkur" },
    summary: { en: "Heavy squats or trap-bar deadlifts, two days a week: one heavier day, one lighter day.", is: "Þungar hnébeygjur eða trap bar-lyftur, tvo daga í viku: einn þyngri dag og einn léttari." },
    basis: "trial",
    dose: { en: "3 × 3 at 85–90% of max and 3 × 5–6 at 75–80% · 3–5 min rest", is: "3 × 3 á 85–90% af hámarki og 3 × 5–6 á 75–80% · 3–5 mín hvíld" },
    howTo: [
      { en: "In the team strength session, after any jumps or fast lifts (power first, strength after).", is: "Á styrktaræfingu liðsins, á eftir hoppum eða hröðum lyftum (kraftur fyrst, styrkur á eftir)." },
      { en: "Squat or trap-bar deadlift: the one the player does with good technique.", is: "Hnébeygja eða trap bar: sú sem leikmaðurinn gerir með góðri tækni." },
      { en: "Warm up with 2–3 lighter sets, then the working sets. Every rep down under control and up as fast as possible.", is: "Hitaðu upp með 2–3 léttari settum, svo vinnusettin. Hver endurtekning stýrð niður og eins hratt upp og hægt er." },
      { en: "Add weight only when every rep keeps depth and technique. Never to failure.", is: "Bættu aðeins við þyngd þegar hver endurtekning heldur dýpt og tækni. Aldrei í þrot." },
    ],
    findings: [
      { ref: "cormie2010a", text: { en: "Relatively weak men (squat about 1.3 × body weight), 10 weeks, 3× a week: back squats 3 × 3 at 90%, 3 × 6 at 75% and 3 × 4 at 80% with 5 min rest raised the squat max by about 31%, against about 4.5% for jump squats. Jump height, jump power and 40 m improved about the same in both groups.", is: "Frekar óvanir karlar (hnébeygja um 1,3 × líkamsþyngd), 10 vikur, 3× í viku: hnébeygja 3 × 3 á 90%, 3 × 6 á 75% og 3 × 4 á 80% með 5 mín hvíld hækkaði hámarkið um u.þ.b. 31%, á móti u.þ.b. 4,5% fyrir hnébeygjuhopp. Stökkhæð, stökkafl og 40 m bötnuðu álíka í báðum hópum." } },
      { ref: "cuthbert2021", text: { en: "10 studies of trained men: spreading the same weekly work over more days did no better for strength. A cited study kept squat strength for 12 weeks of a season with 1 session a week.", is: "10 rannsóknir á vönum körlum: að dreifa sömu vikuvinnu á fleiri daga gerði ekki betur fyrir styrk. Rannsókn sem vísað er í hélt styrk í hnébeygju í 12 vikur á tímabili með 1 æfingu á viku." } },
      { ref: "stone2002", text: { en: "Review: in several groups of athletes the squat max went with jump height and agility (r = 0.65–0.87 in a national badminton team), and squat strength per kg of body weight with sprint times. Associations, not a target number.", is: "Yfirlit: í nokkrum hópum íþróttafólks fór hámark í hnébeygju saman við stökkhæð og snerpu (r = 0,65–0,87 í landsliði í badminton), og styrkur á hvert kg líkamsþyngdar við sprettitíma. Fylgni, ekki markmið." } },
      { ref: "smilios2013", text: { en: "Moderately trained men, 6 weeks: sets at 90% of max raised the half-squat max about 15%, against about 7% for lighter, faster sets; the jump improved about the same.", is: "Miðlungsvanir karlar, 6 vikur: sett á 90% af hámarki hækkuðu hámarkið í hálfri hnébeygju um u.þ.b. 15%, á móti u.þ.b. 7% fyrir léttari og hraðari sett; stökkið batnaði álíka." } },
    ],
    caution: { en: "The trials were on men, mostly not team-sport players, and not in season.", is: "Rannsóknirnar voru á körlum, flestum ekki í hópíþróttum, og ekki á keppnistímabili." },
  },
  {
    key: "jump_squat",
    label: { en: "Jump squats", is: "Hnébeygjuhopp" },
    summary: { en: "Jump squats with body weight or a light load, every jump as high as possible.", is: "Hnébeygjuhopp með eigin þyngd eða léttri þyngd, hvert hopp eins hátt og hægt er." },
    basis: "trial",
    dose: { en: "5 × 5 light (about 30% of max) and 5–6 × 6 with body weight · 3 min rest", is: "5 × 5 létt (um 30% af hámarki) og 5–6 × 6 með eigin þyngd · 3 mín hvíld" },
    howTo: [
      { en: "First in the strength session, after the warm-up (power first).", is: "Fremst á styrktaræfingunni, eftir upphitun (kraftur fyrst)." },
      { en: "Short dip, then jump as high as possible; land soft and reset before the next one.", is: "Stutt beygja, síðan eins hátt upp og hægt er; lentu mjúkt og stilltu þig af fyrir næsta." },
      { en: "Full rest (about 3 min). Stop the set when the jumps get lower.", is: "Full hvíld (um 3 mín). Hættu settinu þegar hoppin lækka." },
    ],
    findings: [
      { ref: "cormie2010a", text: { en: "Relatively weak men, 10 weeks: jump squats 7 × 6 at body weight (2 days) and 5 × 5 at 30% of max (1 day) raised jump power about 18% and jump height about 6 cm, the same as heavy squats did, and made 40 m about 3.6% faster.", is: "Frekar óvanir karlar, 10 vikur: hnébeygjuhopp 7 × 6 með eigin þyngd (2 dagar) og 5 × 5 á 30% af hámarki (1 dagur) hækkuðu stökkafl um u.þ.b. 18% og stökkhæð um u.þ.b. 6 cm, jafnmikið og þung hnébeygja, og gerðu 40 m u.þ.b. 3,6% hraðari." } },
      { ref: "cormie2010b", text: { en: "The same programme in stronger men (squat about 2 × body weight): they tended to gain more, but not significantly. Without any heavy lifting their squat max fell, so the authors advise keeping some heavy lifts in a power phase (advice, not tested).", is: "Sama áætlun hjá sterkari körlum (hnébeygja um 2 × líkamsþyngd): þeir bættu sig að jafnaði meira, en ekki marktækt. Án þungra lyftinga lækkaði hámarkið þeirra, svo höfundar ráðleggja að halda þungum lyftum inni í kraftblokk (ráð, ekki prófað)." } },
      { ref: "smilios2013", text: { en: "The load that gave the most power (body weight counted) was about 20–37% of max; training there raised the jump about as much as heavier or lighter loads.", is: "Þyngdin sem gaf mest afl (líkamsþyngd talin með) var um 20–37% af hámarki; þjálfun þar hækkaði stökkið álíka mikið og þyngri eða léttari þyngdir." } },
      { ref: "cormie2007", text: { en: "Measured once in trained men: jump squat power was highest at body weight.", is: "Mælt einu sinni hjá vönum körlum: afl í hnébeygjuhoppi var mest með eigin þyngd." } },
    ],
    caution: { en: "The trials were on men, not in season.", is: "Rannsóknirnar voru á körlum, ekki á keppnistímabili." },
  },
  PULLING_DERIVATIVES,
  {
    key: "strength_test",
    label: { en: "Strength test", is: "Styrkpróf" },
    summary: { en: "Mid-thigh pull on the force plates, or the heaviest 3–5 reps on the main lift.", is: "Tog frá miðju læri á kraftplötu, eða þyngsta þyngd 3–5 sinnum í aðallyftunni." },
    basis: "rule",
    dose: { en: "Weeks 1 and 8, same test and set-up each time", is: "Vikur 1 og 8, sama próf og uppsetning í hvert sinn" },
    findings: [],
  },
  {
    key: "iso_pull",
    label: { en: "Isometric mid-thigh pull", is: "Kyrrstöðutog frá miðju læri" },
    summary: { en: "Pull as hard as possible on a bar fixed at mid-thigh: the same position as the strength test, no bar movement.", is: "Togaðu eins fast og hægt er í stöng sem er föst við miðju læri: sama staða og í styrkprófinu, stöngin hreyfist ekki." },
    basis: "rule",
    dose: { en: "Maximal strength: 3 × 3–5 s, as hard as possible · Explosive power: 3 × 2 s, as hard and fast as possible · 2 min rest", is: "Hámarksstyrkur: 3 × 3–5 sek, eins fast og hægt er · Sprengikraftur: 3 × 2 sek, eins fast og hratt og hægt er · 2 mín hvíld" },
    howTo: [
      { en: "On the heavy day, after the heavy lift. Bar at mid-thigh, back flat, shoulders over the bar, as in the test.", is: "Á þunga deginum, á eftir þungu lyftunni. Stöng við miðju læri, bak beint, axlir yfir stönginni, eins og í prófinu." },
      { en: "Build to a full pull within about 1 s and hold (strength); or pull as fast as possible from the first moment (power).", is: "Byggðu upp í fullt tog á um 1 sek og haltu (styrkur); eða togaðu eins hratt og hægt er frá fyrsta augnabliki (kraftur)." },
    ],
    findings: [],
    caution: { en: "The coach's addition (2026-11-22). No study behind this plan tested isometric pulls as training; the dose is MicroPulse's.", is: "Viðbót þjálfarans (2026-11-22). Engin rannsókn á bak við þessa áætlun prófaði kyrrstöðutog sem þjálfun; skammturinn er MicroPulse." },
  },
  {
    key: "single_leg_strength",
    label: { en: "One-leg strength", is: "Styrkur á öðrum fæti" },
    summary: { en: "A split squat on each leg, with a few reps left in the tank.", is: "Hnébeygja í skrefstöðu á hvorum fæti, með nokkrar endurtekningar eftir." },
    basis: "rule",
    dose: { en: "2 × 5–6 each leg, 2–3 reps in reserve, 2 min rest", is: "2 × 5–6 á hvorn fót, 2–3 endurtekningar eftir, 2 mín hvíld" },
    howTo: [
      { en: "On the heavy day, after the heavy lift and the isometric pull. Reps in reserve, not bar speed.", is: "Á þunga deginum, á eftir þungu lyftunni og kyrrstöðutoginu. Endurtekningar eftir, ekki stangarhraði." },
      { en: "Front knee over the middle of the foot; the weaker leg sets the reps.", is: "Fremra hné yfir miðjum fæti; veikari fóturinn ræður endurtekningunum." },
    ],
    findings: [],
    caution: { en: "The coach's addition (2026-11-22). The dose is MicroPulse's, not from a study.", is: "Viðbót þjálfarans (2026-11-22). Skammturinn er MicroPulse, ekki úr rannsókn." },
  },
  {
    ...JUMP_DROP_CARD,
    dose: { en: "3 × 3 from a 20–30 cm box, never higher (the MD-3 day rule: 30 cm, 9 drop jumps at most)", is: "3 × 3 af 20–30 cm kassa, aldrei hærra (dagsregla MD-3: mest 30 cm og 9 fallhopp)" },
  },
];

// ─── Blocks ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** "Squat or trap-bar deadlift 3 × 3 at 85–90% of max, 3–5 min rest": the shape `liftRx` and the team swaps read. */
const heavy = (sets: string, reps: string, pct: string, rest = "3–5"): GoalBlock => ({
  method: "heavy_strength",
  what: { en: "Heavy legs", is: "Þungar fætur" },
  dose: { en: `Squat or trap-bar deadlift ${sets} × ${reps} at ${pct}% of max, ${rest} min rest`, is: `Hnébeygja eða trap bar ${sets} × ${reps} á ${pct.replace(/\./g, ",")}% af hámarki, ${rest} mín hvíld` },
});

/** The light week's lift (2 × 3: liftRx reads it as "same weight, fewer sets"). */
const heavyLight: GoalBlock = {
  method: "heavy_strength",
  what: { en: "Heavy legs", is: "Þungar fætur" },
  dose: { en: "Squat or trap-bar deadlift 2 × 3", is: "Hnébeygja eða trap bar 2 × 3" },
};

/** Beginner weeks 1–3: technique first (the same block the jump plan uses). */
const technique = (): GoalBlock => ({
  method: "heavy_strength",
  what: { en: "Squat, technique first", is: "Hnébeygja, tækni fyrst" },
  dose: { en: "3 × 6 at a light-to-moderate weight, 2–3 reps in reserve", is: "3 × 6 með léttri til miðlungs þyngd, 2–3 endurtekningar eftir" },
});

/** Under 18: technique-first squat and lunge at about 60% of max (never above 75%); week 7 lighter. */
const youthLift = (sets: number, light = false): GoalBlock => ({
  method: "heavy_strength",
  what: { en: "Squat and lunge, technique first", is: "Hnébeygja og framstig, tækni fyrst" },
  dose: light
    ? { en: `${sets} × 6 at a light weight`, is: `${sets} × 6 með léttri þyngd` }
    : { en: `${sets} × 8 at a light-to-moderate weight (about 60% of max)`, is: `${sets} × 8 með léttri til miðlungs þyngd (um 60% af hámarki)` },
});

/** Loaded jump squats, about 30% of max (Cormie 2010a/b day 2). The team's swap can make them a weightlifting pull. */
const lightJumpSquats = (sets: number, reps = 5): GoalBlock => ({
  method: "jump_squat",
  what: { en: "Light jump squats", is: "Hnébeygjuhopp með léttri þyngd" },
  dose: { en: `${sets} × ${reps}, fast`, is: `${sets} × ${reps}, hratt` },
});

/** Body-weight jump squats (Cormie 2010a/b days 1 and 3). */
const bodyJumpSquats = (sets: number, reps = 6): GoalBlock => ({
  method: "jump_squat",
  what: { en: "Body-weight jump squats", is: "Hnébeygjuhopp með eigin þyngd" },
  dose: { en: `${sets} × ${reps}, body weight, as high as possible`, is: `${sets} × ${reps}, eigin þyngd, eins hátt og hægt er` },
});

/** The coach's isometric mid-thigh pull (brief §4a): held as hard as possible (strength) or as fast as possible (power). */
const isoPull = (sets: number, secs: number, fast = false): GoalBlock => ({
  method: "iso_pull",
  what: fast ? { en: "Isometric mid-thigh pull, fast", is: "Kyrrstöðutog frá miðju læri, hratt" } : { en: "Isometric mid-thigh pull", is: "Kyrrstöðutog frá miðju læri" },
  dose: fast
    ? { en: `Isometric mid-thigh pull ${sets} × ${secs} s, as hard and as fast as possible, 2 min rest`, is: `Kyrrstöðutog frá miðju læri ${sets} × ${secs} sek, eins fast og eins hratt og hægt er, 2 mín hvíld` }
    : { en: `Isometric mid-thigh pull ${sets} × ${secs} s, as hard as possible, 2 min rest`, is: `Kyrrstöðutog frá miðju læri ${sets} × ${secs} sek, eins fast og hægt er, 2 mín hvíld` },
});

/** The coach's one-leg lift (brief §4a): reps in reserve, not bar speed. */
const singleLeg = (sets: number, reps: number): GoalBlock => ({
  method: "single_leg_strength",
  what: { en: "One-leg strength", is: "Styrkur á öðrum fæti" },
  dose: { en: `Bulgarian split squat ${sets} × ${reps} each leg, 2–3 reps in reserve, 2 min rest`, is: `Búlgörsk hnébeygja ${sets} × ${reps} á hvorn fót, 2–3 endurtekningar eftir, 2 mín hvíld` },
});

/** Low drop jumps (brief §4a): 3 a set, box 20–30 cm, never higher (the MD-3 day rule). */
const lowDrops = (sets: number, cm: number): GoalBlock => ({
  method: "drop_jumps",
  dropJumps: true,
  contacts: sets * 3,
  what: { en: "Drop jumps, low box", is: "Fallhopp, lágur kassi" },
  dose: { en: `Drop jumps ${sets} × 3 from a ${cm} cm box, 2 min rest`, is: `Fallhopp ${sets} × 3 af ${cm} cm kassa, 2 mín hvíld` },
});

/** Box by power week (Sánchez-Sixto 2021's start, 20 → 30 cm, then held at 30 cm). */
const DROP_BY_WEEK: Array<[number, number]> = [[2, 20], [3, 20], [3, 25], [3, 30], [3, 30], [3, 30]];

const strengthTest: GoalBlock = {
  method: "strength_test",
  test: true,
  what: { en: "Strength test", is: "Styrkpróf" },
  dose: {
    en: "Mid-thigh pull on the force plates (3 tries, best counts) · no plates: the heaviest weight lifted 3–5 times with good technique on the main lift · same test and set-up each time",
    is: "Tog frá miðju læri á kraftplötu (3 tilraunir, besta gildir) · engin plata: þyngsta þyngd sem lyft er 3–5 sinnum með góðri tækni í aðallyftunni · sama próf og uppsetning í hvert sinn",
  },
};

/** Under 18: no heavy lift test, the plates or the jump only. */
const youthTest: GoalBlock = {
  method: "strength_test",
  test: true,
  what: { en: "Test", is: "Próf" },
  dose: {
    en: "Mid-thigh pull on the force plates, or the jump test (CMJ) when there are no plates · same test each time · no heavy lift test under 18",
    is: "Tog frá miðju læri á kraftplötu, eða stökkpróf (CMJ) ef engin plata er · sama próf í hvert sinn · ekkert hámarkspróf í lyftu undir 18 ára",
  },
};

const cmjTest = JUMP_BLOCKS.cmjTest;

const WHEN_GYM: Bi = {
  en: "Part of the team strength session on a strength or power day, never MD-1 or MD+1.",
  is: "Hluti af styrktaræfingu liðsins á styrktar- eða kraftdegi, aldrei MD-1 né MD+1.",
};

const sess = (slot: "A" | "B", focus: Bi, blocks: GoalBlock[]): GoalSession => ({ slot, focus, when: WHEN_GYM, minutes: 20, blocks });

const F = {
  heavyDay: { en: "Strength: heavy day", is: "Styrkur: þungur dagur" },
  lighterDay: { en: "Strength: lighter day", is: "Styrkur: léttari dagur" },
  powerDay: { en: "Power", is: "Kraftur" },
  powerKeep: { en: "Power + keep strength", is: "Kraftur + halda styrk" },
  test: { en: "Test + strength", is: "Mæling + styrkur" },
  testPower: { en: "Test + power", is: "Mæling + kraftur" },
  light: { en: "Light", is: "Létt" },
  youth: { en: "Technique first", is: "Tækni fyrst" },
} satisfies Record<string, Bi>;

type Wk = { a: GoalSession; b: GoalSession; label?: [string, string] };

function weeks8(rows: Wk[]) {
  return expandWeeks(rows.map((r, i) => ({ weeks: [i + 1], label: (w: number) => weekLabel(w, r.label?.[0] ?? "", r.label?.[1] ?? ""), sessions: [r.a, r.b] })));
}

const TEST_START: [string, string] = ["test + start", "mæling + byrjun"];
const TEST: [string, string] = ["test", "mæling"];
const EASE: [string, string] = ["ease off", "minna magn"];

// ─── Maximal strength ────────────────────────────────────────────────────────────────────────────────────────────

export type MaxStrengthStart = "youth" | "heavy";
export const MAX_STRENGTH_START_LABEL: Record<MaxStrengthStart, Bi> = {
  youth: { en: "Youth level", is: "Unglingastig" },
  heavy: { en: "Heavy day + lighter day", is: "Þungur dagur + léttari dagur" },
};

export const maxStrengthAllowed = (input: GoalPlanInput): MaxStrengthStart[] => (isYouth(input.ageYears) ? ["youth"] : ["heavy"]);
export const maxStrengthStart = (input: GoalPlanInput): MaxStrengthStart => (isYouth(input.ageYears) ? "youth" : "heavy");

/** Cormie 2010a's three loads (90 / 75 / 80%) on two days: a heavy day and a lighter day, stepping up over 6 weeks. */
const MAX_STRENGTH_DOSE: Array<{ a: [string, string, string]; b: [string, string, string] }> = [
  { a: ["3", "5", "75–80"], b: ["3", "6", "70–75"] },
  { a: ["3", "4", "80–85"], b: ["3", "6", "75–80"] },
  { a: ["3", "3", "85–90"], b: ["3", "5", "75–80"] },
  { a: ["3", "3", "85–90"], b: ["3", "4", "80–85"] },
  { a: ["4", "3", "85–90"], b: ["3", "4", "80–85"] },
  { a: ["4", "3", "85–90"], b: ["3", "5", "75–80"] },
];

/** Youth: 2 sets weeks 1–2, 3 sets weeks 3–6, a lighter week 7, the test in week 8. */
function youthWeeks(extra: (i: number) => GoalBlock[]) {
  const s = (i: number, test: boolean): Wk => {
    const lift = i === 6 ? youthLift(2, true) : youthLift(i >= 2 && i <= 5 ? 3 : 2);
    return {
      a: sess("A", test ? { en: "Test + technique", is: "Mæling + tækni" } : i === 6 ? F.light : F.youth, [...(test ? [youthTest] : []), ...extra(i), lift]),
      b: sess("B", i === 6 ? F.light : F.youth, [...extra(i), lift]),
      label: test ? (i === 0 ? TEST_START : TEST) : i === 6 ? EASE : undefined,
    };
  };
  return weeks8([s(0, true), s(1, false), s(2, false), s(3, false), s(4, false), s(5, false), s(6, false), s(7, true)]);
}

export function maxStrengthWeeks(start: MaxStrengthStart, level: TrainingLevel = "intermediate") {
  if (start === "youth") return youthWeeks(() => []);
  const beg = level === "beginner";
  const adv = level === "advanced";
  const rows: Wk[] = MAX_STRENGTH_DOSE.map((d, i) => {
    // The heavy day's two additions (brief §4a): an isometric pull (3 s, then 5 s from week 3) and a one-leg lift.
    const extra = [isoPull(3, i < 2 ? 3 : 5), singleLeg(2, i < 3 ? 6 : 5)];
    // Beginner: technique first for weeks 1–3, then the lighter end (never above 85%). Advanced: one more heavy-day set from week 2.
    if (beg && i < 3) return { a: sess("A", i === 0 ? F.test : F.youth, [...(i === 0 ? [strengthTest] : []), technique(), ...extra]), b: sess("B", F.youth, [technique()]), label: i === 0 ? TEST_START : undefined };
    const aSets = adv && i >= 1 ? String(Number(d.a[0]) + 1) : d.a[0];
    const aPct = beg ? "75–85" : d.a[2];
    const a = heavy(aSets, d.a[1], aPct);
    const b = heavy(d.b[0], d.b[1], d.b[2], "3");
    return { a: sess("A", i === 0 ? F.test : F.heavyDay, [...(i === 0 ? [strengthTest] : []), a, ...extra]), b: sess("B", F.lighterDay, [b]), label: i === 0 ? TEST_START : undefined };
  });
  rows.push({ a: sess("A", F.light, [heavyLight]), b: sess("B", F.light, [heavyLight]), label: EASE });
  rows.push({ a: sess("A", F.test, [strengthTest, heavyLight]), b: sess("B", F.light, [heavyLight]), label: TEST });
  return weeks8(rows);
}

// ─── Explosive power ─────────────────────────────────────────────────────────────────────────────────────────────

export type ExplosiveStart = "youth" | "strength_first" | "power";
export const EXPLOSIVE_START_LABEL: Record<ExplosiveStart, Bi> = {
  youth: { en: "Youth level", is: "Unglingastig" },
  strength_first: { en: "Strength first, then power", is: "Styrkur fyrst, svo kraftur" },
  power: { en: "Jump squats + keep strength", is: "Hnébeygjuhopp + halda styrk" },
};

/** Force-plate reads older than this are not used to pick the start (the same 12-month rule as the loader's tests). */
const MAX_STRENGTH_AGE_DAYS = 365;
const daysApart = (a: string, b: string) => Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
/** The strength read is fresh when its test date is known and within 12 months. */
const strengthFresh = (input: GoalPlanInput) => {
  const d = input.strength?.date;
  return !!d && !!input.todayIso && daysApart(d, input.todayIso) <= MAX_STRENGTH_AGE_DAYS;
};
/**
 * The strength read the gym goals may use: the strength-to-jump ratio (DSI) only from a test within 12 months (the
 * loader already drops an old mid-thigh pull, but not the ratio). An old test is named as missing data instead.
 */
function strengthOf(input: GoalPlanInput): GoalPlanInput["strength"] {
  const s = input.strength;
  if (!s) return null;
  if (strengthFresh(input)) return s;
  const kept = { ...s, dsiTier: null, dsiBasis: null };
  return kept.imtpBand == null && kept.imtpRelNkg == null ? null : kept;
}

const lowStrength = (input: GoalPlanInput) => strengthOf(input)?.imtpBand === "below" || strengthOf(input)?.imtpBand === "average";

export const explosiveAllowed = (input: GoalPlanInput): ExplosiveStart[] => (isYouth(input.ageYears) ? ["youth"] : ["strength_first", "power"]);

export function explosiveStart(input: GoalPlanInput): ExplosiveStart {
  if (isYouth(input.ageYears)) return "youth";
  const s = strengthOf(input);
  // The strength test first (Suchomel 2020): weak → strength first. No strength test: a high DSI (uses its strength
  // fast already) also means strength is what is short.
  if (lowStrength(input) || (s?.imtpBand == null && s?.dsiTier === "max_strength")) return "strength_first";
  return "power";
}

/** Light jump squats (A) / body-weight jump squats (B), sets by week (Cormie 2010a/b: 5 × 5 at 30%, 7 × 6 at body weight). */
const POWER_SETS: Array<[number, number]> = [[4, 5], [5, 5], [5, 6], [5, 6], [5, 6], [5, 5]];

export function explosiveWeeks(start: ExplosiveStart, level: TrainingLevel = "intermediate") {
  if (start === "youth") return youthWeeks((i) => [bodyJumpSquats(i === 0 || i >= 6 ? 2 : 3, 5)]);
  const beg = level === "beginner";
  const adv = level === "advanced";
  const keep = (): GoalBlock => (beg ? technique() : heavy("2", "3–4", "80–85", "3"));
  const rows: Wk[] = POWER_SETS.map(([a, b], i) => {
    const testWeek = i === 0 || i === 3;
    const t = testWeek ? [cmjTest] : [];
    const label = i === 0 ? TEST_START : i === 3 ? TEST : undefined;
    // Strength first: weeks 1–3 heavy, with a little jumping kept in.
    if (start === "strength_first" && i < 3) {
      const d = MAX_STRENGTH_DOSE[i];
      const main = beg ? technique() : heavy(adv && i >= 1 ? String(Number(d.a[0]) + 1) : d.a[0], d.a[1], d.a[2]);
      return {
        a: sess("A", testWeek ? F.test : F.heavyDay, [...t, ...(i === 0 ? [strengthTest] : []), lightJumpSquats(3), main]),
        b: sess("B", F.lighterDay, [beg ? technique() : heavy(d.b[0], d.b[1], d.b[2], "3")]),
        label,
      };
    }
    // Beginner: body-weight jump squats only for the first 2 power weeks, then light loads.
    const firstPower = start === "strength_first" ? 3 : 0;
    const bodyOnly = beg && i < firstPower + 2;
    const aSets = adv ? a + 1 : a;
    // The coach's additions (brief §4a): a fast isometric pull on the heavy day, low drop jumps on the second day (not
    // in a beginner's body-weight weeks). The box starts at 20 cm in the first power week.
    const [ds, cm] = DROP_BY_WEEK[i - firstPower];
    return {
      a: sess("A", testWeek ? F.testPower : F.powerKeep, [...t, bodyOnly ? bodyJumpSquats(aSets, 5) : lightJumpSquats(aSets), keep(), isoPull(3, 2, true)]),
      b: sess("B", F.powerDay, [bodyJumpSquats(adv ? b + 1 : b), ...(bodyOnly ? [] : [lowDrops(ds, cm)])]),
      label,
    };
  });
  rows.push({ a: sess("A", F.light, [lightJumpSquats(3), heavyLight]), b: sess("B", F.light, [bodyJumpSquats(3), lowDrops(2, 20)]), label: EASE });
  rows.push({ a: sess("A", F.testPower, [cmjTest, lightJumpSquats(3), heavyLight]), b: sess("B", F.light, [bodyJumpSquats(3), lowDrops(2, 20)]), label: TEST });
  return weeks8(rows);
}

// ─── Strength + power ────────────────────────────────────────────────────────────────────────────────────────────

export type StrengthPowerStart = "youth" | "strength_led" | "even" | "power_led";
export const STRENGTH_POWER_START_LABEL: Record<StrengthPowerStart, Bi> = {
  youth: { en: "Youth level", is: "Unglingastig" },
  strength_led: { en: "More strength", is: "Meiri styrkur" },
  even: { en: "Even split", is: "Jöfn skipting" },
  power_led: { en: "More power", is: "Meiri kraftur" },
};

export const strengthPowerAllowed = (input: GoalPlanInput): StrengthPowerStart[] => (isYouth(input.ageYears) ? ["youth"] : ["strength_led", "even", "power_led"]);

export function strengthPowerStart(input: GoalPlanInput): StrengthPowerStart {
  if (isYouth(input.ageYears)) return "youth";
  const s = strengthOf(input);
  const strong = s?.imtpBand === "good" || s?.imtpBand === "elite";
  // Weak on the strength test, or a high DSI (already turns its strength into the jump) → more strength.
  if (lowStrength(input) || s?.dsiTier === "max_strength") return "strength_led";
  // Strong (or no strength test) and a low DSI → more power. A low DSI with a weak pull went to strength above.
  if (s?.dsiTier === "ballistic" && (strong || s?.imtpBand == null)) return "power_led";
  return "even";
}

export function strengthPowerWeeks(start: StrengthPowerStart, level: TrainingLevel = "intermediate") {
  if (start === "youth") return youthWeeks((i) => [bodyJumpSquats(i === 0 || i >= 6 ? 2 : 3, 5)]);
  const beg = level === "beginner";
  const adv = level === "advanced";
  const rows: Wk[] = MAX_STRENGTH_DOSE.map((d, i) => {
    const testWeek = i === 0;
    const t = testWeek ? [cmjTest, strengthTest] : [];
    const label = i === 0 ? TEST_START : undefined;
    const [ps, pr] = POWER_SETS[i];
    const plus = adv ? 1 : 0;
    const heavyA = beg && i < 3 ? technique() : heavy(String(Number(d.a[0]) + (adv && i >= 1 ? 1 : 0)), d.a[1], beg ? "75–85" : d.a[2]);
    const keep = beg ? technique() : heavy("2", "3–4", "80–85", "3");
    const jumps = beg && i < 2 ? bodyJumpSquats(ps, 5) : lightJumpSquats(ps + plus);
    if (start === "strength_led") {
      return { a: sess("A", testWeek ? F.test : F.heavyDay, [...t, heavyA]), b: sess("B", F.powerKeep, [jumps, keep]), label };
    }
    if (start === "power_led") {
      return { a: sess("A", testWeek ? F.testPower : F.powerKeep, [...t, jumps, keep]), b: sess("B", F.powerDay, [bodyJumpSquats(pr + plus)]), label };
    }
    return { a: sess("A", testWeek ? F.test : F.heavyDay, [...t, heavyA]), b: sess("B", F.powerDay, [jumps]), label };
  });
  rows.push({ a: sess("A", F.light, [heavyLight]), b: sess("B", F.light, [lightJumpSquats(3)]), label: EASE });
  rows.push({ a: sess("A", F.test, [cmjTest, strengthTest, heavyLight]), b: sess("B", F.light, [lightJumpSquats(3)]), label: TEST });
  return weeks8(rows);
}

// ─── Parts ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** What the plan read from the player's data, for the confidence line. */
function readUsed(input: GoalPlanInput, wantJump: boolean): { used: Bi[]; missing: Bi[] } {
  const used: Bi[] = [];
  const missing: Bi[] = [];
  const s = strengthOf(input);
  const stale = !!input.strength?.dsiTier && !strengthFresh(input);
  if (s?.imtpBand) used.push({ en: `Mid-thigh pull: ${BAND_LABEL[s.imtpBand].en}${s.date ? ` (${s.date})` : ""}`, is: `Tog frá miðju læri: ${BAND_LABEL[s.imtpBand].is}${s.date ? ` (${s.date})` : ""}` });
  if (s?.dsiTier) used.push({ en: `Dynamic Strength Index, ${s.dsiBasis === "squad" ? "compared within the team" : "absolute"}`, is: `Hlutfall stökkkrafts og hámarkskrafts (DSI), ${s.dsiBasis === "squad" ? "borið saman innan liðsins" : "algilt"}` });
  if (stale) {
    const d = input.strength?.date;
    missing.push({ en: `A new force-plate test: the last one${d ? ` (${d})` : ""} is older than 12 months, so it is not used (or a lift test in week 1)`, is: `Nýtt próf á kraftplötu: það síðasta${d ? ` (${d})` : ""} er eldra en 12 mánaða og er því ekki notað (eða lyftupróf í viku 1)` });
  } else {
    if (!s?.imtpBand) missing.push({ en: "Strength test on the force plates (or a lift test in week 1)", is: "Styrkpróf á kraftplötu (eða lyftupróf í viku 1)" });
    if (!s?.dsiTier) missing.push({ en: "Jump and strength tests on the same force plates (for the strength-to-jump ratio)", is: "Stökk- og styrkpróf á sömu kraftplötu (fyrir hlutfall styrks og stökks)" });
  }
  if (wantJump) {
    if (input.cmj?.heightCm != null) used.push({ en: `Jump height ${input.cmj.heightCm.toFixed(1)} cm`, is: `Stökkhæð ${input.cmj.heightCm.toFixed(1).replace(".", ",")} cm` });
    else missing.push({ en: "Jump test — taken in week 1", is: "Stökkpróf — tekið í viku 1" });
  }
  if (input.ageYears == null) missing.push({ en: "Date of birth", is: "Fæðingardagur" });
  return { used, missing };
}

const confidenceOf = (used: Bi[]): "high" | "moderate" | "low" => (used.length >= 2 ? "high" : used.length === 1 ? "moderate" : "low");

const SEASON_SAFETY: Bi = {
  en: "Built in pre-season and off-season. In season the team's own session holds what was built (same weight, no extra sets).",
  is: "Byggt upp á undirbúnings- og hvíldartímabili. Á keppnistímabili heldur liðsæfingin því sem byggðist upp (sama þyngd, engin aukasett).",
};
const NOT_TO_FAILURE: Bi = {
  en: "Never to failure, and add weight only when every rep keeps depth and technique.",
  is: "Aldrei í þrot, og bættu aðeins við þyngd þegar hver endurtekning heldur dýpt og tækni.",
};
const YOUTH_SAFETY: Bi = {
  en: "Under 18: technique-first lifts at about 60% of max (never above 75%), body-weight jumps only, no heavy lift test, a coach at every session.",
  is: "Undir 18 ára: lyftur þar sem tæknin kemur fyrst á um 60% af hámarki (aldrei yfir 75%), aðeins hopp með eigin þyngd, ekkert hámarkspróf, þjálfari við hverja æfingu.",
};
const LIMIT_MEN: Bi = {
  en: "The dose trials were on men, mostly not team-sport players, out of season and 3 times a week; this plan uses 2 days a week inside the team session.",
  is: "Rannsóknirnar á skömmtunum voru á körlum, flestum ekki í hópíþróttum, utan keppnistímabils og 3 sinnum í viku; þessi áætlun notar 2 daga í viku innan liðsæfingarinnar.",
};
const LIMIT_DSI: Bi = {
  en: "No study tested choosing the plan from the strength test and the strength-to-jump ratio (DSI); the DSI cut-offs were never tested in training. That choice is MicroPulse's rule.",
  is: "Engin rannsókn prófaði að velja áætlunina út frá styrkprófi og hlutfalli styrks og stökks (DSI); DSI-mörkin voru aldrei prófuð í þjálfun. Það val er regla MicroPulse.",
};
const LIMIT_ADDITIONS: Bi = {
  en: "The isometric pull, the one-leg lift and the low drop jumps are the coach's additions (2026-11-22). No study behind this plan tested them inside it; their doses are MicroPulse's, except the drop jumps' start (Sánchez-Sixto 2021), stopped at 30 cm.",
  is: "Kyrrstöðutogið, lyftan á öðrum fæti og lágu fallhoppin eru viðbætur þjálfarans (2026-11-22). Engin rannsókn á bak við þessa áætlun prófaði þær innan hennar; skammtarnir eru MicroPulse, nema byrjun fallhoppanna (Sánchez-Sixto 2021), stöðvuð við 30 cm.",
};
const LIMIT_SEQUENCE: Bi = {
  en: "\"Strength first, then power\" is the authors' advice; no study here tested a strength block before a power block against power alone (Marshall 2021).",
  is: "„Styrkur fyrst, svo kraftur\" er ráð höfundanna; engin rannsókn hér prófaði styrkblokk á undan kraftblokk á móti krafti einum (Marshall 2021).",
};

const STRENGTH_TESTS = {
  weeks: [1, 8],
  what: { en: "Strength test in week 1 and week 8: mid-thigh pull on the force plates, or the heaviest 3–5 reps on the main lift (same lift, same set-up).", is: "Styrkpróf í viku 1 og viku 8: tog frá miðju læri á kraftplötu, eða þyngsta þyngd 3–5 sinnum í aðallyftunni (sama lyfta, sama uppsetning)." },
  change: { en: "Under 5% stronger is read as no clear change — a MicroPulse rule (lift tests and the plates both vary a little day to day).", is: "Undir 5% aukning í styrk er lesin sem engin skýr breyting — regla MicroPulse (lyftupróf og plötur sveiflast bæði aðeins milli daga)." },
};
const JUMP_TESTS = {
  weeks: [1, 4, 8],
  what: { en: "Jump test (CMJ) in weeks 1, 4 and 8, same device each time.", is: "Stökkpróf (CMJ) í vikum 1, 4 og 8, sama tæki í hvert sinn." },
  change: { en: "Under 2% higher (about 0.7 cm on a 35 cm jump) is read as no clear change — a MicroPulse rule.", is: "Undir 2% hækkun (um 0,7 cm á 35 cm stökki) er lesin sem engin skýr breyting — regla MicroPulse." },
};

/** Under 18: the plates or the jump, never a heavy lift test. */
const YOUTH_TESTS = {
  weeks: [1, 8],
  what: { en: "Mid-thigh pull on the force plates, or the jump test when there are no plates, in week 1 and week 8. No heavy lift test under 18.", is: "Tog frá miðju læri á kraftplötu, eða stökkpróf ef engin plata er, í viku 1 og viku 8. Ekkert hámarkspróf í lyftu undir 18 ára." },
  change: { en: "Under 5% more on the pull, or under 2% higher jump, is read as no clear change — MicroPulse rules.", is: "Undir 5% meira í togi, eða undir 2% hærra stökk, er lesið sem engin skýr breyting — reglur MicroPulse." },
};

export function buildMaxStrengthParts(input: GoalPlanInput): GoalParts {
  const start = pickStart(input, maxStrengthStart(input), maxStrengthAllowed(input));
  const { used, missing } = readUsed(input, false);
  const band = strengthOf(input)?.imtpBand ?? null;
  const startWhy: Bi = start === "youth"
    ? { en: "Under 18 (or age unknown): technique-first squats and lunges at about 60% of max, two days a week.", is: "Undir 18 ára (eða aldur óþekktur): hnébeygja og framstig þar sem tæknin kemur fyrst, á um 60% af hámarki, tvo daga í viku." }
    : band
      ? { en: `Mid-thigh pull ${BAND_LABEL[band].en} for the player's group: a heavy day and a lighter day each week, stepping up for 6 weeks.`, is: `Tog frá miðju læri ${BAND_LABEL[band].is} miðað við hóp leikmannsins: þungur dagur og léttari dagur í hverri viku, stígandi í 6 vikur.` }
      : { en: "A heavy day and a lighter day each week, stepping up for 6 weeks, then a light week and a test.", is: "Þungur dagur og léttari dagur í hverri viku, stígandi í 6 vikur, svo létt vika og próf." };
  return {
    verdict: start === "youth"
      ? { en: "Technique-first strength twice a week for 8 weeks, inside the team strength session.", is: "Styrkur þar sem tæknin kemur fyrst tvisvar í viku í 8 vikur, innan styrktaræfingar liðsins." }
      : { en: "Heavy squats or trap-bar deadlifts twice a week for 8 weeks, inside the team strength session.", is: "Þungar hnébeygjur eða trap bar-lyftur tvisvar í viku í 8 vikur, innan styrktaræfingar liðsins." },
    facts: [
      startWhy,
      { en: "In a 10-week trial, heavy squats raised the squat max about 31% and improved the jump and 40 m as much as jump training did (Cormie 2010a).", is: "Í 10 vikna rannsókn hækkaði þung hnébeygja hámarkið um u.þ.b. 31% og bætti stökk og 40 m jafnmikið og hoppþjálfun (Cormie 2010a)." },
      { en: "No extra session: the goal's lifts take the place of the matching lifts in the team strength session.", is: "Engin aukaæfing: lyftur markmiðsins koma í stað samsvarandi lyfta á styrktaræfingu liðsins." },
    ],
    branch: { key: start, label: MAX_STRENGTH_START_LABEL[start], why: startWhy },
    start,
    counterfactual: start === "youth"
      ? { en: "From 18 (with the date of birth on record), the plan would use heavy lifts at 75–90% of max.", is: "Frá 18 ára aldri (með fæðingardag skráðan) myndi áætlunin nota þungar lyftur á 75–90% af hámarki." }
      : { en: "If the mid-thigh pull were above average and the jump already used little of that strength, the tests would point to Explosive power instead.", is: "Ef togið frá miðju læri væri yfir meðallagi og stökkið nýtti lítið af þeim styrk, bentu prófin frekar á Sprengikraft." },
    evidence: "partly",
    confidence: { level: confidenceOf(used), used, missing },
    weeks: maxStrengthWeeks(start, input.level ?? "intermediate"),
    tests: start === "youth" ? YOUTH_TESTS : STRENGTH_TESTS,
    safety: [SEASON_SAFETY, NOT_TO_FAILURE, YOUTH_SAFETY],
    limits: [
      LIMIT_MEN,
      { en: "Stronger players jump higher and sprint faster on average, but no study gives a strength level after which more stops helping (Stone 2002).", is: "Sterkari leikmenn stökkva hærra og hlaupa hraðar að jafnaði, en engin rannsókn gefur styrkstig þar sem meiri styrkur hættir að hjálpa (Stone 2002)." },
      LIMIT_DSI,
      ...(start === "youth" ? [] : [LIMIT_ADDITIONS]),
    ],
    refs: ["cormie2010a", "cuthbert2021", "stone2002", "smilios2013", "suchomel2020"].map((k) => GYM_REFS[k]),
  };
}

export function buildExplosiveParts(input: GoalPlanInput): GoalParts {
  const start = pickStart(input, explosiveStart(input), explosiveAllowed(input));
  const { used, missing } = readUsed(input, true);
  const s = strengthOf(input);
  const startWhy: Bi = start === "youth"
    ? { en: "Under 18 (or age unknown): body-weight jump squats and technique-first lifts.", is: "Undir 18 ára (eða aldur óþekktur): hnébeygjuhopp með eigin þyngd og lyftur þar sem tæknin kemur fyrst." }
    : start === "strength_first"
      ? s?.imtpBand
        ? { en: `Mid-thigh pull ${BAND_LABEL[s.imtpBand].en} for the player's group: three heavier weeks first, then jump squats. Weaker men gained as much jump from heavy squats as from jump squats, plus more strength.`, is: `Tog frá miðju læri ${BAND_LABEL[s.imtpBand].is} miðað við hóp leikmannsins: þrjár þyngri vikur fyrst, svo hnébeygjuhopp. Óvanari karlar fengu jafnmikið stökk úr þungri hnébeygju og úr hnébeygjuhoppum, auk meiri styrks.` }
        : { en: "The force plates show the jump already uses most of the strength there is, so three heavier weeks come first, then jump squats.", is: "Kraftplatan sýnir að stökkið nýtir nú þegar mest af styrknum, svo þrjár þyngri vikur koma fyrst, svo hnébeygjuhopp." }
      : s?.imtpBand
        ? { en: `Mid-thigh pull ${BAND_LABEL[s.imtpBand].en}: the strength is there, so the plan turns it into speed with jump squats, keeping some heavy lifting.`, is: `Tog frá miðju læri ${BAND_LABEL[s.imtpBand].is}: styrkurinn er til staðar, svo áætlunin breytir honum í hraða með hnébeygjuhoppum og heldur þungum lyftum inni.` }
        : { en: "No clear sign that strength is short, so the plan goes straight to jump squats, keeping some heavy lifting.", is: "Ekkert skýrt merki um að styrk vanti, svo áætlunin fer beint í hnébeygjuhopp og heldur þungum lyftum inni." };
  const counterfactual: Bi = start === "youth"
    ? { en: "From 18 (with the date of birth on record), the plan would start from the strength test instead.", is: "Frá 18 ára aldri (með fæðingardag skráðan) myndi áætlunin byrja út frá styrkprófinu í staðinn." }
    : start === "strength_first"
      ? { en: "If the mid-thigh pull had been above average, the plan would start with jump squats from week 1.", is: "Ef togið frá miðju læri hefði verið yfir meðallagi byrjaði áætlunin á hnébeygjuhoppum frá viku 1." }
      : { en: "If the mid-thigh pull had been average or below, the plan would start with three heavier weeks.", is: "Ef togið frá miðju læri hefði verið í meðallagi eða undir byrjaði áætlunin á þremur þyngri vikum." };
  return {
    verdict: start === "youth"
      ? { en: "Body-weight jump squats and technique-first lifts twice a week for 8 weeks, inside the team strength session.", is: "Hnébeygjuhopp með eigin þyngd og lyftur þar sem tæknin kemur fyrst tvisvar í viku í 8 vikur, innan styrktaræfingar liðsins." }
      : start === "strength_first"
        ? { en: "Three heavier weeks, then jump squats twice a week, inside the team strength session.", is: "Þrjár þyngri vikur, svo hnébeygjuhopp tvisvar í viku, innan styrktaræfingar liðsins." }
        : { en: "Jump squats twice a week for 8 weeks, with some heavy lifting kept in, inside the team strength session.", is: "Hnébeygjuhopp tvisvar í viku í 8 vikur, með þungum lyftum áfram inni, innan styrktaræfingar liðsins." },
    facts: [
      startWhy,
      { en: "Jump squats at body weight and at about 30% of max raised jump power about 18% and the jump about 6 cm in 10 weeks (Cormie 2010a).", is: "Hnébeygjuhopp með eigin þyngd og á um 30% af hámarki hækkuðu stökkafl um u.þ.b. 18% og stökkið um u.þ.b. 6 cm á 10 vikum (Cormie 2010a)." },
      { en: "Some heavy lifting stays in: without it, strength fell in the trial (Cormie 2010b).", is: "Þungar lyftur haldast inni: án þeirra lækkaði styrkurinn í rannsókninni (Cormie 2010b)." },
    ],
    branch: { key: start, label: EXPLOSIVE_START_LABEL[start], why: startWhy },
    start,
    counterfactual,
    evidence: "partly",
    confidence: { level: confidenceOf(used), used, missing },
    weeks: explosiveWeeks(start, input.level ?? "intermediate"),
    tests: start === "youth" ? YOUTH_TESTS : JUMP_TESTS,
    safety: [SEASON_SAFETY, { en: "Every jump as high as possible; stop the set when the jumps get lower. Land soft.", is: "Hvert hopp eins hátt og hægt er; hættu settinu þegar hoppin lækka. Lentu mjúkt." }, YOUTH_SAFETY],
    limits: [
      LIMIT_MEN,
      { en: "Stronger men tended to gain more from jump squats than weaker men, but the difference was not significant (Cormie 2010b).", is: "Sterkari karlar bættu sig að jafnaði meira af hnébeygjuhoppum en þeir veikari, en munurinn var ekki marktækur (Cormie 2010b)." },
      LIMIT_SEQUENCE,
      LIMIT_DSI,
      ...(start === "youth" ? [] : [LIMIT_ADDITIONS]),
    ],
    refs: ["cormie2010a", "cormie2010b", "smilios2013", "cormie2007", "marshall2021", "suchomel2020", "suchomel2017", "garciavalverde2022", ...(start === "youth" ? [] : ["sanchezsixto2021", "saezdevillarreal2009"])].map((k) => GYM_REFS[k]),
  };
}

export function buildStrengthPowerParts(input: GoalPlanInput): GoalParts {
  const start = pickStart(input, strengthPowerStart(input), strengthPowerAllowed(input));
  const { used, missing } = readUsed(input, true);
  const s = strengthOf(input);
  const startWhy: Bi = start === "youth"
    ? { en: "Under 18 (or age unknown): technique-first lifts and body-weight jump squats.", is: "Undir 18 ára (eða aldur óþekktur): lyftur þar sem tæknin kemur fyrst og hnébeygjuhopp með eigin þyngd." }
    : start === "strength_led"
      ? s?.imtpBand && lowStrength(input)
        ? { en: `Mid-thigh pull ${BAND_LABEL[s.imtpBand].en} for the player's group, so the heavier day leads: a heavy day, and jump squats with a short heavy lift.`, is: `Tog frá miðju læri ${BAND_LABEL[s.imtpBand].is} miðað við hóp leikmannsins, svo þyngri dagurinn leiðir: þungur dagur, og hnébeygjuhopp með stuttri þungri lyftu.` }
        : { en: "The jump already uses most of the strength there is, so the heavier day leads: a heavy day, and jump squats with a short heavy lift.", is: "Stökkið nýtir nú þegar mest af styrknum, svo þyngri dagurinn leiðir: þungur dagur, og hnébeygjuhopp með stuttri þungri lyftu." }
      : start === "power_led"
        ? { en: "A strong pull, but the jump uses little of that strength, so power leads: jump squats on both days, with a short heavy lift.", is: "Sterkt tog, en stökkið nýtir lítið af þeim styrk, svo krafturinn leiðir: hnébeygjuhopp báða dagana, með stuttri þungri lyftu." }
        : { en: "No clear gap between strength and jump, so one heavy day and one jump-squat day each week.", is: "Ekkert skýrt bil milli styrks og stökks, svo einn þungur dagur og einn dagur með hnébeygjuhoppum í hverri viku." };
  const counterfactual: Bi = start === "youth"
    ? { en: "From 18 (with the date of birth on record), the split would follow the strength test and the strength-to-jump ratio.", is: "Frá 18 ára aldri (með fæðingardag skráðan) myndi skiptingin fylgja styrkprófinu og hlutfalli styrks og stökks." }
    : start === "strength_led"
      ? { en: "If the pull were above average and the jump used little of it, power would lead instead.", is: "Ef togið væri yfir meðallagi og stökkið nýtti lítið af því, leiddi krafturinn frekar." }
      : start === "power_led"
        ? { en: "If the pull had been average or below, the heavier day would lead instead.", is: "Ef togið hefði verið í meðallagi eða undir leiddi þyngri dagurinn frekar." }
        : { en: "A weak pull or a jump that already uses most of the strength would make the heavy day lead; a strong pull with a jump that uses little of it would make power lead.", is: "Veikt tog eða stökk sem nýtir nú þegar mest af styrknum léti þunga daginn leiða; sterkt tog með stökk sem nýtir lítið af honum léti kraftinn leiða." };
  return {
    verdict: start === "youth"
      ? { en: "Technique-first lifts and body-weight jump squats twice a week for 8 weeks, inside the team strength session.", is: "Lyftur þar sem tæknin kemur fyrst og hnébeygjuhopp með eigin þyngd tvisvar í viku í 8 vikur, innan styrktaræfingar liðsins." }
      : { en: "Heavy lifts and jump squats twice a week for 8 weeks, split by the player's tests, inside the team strength session.", is: "Þungar lyftur og hnébeygjuhopp tvisvar í viku í 8 vikur, skipt eftir prófum leikmannsins, innan styrktaræfingar liðsins." },
    facts: [
      startWhy,
      { en: "Heavy squats and jump squats each improved the jump about the same in 10 weeks; only heavy squats raised the max much (Cormie 2010a).", is: "Þung hnébeygja og hnébeygjuhopp bættu stökkið álíka á 10 vikum; aðeins þung hnébeygja hækkaði hámarkið að ráði (Cormie 2010a)." },
      { en: "Read the strength-to-jump ratio with the strength test, never alone: a low ratio often means a strong pull, not a weak jump (Suchomel 2020).", is: "Lestu hlutfall styrks og stökks með styrkprófinu, aldrei eitt og sér: lágt hlutfall þýðir oft sterkt tog, ekki veikt stökk (Suchomel 2020)." },
    ],
    branch: { key: start, label: STRENGTH_POWER_START_LABEL[start], why: startWhy },
    start,
    counterfactual,
    evidence: "partly",
    confidence: { level: confidenceOf(used), used, missing },
    weeks: strengthPowerWeeks(start, input.level ?? "intermediate"),
    tests: start === "youth" ? YOUTH_TESTS : {
      weeks: [1, 8],
      what: { en: "Jump test (CMJ) and strength test in week 1 and week 8: mid-thigh pull on the force plates, or the heaviest 3–5 reps on the main lift.", is: "Stökkpróf (CMJ) og styrkpróf í viku 1 og viku 8: tog frá miðju læri á kraftplötu, eða þyngsta þyngd 3–5 sinnum í aðallyftunni." },
      change: { en: "Under 2% higher jump or under 5% more strength is read as no clear change — MicroPulse rules.", is: "Undir 2% hærra stökk eða undir 5% meiri styrkur er lesið sem engin skýr breyting — reglur MicroPulse." },
    },
    safety: [SEASON_SAFETY, NOT_TO_FAILURE, YOUTH_SAFETY],
    limits: [LIMIT_MEN, LIMIT_DSI, LIMIT_SEQUENCE],
    refs: ["cormie2010a", "cormie2010b", "suchomel2020", "smilios2013", "cuthbert2021", "marshall2021", "suchomel2017"].map((k) => GYM_REFS[k]),
  };
}

export const GYM_START_LABELS: Record<GymQuality, Record<string, Bi>> = {
  max_strength: MAX_STRENGTH_START_LABEL,
  explosive: EXPLOSIVE_START_LABEL,
  strength_power: STRENGTH_POWER_START_LABEL,
};
