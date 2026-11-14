/**
 * Goal plan: vertical jump (CMJ). Football and basketball.
 *
 * Read in full for this (Nov 2026): Bedoya 2015 (youth soccer plyometrics), Ebben (plyometric volume),
 * Marshall 2021 (training sequences), Jiménez-Reyes 2017 (individualised by force–velocity profile),
 * Lloyd & Oliver 2012 (Youth Physical Development model), Sánchez-Sixto 2021 (female basketball).
 *
 * Added Nov 2026 (lota 3), read in full: Sáez de Villarreal 2009 (56-study meta-analysis of plyometric variables),
 * Markovic 2007 (26-study meta-analysis), Pardos-Mainer 2021 (female soccer, strength vs plyometric), Thapa 2021
 * (complex training in soccer), Ma 2025 (training programmes vs vertical jump, network meta-analysis), plus the jump
 * results of Oliver 2024. Abstract only (paywalled): Ramirez-Campillo 2020 (young male soccer), Oxfeldt 2019
 * (healthy adults). Net effect: jumps alone work; weights on top add little on average except when a lift and a
 * similar jump are paired in the same session (Ma 2025); longer blocks and more sessions go with bigger gains.
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
import { JUMP_LEVEL_CONTACTS, type TrainingLevel } from "./levels";
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
  saezdevillarreal2009: { key: "saezdevillarreal2009", short: "Sáez de Villarreal 2009", cite: "Sáez-Sáez de Villarreal E, Kellis E, Kraemer WJ, Izquierdo M. Determining variables of plyometric training for improving vertical jump height performance: a meta-analysis. J Strength Cond Res 2009;23(2):495–506.", verifiedFrom: "full_text" },
  markovic2007: { key: "markovic2007", short: "Markovic 2007", cite: "Markovic G. Does plyometric training improve vertical jump height? A meta-analytical review. Br J Sports Med 2007;41(6):349–355. doi:10.1136/bjsm.2007.035113", verifiedFrom: "full_text" },
  pardosmainer2021: { key: "pardosmainer2021", short: "Pardos-Mainer 2021", cite: "Pardos-Mainer E, Lozano D, Torrontegui-Duarte M, Cartón-Llorente A, Roso-Moliner A. Effects of strength vs. plyometric training programs on vertical jumping, linear sprint and change of direction speed performance in female soccer players: a systematic review and meta-analysis. Int J Environ Res Public Health 2021;18(2):401. doi:10.3390/ijerph18020401", verifiedFrom: "full_text" },
  thapa2021: { key: "thapa2021", short: "Thapa 2021", cite: "Thapa RK, Lum D, Moran J, Ramirez-Campillo R. Effects of complex training on sprint, jump, and change of direction ability of soccer players: a systematic review and meta-analysis. Front Psychol 2021;11:627869. doi:10.3389/fpsyg.2020.627869", verifiedFrom: "full_text" },
  ma2025: { key: "ma2025", short: "Ma 2025", cite: "Ma S, Xu Y, Xu S. Effects of physical training programs on healthy athletes' vertical jump height: a systematic review with meta-analysis. J Sports Sci Med 2025;24:236–257. doi:10.52082/jssm.2025.236", verifiedFrom: "full_text" },
  ramirezcampillo2020: { key: "ramirezcampillo2020", short: "Ramirez-Campillo 2020", cite: "Ramirez-Campillo R, Castillo D, Raya-González J, et al. Effects of plyometric jump training on jump and sprint performance in young male soccer players: a systematic review and meta-analysis. Sports Med 2020;50(12):2125–2143. doi:10.1007/s40279-020-01337-1", verifiedFrom: "abstract" },
  oxfeldt2019: { key: "oxfeldt2019", short: "Oxfeldt 2019", cite: "Oxfeldt M, Overgaard K, Hvid LG, et al. Effects of plyometric training on jumping, sprint performance, and lower body muscle strength in healthy adults: a systematic review and meta-analyses. Scand J Med Sci Sports 2019;29(10):1453–1465. doi:10.1111/sms.13487", verifiedFrom: "abstract" },
};

export const JUMP_METHODS: GoalMethod[] = [
  {
    key: "rebound_jumps",
    label: { en: "Rebound jumps", is: "Endurkastshopp" },
    summary: { en: "Jump, land and jump straight up again: short ground contact, full height.", is: "Hoppa, lenda og hoppa strax upp aftur: stutt snerting, full hæð." },
    basis: "trial",
    dose: { en: "5–7 × 5 · 1 min between sets", is: "5–7 × 5 · 1 mín milli setta" },
    howTo: [
      { en: "Early in the session, after the warm-up and before running or the gym.", is: "Snemma á æfingu, eftir upphitun og á undan hlaupum eða salnum." },
      { en: "5 jumps in a row: land on the front of the foot and leave the ground again at once, every jump as high as possible.", is: "5 hopp í röð: lent á framfæti og farið strax upp aftur, hvert hopp eins hátt og hægt er." },
      { en: "Cue (coach's practice): \"the ground is hot\": short contact, but full height.", is: "Leiðbeining (reynsla þjálfara): „jörðin er heit\": stutt snerting en full hæð." },
      { en: "1 min between sets. Stop the set when contacts get long or the jumps get lower.", is: "1 mín milli setta. Hættu settinu þegar snertingar lengjast eða hoppin lækka." },
    ],
    findings: [
      { ref: "sanchezsixto2021", text: { en: "Female basketball players, 6 weeks, twice a week: rebound jumps plus squats raised CMJ 12.2%; rebound jumps plus drop jumps 7.2%; no change without them.", is: "Körfuboltakonur, 6 vikur, tvisvar í viku: endurkastshopp ásamt hnébeygju hækkuðu CMJ um 12,2%; endurkastshopp ásamt fallhoppum 7,2%; engin breyting án þeirra." } },
      { ref: "saezdevillarreal2009", text: { en: "56 studies: jump training raised jump height by about 3.9 cm (effect 0.84), against 0.8 cm in controls. Longer blocks, more sessions and more jumps a session went with bigger gains; the authors suggest over 10 weeks, over 20 sessions and over 50 jumps a session, mixing squat jumps, countermovement jumps and drop jumps.", is: "56 rannsóknir: hoppþjálfun hækkaði stökkið um u.þ.b. 3,9 cm (áhrif 0,84), á móti 0,8 cm hjá samanburðarhópum. Lengri blokkir, fleiri æfingar og fleiri hopp á æfingu fóru saman við meiri bætingu; höfundar mæla með yfir 10 vikum, yfir 20 æfingum og yfir 50 hoppum á æfingu, og blöndu af hnébeygjuhoppum, CMJ-hoppum og fallhoppum." } },
      { ref: "markovic2007", text: { en: "26 studies, 1,024 people: jump training raised the countermovement jump by 8.7% (effect 0.88). More sessions in total went with bigger gains in some jump tests; the total number of foot contacts did not. Most studies were of low quality.", is: "26 rannsóknir, 1.024 þátttakendur: hoppþjálfun hækkaði CMJ um 8,7% (áhrif 0,88). Fleiri æfingar alls fóru saman við meiri bætingu í sumum stökkprófum; heildarfjöldi snertinga ekki. Flestar rannsóknirnar voru af litlum gæðum." } },
      { ref: "pardosmainer2021", text: { en: "Women's football (12 studies): jump training raised the jump clearly more than in controls (effect 0.81); slow strength training alone barely did (0.13). Too few studies to set a dose.", is: "Kvennafótbolti (12 rannsóknir): hoppþjálfun hækkaði stökkið greinilega meira en hjá samanburðarhópum (áhrif 0,81); hægur styrkur einn og sér varla (0,13). Of fáar rannsóknir til að ákveða skammt." } },
      { ref: "ramirezcampillo2020", text: { en: "Young male footballers (33 studies, 1,499 players): jump training improved jump tests (effects 0.60–0.98).", is: "Ungir knattspyrnumenn (33 rannsóknir, 1.499 leikmenn): hoppþjálfun bætti stökkpróf (áhrif 0,60–0,98)." } },
      { ref: "oxfeldt2019", text: { en: "Healthy adults (25 studies): 4–12 weeks of jump training gave a small-to-moderate gain in jump height (effect 0.45).", is: "Heilbrigðir fullorðnir (25 rannsóknir): 4–12 vikna hoppþjálfun gaf litla til miðlungs bætingu á stökkhæð (áhrif 0,45)." } },
    ],
  },
  {
    key: "squat_cmj_jumps",
    label: { en: "Squat jumps and countermovement jumps", is: "Hopp úr hnébeygjustöðu og CMJ-hopp" },
    summary: { en: "Two plain jump types that bring a session to about 55 foot contacts: one from a still squat, one with a quick dip.", is: "Tvær einfaldar hopptegundir sem fylla æfinguna upp í um 55 snertingar: önnur úr kyrri hnébeygjustöðu, hin með snöggri beygju." },
    basis: "review",
    dose: { en: "2–4 × 5 of each, body weight · about 55 foot contacts in the session with the other jumps", is: "2–4 × 5 af hvoru, eigin þyngd · um 55 snertingar á æfingunni ásamt hinum hoppunum" },
    howTo: [
      { en: "First in the jump block, after the warm-up: they also prepare the legs for the faster jumps.", is: "Fyrst í hoppunum, eftir upphitun: þau undirbúa líka fæturna fyrir hraðari hoppin." },
      { en: "Squat jump: sink into a squat, hold still, then jump as high as possible without dipping first.", is: "Hopp úr hnébeygjustöðu: farðu niður í hnébeygju, haltu kyrru, hoppaðu svo eins hátt og hægt er án þess að dýfa þér fyrst." },
      { en: "Countermovement jump: stand tall, dip quickly and jump straight up, arms the same way every time.", is: "CMJ-hopp: réttu úr þér, beygðu þig snöggt og hoppaðu beint upp, hendur eins í hvert sinn." },
      { en: "Land soft on both feet, reset, next rep. 1 min between sets.", is: "Lentu mjúkt á báðum fótum, stilltu þig af, næsta endurtekning. 1 mín milli setta." },
      { en: "Every landing counts as a foot contact. Stop the set when the jumps get lower.", is: "Hver lending telst sem snerting. Hættu settinu þegar hoppin lækka." },
    ],
    findings: [
      { ref: "saezdevillarreal2009", text: { en: "Across studies, programmes that mixed squat jumps, countermovement jumps and drop jumps went with the biggest gain (effect 1.46, about 6 cm), against 0.40–0.66 for one jump type alone. Only 11 groups used that mix.", is: "Milli rannsókna fóru áætlanir sem blönduðu hoppum úr hnébeygjustöðu, CMJ-hoppum og fallhoppum saman við mesta bætingu (áhrif 1,46, um 6 cm), á móti 0,40–0,66 fyrir eina hopptegund. Aðeins 11 hópar notuðu þá blöndu." } },
      { ref: "markovic2007", text: { en: "Another review found no clear difference between kinds of jump programme (drop jumps, countermovement jumps or a mix).", is: "Annað yfirlit fann engan skýran mun milli tegunda hoppáætlana (fallhopp, CMJ-hopp eða blanda)." } },
    ],
  },
  {
    key: "drop_jumps",
    label: { en: "Drop jumps", is: "Fallhopp" },
    summary: { en: "Step off a low box, land and jump up at once. Box height rises over the weeks.", is: "Stígðu af lágum kassa, lentu og hoppaðu strax upp. Kassinn hækkar yfir vikurnar." },
    basis: "trial",
    dose: { en: "3–4 × 3–6 · box 20 → 40 cm", is: "3–4 × 3–6 · kassi 20 → 40 cm" },
    howTo: [
      { en: "Box 20 cm in week 1, raised step by step to 40 cm by week 4, as in the tested programme.", is: "Kassi 20 cm í viku 1, hækkaður smám saman í 40 cm í viku 4, eins og í prófuðu áætluninni." },
      { en: "Step off the box (don't jump off), land on both feet and jump straight up, as high as possible.", is: "Stígðu af kassanum (ekki hoppa af honum), lentu á báðum fótum og hoppaðu beint upp, eins hátt og hægt er." },
      { en: "If the heels slam down or the player sinks deep on landing, the box is too high: go back one height.", is: "Ef hælarnir skella niður eða leikmaðurinn sígur djúpt í lendingu er kassinn of hár: farðu eina hæð niður." },
      { en: "Before the gym, with a coach watching. Quality over number: stop when the jumps get lower.", is: "Á undan salnum, með þjálfara að fylgjast með. Gæði fram yfir fjölda: hættu þegar hoppin lækka." },
    ],
    findings: [
      { ref: "sanchezsixto2021", text: { en: "Box 20 cm in week 1 up to 40 cm by week 4, 3–4 × 3–6, alongside rebound jumps: CMJ +7.2% in 6 weeks.", is: "Kassi 20 cm í viku 1 upp í 40 cm í viku 4, 3–4 × 3–6, ásamt endurkastshoppum: CMJ +7,2% á 6 vikum." } },
      { ref: "saezdevillarreal2009", text: { en: "Across studies, box height made no clear difference to the gain. The authors favour lower boxes because they allow more jumps, and say they likely carry less injury risk; that was not measured.", is: "Milli rannsókna skipti hæð kassans ekki skýru máli fyrir bætinguna. Höfundar mæla með lægri kössum því þeir leyfa fleiri hopp, og telja þá líklega bera minni meiðslahættu; það var ekki mælt." } },
    ],
    caution: { en: "Under 18: no drop jumps before the last two weeks of the youth level, with a coach there.", is: "Undir 18 ára: engin fallhopp fyrr en í síðustu tveimur vikum unglingastigsins, og þjálfari á staðnum." },
  },
  {
    key: "squat_bar_speed",
    label: { en: "Squats by bar speed", is: "Hnébeygja eftir stangarhraða" },
    summary: { en: "Full squats with a weight you can still move fast, getting heavier over the weeks.", is: "Djúp hnébeygja með þyngd sem enn má hreyfa hratt, þyngist yfir vikurnar." },
    basis: "trial",
    dose: { en: "3 × 6 (fast, about 50–65% of max) → 3–4 × 3–4 (heavier)", is: "3 × 6 (hratt, um 50–65% af hámarki) → 3–4 × 3–4 (þyngra)" },
    howTo: [
      { en: "In the gym. If there are jumps the same day, the jumps come first.", is: "Í salnum. Ef hopp eru sama dag koma hoppin fyrst." },
      { en: "Full depth, controlled down, every rep as fast as possible up.", is: "Full dýpt, stýrt niður, hver endurtekning eins hratt og hægt er upp." },
      { en: "With a bar-speed device: a weight that moves at about 1.0 m/s in weeks 1–2, 0.9 m/s in week 3 and 0.8 m/s from week 4, as in the tested programme.", is: "Með stangarhraðamæli: þyngd sem hreyfist á um 1,0 m/s í vikum 1–2, 0,9 m/s í viku 3 og 0,8 m/s frá viku 4, eins og í prófuðu áætluninni." },
      { en: "No device: start at about 50–60% of max and add a little each week while the bar still moves fast.", is: "Enginn mælir: byrjaðu á um 50–60% af hámarki og bættu aðeins við í hverri viku meðan stöngin hreyfist enn hratt." },
    ],
    findings: [
      { ref: "sanchezsixto2021", text: { en: "Squats kept force up while jumps alone lowered it; the combined group jumped more (12.2% vs 7.2%).", is: "Hnébeygjan hélt kraftinum uppi en hopp ein lækkuðu hann; samsetti hópurinn stökk hærra (12,2% á móti 7,2%)." } },
      { ref: "saezdevillarreal2009", text: { en: "Across 56 studies, adding weight training to jumps did not raise jump height more on average (effect 0.76 against 0.68 for jumps alone).", is: "Í 56 rannsóknum hækkuðu lyftingar ofan á hopp stökkið ekki meira að meðaltali (áhrif 0,76 á móti 0,68 fyrir hopp ein)." } },
      { ref: "ma2025", text: { en: "44 studies of athletes: pairing a lift with a similar jump in the same session raised the countermovement jump 2.9 cm more than jumps alone; weights alone and jumps alone did about the same (0.2 cm apart).", is: "44 rannsóknir á íþróttafólki: lyfta pöruð við svipað hopp á sömu æfingu hækkaði CMJ um 2,9 cm meira en hopp ein; lyftingar einar og hopp ein gáfu svipað (0,2 cm munur)." } },
    ],
  },
  {
    key: "heavy_strength",
    label: { en: "Heavy leg strength", is: "Þungur fótastyrkur" },
    summary: { en: "Heavy squats or deadlifts for players whose strength test is low.", is: "Þungar hnébeygjur eða réttstöðulyftur fyrir leikmenn með lágt styrkpróf." },
    basis: "trial",
    dose: { en: "3–4 × 3–5 at 80–90% of max", is: "3–4 × 3–5 á 80–90% af hámarki" },
    howTo: [
      { en: "In the gym, after any jumps (power first, strength after).", is: "Í salnum, á eftir hoppum ef þau eru (kraftur fyrst, styrkur á eftir)." },
      { en: "Squat or trap-bar deadlift: pick the one the player does with good technique.", is: "Hnébeygja eða trap bar: veldu þá sem leikmaðurinn gerir með góðri tækni." },
      { en: "Warm up with 2–3 lighter sets, then 3–4 × 3–5 at 80–90% of max, 2–3 min between sets.", is: "Hitaðu upp með 2–3 léttari settum, svo 3–4 × 3–5 á 80–90% af hámarki, 2–3 mín milli setta." },
      { en: "Add weight only when every rep keeps depth and technique.", is: "Bættu aðeins við þyngd þegar hver endurtekning heldur dýpt og tækni." },
    ],
    findings: [
      { ref: "jimenezreyes2017", text: { en: "Adult footballers and rugby players short of force trained mostly heavy for 9 weeks: squat jump +14.2%, all 22 improved. A plan matched to the profile beat the same mixed plan for everyone (+2.3%).", is: "Fullorðnir fótbolta- og ruðningsleikmenn sem vantaði kraft æfðu mest þungt í 9 vikur: hnébeygjuhopp +14,2%, allir 22 bættu sig. Áætlun sniðin að prófílnum skilaði meiru en sama blandaða áætlunin fyrir alla (+2,3%)." } },
      { ref: "thapa2021", text: { en: "Male footballers (10 studies): heavy lifts (mostly 80–90% of max) paired with jumps raised the countermovement jump more than football training alone (effect 0.96), more so in blocks of 8 weeks or longer (1.54 against 0.40). Not compared with jumps alone; no injuries were reported.", is: "Knattspyrnumenn (10 rannsóknir): þungar lyftur (mest 80–90% af hámarki) paraðar við hopp hækkuðu CMJ meira en fótboltaæfingar einar (áhrif 0,96), og meira í blokkum sem stóðu 8 vikur eða lengur (1,54 á móti 0,40). Ekki borið saman við hopp ein; engin meiðsli voru skráð." } },
      { ref: "marshall2021", text: { en: "Review: being strong comes before heavy-then-fast pairs (contrast) pay off.", is: "Yfirlit: styrkur þarf að vera til staðar áður en þungt-svo-hratt pör (contrast) skila sér." } },
    ],
  },
  {
    key: "youth_hops",
    label: { en: "Youth hops progression", is: "Hoppstigi fyrir unglinga" },
    summary: { en: "Body-weight hops that build from 56 to about 110 foot contacts over 8 weeks.", is: "Hopp með eigin þyngd sem byggjast upp úr 56 í um 110 snertingar á 8 vikum." },
    basis: "review",
    dose: { en: "Start 50–60 contacts, never over 80–120 · body weight only · 72 h between sessions", is: "Byrja á 50–60 snertingum, aldrei yfir 80–120 · aðeins eigin þyngd · 72 klst milli æfinga" },
    howTo: [
      { en: "Body weight only, on grass or a sprung floor, with a coach watching every set.", is: "Aðeins eigin þyngd, á grasi eða fjaðrandi gólfi, með þjálfara sem fylgist með hverju setti." },
      { en: "Teach the landing first: soft, quiet, knees over the toes.", is: "Kenndu lendinguna fyrst: mjúk, hljóðlát, hné yfir tám." },
      { en: "Start at about 56 foot contacts. Raise the number of jumps or their height, never both in the same week.", is: "Byrjaðu á um 56 snertingum. Fjölgaðu hoppum eða hækkaðu þau, aldrei hvoru tveggja í sömu vikunni." },
      { en: "At least 72 h between hop sessions and never over 120 foot contacts a session.", is: "Minnst 72 klst milli hoppæfinga og aldrei yfir 120 snertingar á æfingu." },
      { en: "Stop the set when landings get noisy or the knees fall in.", is: "Hættu settinu þegar lendingar verða háværar eða hnén falla inn." },
    ],
    findings: [
      { ref: "bedoya2015", text: { en: "Review of 7 youth soccer trials (10–17 y): plyometrics raised CMJ in most. Raise the number of jumps or their height, never both at once.", is: "Yfirlit 7 rannsókna á unglingum í fótbolta (10–17 ára): hopp hækkuðu CMJ í flestum. Fjölgaðu hoppum eða hækkaðu þau, aldrei hvoru tveggja í einu." } },
      { ref: "wangk2026", text: { en: "Youth soccer (55 trials for jumping): mixed neuromuscular training ranked first and strength plus plyometrics second. Low certainty; few trials reported injuries or safety.", is: "Unglingar í fótbolta (55 rannsóknir á stökki): blönduð taugavöðvaþjálfun var efst og styrkur ásamt hoppum næst. Lítil vissa; fáar rannsóknir skráðu meiðsli eða öryggi." } },
      { ref: "oliver2024", text: { en: "High-level boys (25 studies): strength, jump and combined training all raised the countermovement jump about equally (effects 0.86–1.00).", is: "Afreksstrákar (25 rannsóknir): styrkur, hopp og blanda hækkuðu CMJ öll álíka mikið (áhrif 0,86–1,00)." } },
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

/** An adult jump session's foot contacts (lota 4, coach's choice 2026-11-15): over 50 a session went with bigger gains
 *  (Sáez de Villarreal 2009). Squat + countermovement jumps top the tested rebound/drop jumps up to this. */
export const ADULT_SESSION_CONTACTS = 55;

/** Squat jumps + countermovement jumps, `sets` sets of 5 in all (squat jumps get the odd set). `hold` (beginner
 *  level): every landing held still, to teach landing first. */
const jumpMix = (sets: number, hold = false): GoalBlock => {
  const sj = Math.ceil(sets / 2);
  const cmj = sets - sj;
  return {
    method: "squat_cmj_jumps",
    contacts: sets * 5,
    what: cmj > 0 ? { en: "Squat jumps + countermovement jumps", is: "Hopp úr hnébeygjustöðu + CMJ-hopp" } : { en: "Squat jumps", is: "Hopp úr hnébeygjustöðu" },
    dose: {
      en: `${sj} × 5 squat jumps (hold still at the bottom, then jump)${cmj > 0 ? ` · ${cmj} × 5 countermovement jumps` : ""} · body weight${hold ? " · land and hold still for 2 s" : ""} · 1 min between sets`,
      is: `${sj} × 5 hopp úr hnébeygjustöðu (kyrr í botni, svo upp)${cmj > 0 ? ` · ${cmj} × 5 CMJ-hopp` : ""} · eigin þyngd${hold ? " · lentu og haltu kyrru í 2 s" : ""} · 1 mín milli setta`,
    },
  };
};

/** The squat/countermovement top-up that brings `already` foot contacts to about `target` (none if already there). */
const topUp = (already: number, target = ADULT_SESSION_CONTACTS, hold = false): GoalBlock[] => {
  const sets = Math.round((target - already) / 5);
  return sets > 0 ? [jumpMix(sets, hold)] : [];
};
const contactsIn = (blocks: GoalBlock[]) => blocks.reduce((n, b) => n + (b.test ? 0 : b.contacts ?? 0), 0);
/** Tested jumps plus the top-up first (lower intensity first, then the fast jumps). */
const withTopUp = (jumps: GoalBlock[], target = ADULT_SESSION_CONTACTS, hold = false): GoalBlock[] => [...topUp(contactsIn(jumps), target, hold), ...jumps];

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

/** Beginner level: squat with technique first (in place of squats by bar speed or heavy lifts). */
const techSquat = (light: boolean): GoalBlock => ({
  method: "heavy_strength",
  what: { en: "Squat, technique first", is: "Hnébeygja, tækni fyrst" },
  dose: light
    ? { en: "2 × 5, light", is: "2 × 5, létt" }
    : { en: "3 × 6 at a light-to-moderate weight, 2–3 reps in reserve", is: "3 × 6 með léttri til miðlungs þyngd, 2–3 endurtekningar eftir" },
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

const sessA = (blocks: GoalBlock[], test = false, minutes = 15): GoalSession => ({
  slot: "A",
  focus: test ? { en: "Test + jumps", is: "Mæling + hopp" } : { en: "Jumps", is: "Hopp" },
  when: WHEN.warmup_any,
  minutes,
  blocks,
});

const sessB = (focus: Bi, blocks: GoalBlock[]): GoalSession => ({ slot: "B", focus, when: WHEN.gym_day, minutes: 20, blocks });
const sessC = (blocks: GoalBlock[]): GoalSession => ({ slot: "C", focus: { en: "Jumps (short)", is: "Hopp (stutt)" }, when: WHEN.off_day, minutes: 10, blocks });

// Sánchez-Sixto 2021: weeks 1–6 as tested (drop-jump boxes 20, 25, 30, 40, 40, 40 cm; rebound sets 5, 5, 6, 6, 7, 4).
const TESTED_REBOUND_SETS = [5, 5, 6, 6, 7, 4];
const TESTED_DROP_DOSE: Array<[number, number, number]> = [[3, 6, 20], [3, 6, 25], [3, 6, 30], [3, 4, 40], [4, 4, 40], [3, 3, 40]];
const TESTED_SQUAT_DOSE: Array<[string, string]> = [
  ["3 × 6, fast (bar about 1.0 m/s, roughly 50–60% of max)", "3 × 6, hratt (stöng um 1,0 m/s, u.þ.b. 50–60% af hámarki)"],
  ["3 × 6, fast (bar about 1.0 m/s)", "3 × 6, hratt (stöng um 1,0 m/s)"],
  ["3 × 6, a little heavier (bar about 0.9 m/s)", "3 × 6, aðeins þyngra (stöng um 0,9 m/s)"],
  ["3 × 4, heavier (bar about 0.8 m/s)", "3 × 4, þyngra (stöng um 0,8 m/s)"],
  ["4 × 4 (bar about 0.8 m/s)", "4 × 4 (stöng um 0,8 m/s)"],
  ["3 × 3 (bar about 0.8 m/s)", "3 × 3 (stöng um 0,8 m/s)"],
];

/** The plan's building blocks and the tested weekly doses, shared with the Programme Library team plans (`qualityPlans.ts`). */
export const JUMP_BLOCKS = { rebound, drop, squatSpeed, heavy, techSquat, cmjTest, youthHops, jumpMix, withTopUp, TESTED_REBOUND_SETS, TESTED_DROP_DOSE, TESTED_SQUAT_DOSE };

/** Advanced level: drop jumps added from week 3 (30 cm, then 40 cm from week 5), weeks 3–7 only. */
const advancedDrops = (i: number): GoalBlock[] => (i >= 2 && i < 7 ? [drop(2, 5, i < 4 ? 30 : 40)] : []);

/**
 * The goal plan's 8 weeks. `level`: the Programme Library's or the coach's choice for a goal plan (lota 5); intermediate is the default.
 * Beginner: one rebound set fewer, about 50 contacts with every landing held still, technique-first squats (the
 * fast-jumps start is not offered at this level). Advanced: about 70 contacts, drop jumps from week 3, squats one
 * step heavier. Youth ignores the level.
 */
export function jumpWeeks(start: JumpStart, level: TrainingLevel = "intermediate") {
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
  const beg = level === "beginner";
  const adv = level === "advanced";
  const target = JUMP_LEVEL_CONTACTS[level].target;
  const reboundSets = beg ? TESTED_REBOUND_SETS.map((n) => Math.max(3, n - 1)) : TESTED_REBOUND_SETS;
  const dropDose = TESTED_DROP_DOSE;
  const squatDose = TESTED_SQUAT_DOSE;
  const topped = (jumps: GoalBlock[]) => withTopUp(jumps, target, beg);
  const lightGym = (): GoalBlock => (beg ? techSquat(true) : heavy(true));
  const week = (i: number): GoalSession[] => {
    const testWeek = i === 0 || i === 3;
    if (start === "fast_jumps") {
      const [s, r, cm] = dropDose[i];
      return [
        sessA([...(testWeek ? [cmjTest] : []), ...topped([drop(s, r, cm), rebound(reboundSets[i])])], testWeek, 20),
        sessB({ en: "Gym: fast + keep strength", is: "Salur: hratt + halda styrk" }, [{ method: "squat_bar_speed", what: { en: "Light jump squats", is: "Hnébeygjuhopp með léttri þyngd" }, dose: { en: "3 × 5, fast", is: "3 × 5, hratt" } }, lightGym()]),
        sessC([rebound(3)]),
      ];
    }
    const extra = adv ? advancedDrops(i) : [];
    if (start === "strength_first") {
      return [
        sessA([...(testWeek ? [cmjTest] : []), ...topped([...extra, rebound(reboundSets[i])])], testWeek, 20),
        sessB({ en: "Gym: strength", is: "Salur: styrkur" }, [beg ? techSquat(false) : heavy(i === 5)]),
        sessC([rebound(3)]),
      ];
    }
    const [en, is] = squatDose[adv ? Math.min(i + 1, squatDose.length - 1) : i];
    return [
      sessA([...(testWeek ? [cmjTest] : []), ...topped([...extra, rebound(reboundSets[i])])], testWeek, 20),
      beg
        ? sessB({ en: "Gym: squat, technique first", is: "Salur: hnébeygja, tækni fyrst" }, [techSquat(false)])
        : sessB({ en: "Gym: squats by bar speed", is: "Salur: hnébeygja eftir stangarhraða" }, [squatSpeed(en, is)]),
      sessC([rebound(3)]),
    ];
  };
  const light: GoalSession[] = start === "fast_jumps"
    ? [sessA([drop(2, 3, 30), rebound(3)]), sessB({ en: "Gym: light", is: "Salur: létt" }, [lightGym()])]
    : [sessA([rebound(3)]), sessB({ en: "Gym: light", is: "Salur: létt" }, [start === "combined" && !beg ? squatSpeed("2 × 3, fast", "2 × 3, hratt") : lightGym()])];
  return expandWeeks([
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ weeks: [i + 1], label: (w: number) => weekLabel(w, i === 0 ? "test + start" : i === 3 ? "test" : "", i === 0 ? "mæling + byrjun" : i === 3 ? "mæling" : ""), sessions: week(i) })),
    { weeks: [7], label: (w) => weekLabel(w, "ease off", "minna magn"), sessions: light },
    { weeks: [8], label: (w) => weekLabel(w, "test", "mæling"), sessions: [sessA([cmjTest, rebound(2)], true), sessB({ en: "Gym: light", is: "Salur: létt" }, [lightGym()])] },
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
        : { en: "About 55 foot contacts in the main jump session: over 50 a session went with bigger gains across studies (Sáez de Villarreal 2009), and a plan matched to the player beat one mix for everyone (Jiménez-Reyes 2017).", is: "Um 55 snertingar á aðalhoppæfingunni: yfir 50 á æfingu fóru saman við meiri bætingu milli rannsókna (Sáez de Villarreal 2009), og áætlun sniðin að leikmanninum skilaði meiru en ein blanda fyrir alla (Jiménez-Reyes 2017)." },
      { en: "Choosing the start from the strength and jump tests was not tested in any study: that choice is MicroPulse's rule.", is: "Að velja upphafið út frá styrk- og stökkprófum var ekki prófað í neinni rannsókn: það val er regla MicroPulse." },
    ],
    branch: { key: start, label: JUMP_START_LABEL[start], why: startWhy },
    start,
    counterfactual,
    evidence: "partly",
    confidence: { level: used.length >= 2 ? "high" : used.length === 1 ? "moderate" : "low", used, missing },
    weeks: jumpWeeks(start, input.level ?? "intermediate"),
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
      { en: "The adult weekly doses come mostly from one 6-week trial in women's basketball (Sánchez-Sixto 2021); weeks 7–8 and the squat and countermovement jumps that bring a session to about 55 contacts are MicroPulse's, from the reviews.", is: "Vikuskammtar fullorðinna koma að mestu úr einni 6 vikna rannsókn í kvennakörfubolta (Sánchez-Sixto 2021); vikur 7–8 og hoppin úr hnébeygjustöðu og CMJ-hoppin sem fylla æfinguna upp í um 55 snertingar eru MicroPulse, úr yfirlitunum." },
      { en: "Reviews found bigger gains with longer blocks and more sessions (Sáez de Villarreal 2009, Thapa 2021); 8 weeks at two sessions a week is still at the low end.", is: "Yfirlit fundu meiri bætingu með lengri blokkum og fleiri æfingum (Sáez de Villarreal 2009, Thapa 2021); 8 vikur með tveimur æfingum á viku eru enn í neðri kantinum." },
      { en: "Youth evidence is mostly from boys, and its certainty is low (Wang K 2026).", is: "Gögn um unglinga eru mest frá strákum og vissan er lítil (Wang K 2026)." },
    ],
    refs: Object.values(JUMP_REFS),
  };
}
