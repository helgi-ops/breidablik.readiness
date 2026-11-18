/**
 * Goal plan: acceleration (0–10 m / 0–20 m). Football and basketball.
 *
 * Start (MicroPulse rule — no study tested a data-based choice of start):
 *   strength test low for the player's group (IMTP below / average), or DSI says "raise strength" → strength first;
 *   strength test good → starts first; no strength test → balanced.
 * Suchomel 2020 (DSI paper) shows its own athletes with low strength but a "ballistic" DSI, so a LOW strength test
 * wins over DSI here; DSI only breaks the tie when the strength band is missing.
 *
 * Read in full for this (Nov 2026): Hicks 2020, Wisløff 2004, García-Valverde 2022, Suchomel 2020, Liao 2021,
 * and (second batch) Alcaraz 2018, Petrakos 2016, Myrvang 2024, Seitz 2014, Wang K 2026.
 *
 * Sled: no review shows sled sprints beat the same sprints without a sled (Alcaraz 2018: 0.09 vs control;
 * Petrakos 2016). The default load is the range tested in adults (slows the run by 15–30%, Petrakos); heavier
 * (about half) is only a coach's option for experienced players (Alcaraz: >20% body mass not for inexperienced).
 * Volume 60–100 m sits at the bottom of Petrakos' 60–340 m and under Alcaraz's >160 m, because this is a
 * 15-minute in-season add-on — said on the card.
 *
 * Under 18 (or age unknown): always short sprints + low hops + technique strength, whatever the strength test
 * (Wang K 2026: hops + short sprints ranked first for 5–10 m in youth soccer; strength alone uncertain). No sled
 * under 18 is MicroPulse's rule, not a finding.
 */

import { SPEED_REFS } from "@/lib/micropulse/speedMethods";
import { BAND_LABEL, WHEN, expandWeeks, isYouth, pickStart, weekLabel } from "./common";
import type { GoalParts } from "./index";
import type { TrainingLevel } from "./levels";
import type { Bi, GoalBlock, GoalMethod, GoalPlanInput, GoalRef, GoalSession } from "./types";

export const ACCEL_REFS: Record<string, GoalRef> = {
  hicks2020: { key: "hicks2020", short: "Hicks 2020", cite: "Hicks DS, Schuster JG, Samozino P, Morin J-B. Improving mechanical effectiveness during sprint acceleration: practical recommendations and guidelines. Strength Cond J 2020;42(2):45–62.", verifiedFrom: "full_text" },
  wisloff2004: { key: "wisloff2004", short: "Wisløff 2004", cite: "Wisløff U, Castagna C, Helgerud J, Jones R, Hoff J. Strong correlation of maximal squat strength with sprint performance and vertical jump height in elite soccer players. Br J Sports Med 2004;38:285–288. doi:10.1136/bjsm.2002.002071", verifiedFrom: "full_text" },
  garciavalverde2022: { key: "garciavalverde2022", short: "García-Valverde 2022", cite: "García-Valverde A, Manresa-Rocamora A, Hernández-Davó JL, Sabido R. Effect of weightlifting training on jumping ability, sprinting performance and squat strength: a systematic review and meta-analysis. Int J Sports Sci Coach 2022;17(4):917–939. doi:10.1177/17479541211061695", verifiedFrom: "full_text" },
  suchomel2020: { key: "suchomel2020", short: "Suchomel 2020", cite: "Suchomel TJ, Sole CJ, Bellon CR, Stone MH. Dynamic Strength Index: relationships with common performance variables and contextualization of training recommendations. J Hum Kinet 2020;74:59–70. doi:10.2478/hukin-2020-0014", verifiedFrom: "full_text" },
  petrakos2016: { key: "petrakos2016", short: "Petrakos 2016", cite: "Petrakos G, Morin J-B, Egan B. Resisted sled sprint training to improve sprint performance: a systematic review. Sports Med 2016;46:381–400. doi:10.1007/s40279-015-0422-8", verifiedFrom: "full_text" },
  wangk2026: { key: "wangk2026", short: "Wang K 2026", cite: "Wang K, He J, Zhu A, Bi X. Effects of different training modalities on lower-limb explosive power, acceleration, 20-m sprint performance, and change-of-direction ability in youth soccer players: a systematic review and network meta-analysis. BMC Sports Sci Med Rehabil 2026;18:410. doi:10.1186/s13102-026-02041-9", verifiedFrom: "full_text" },
  liao2021: { key: "liao2021", short: "Liao 2021", cite: "Liao K-F, Wang X-X, Han M-Y, Li L-L, Nassis GP, Li Y-M. Effects of velocity based training vs. traditional 1RM percentage-based training on improving strength, jump, linear sprint and change of direction speed performance: a systematic review with meta-analysis. PLoS One 2021;16(11):e0259790.", verifiedFrom: "full_text" },
  alcaraz2018: { ...SPEED_REFS.alcaraz2018 },
  myrvang2024: { ...SPEED_REFS.myrvang2024 },
  haugen2019: { ...SPEED_REFS.haugen2019 },
  mendiguchia2020: { ...SPEED_REFS.mendiguchia2020 },
  loturco2016: { ...SPEED_REFS.loturco2016 },
  seitz2014: { ...SPEED_REFS.seitz2014 },
  hernandezbelmonte2022: { ...SPEED_REFS.hernandezbelmonte2022 },
  randell2011: { ...SPEED_REFS.randell2011 },
  jukic2022: { key: "jukic2022", short: "Jukic 2022", cite: "Jukic I, Helms ER, McGuigan MR, García-Ramos A. Using cluster and rest redistribution set structures as alternatives to resistance training prescription method based on velocity loss thresholds. PeerJ 2022;10:e13195. doi:10.7717/peerj.13195", verifiedFrom: "full_text" },
  berton2022: { key: "berton2022", short: "Berton 2022", cite: "Berton R, Silva DD, Santos ML, Silva CMP, Tricoli V. Weightlifting derivatives vs. plyometric exercises: effects on unloaded and loaded vertical jumps and sprint performance. PLoS One 2022;17(9):e0274962. doi:10.1371/journal.pone.0274962", verifiedFrom: "full_text" },
  suchomel2022: { key: "suchomel2022", short: "Suchomel 2022", cite: "Suchomel TJ, McKeever SM, Nolen JD, Comfort P. Muscle architectural and force-velocity curve adaptations following 10 weeks of training with weightlifting catching and pulling derivatives. J Sports Sci Med 2022;21:504–516. doi:10.52082/jssm.2022.504", verifiedFrom: "full_text" },
  suchomel2017: { key: "suchomel2017", short: "Suchomel 2017", cite: "Suchomel TJ, Comfort P, Lake JP. Enhancing the force–velocity profile of athletes using weightlifting derivatives. Strength Cond J 2017;39(1):10–20.", verifiedFrom: "full_text" },
};

/**
 * Weightlifting pulls (lota 6): a card in the acceleration and jump libraries and a swap option for the light jump
 * squats (`swaps.ts`). Never in a plan by default; never a swap for jumps or bounds (the one head-to-head trial favoured jumps).
 */
export const PULLING_DERIVATIVES: GoalMethod = {
  key: "pulling_derivatives",
  label: { en: "Weightlifting pulls (jump shrug, high pull)", is: "Tog úr lyftingum (jump shrug, high pull)" },
  summary: { en: "Fast pulls from Olympic lifting, without catching the bar. An option for the light jump squats once taught; not a replacement for jumps.", is: "Hröð tog úr ólympískum lyftingum, án þess að grípa stöngina. Valkostur í stað léttra hnébeygjuhoppa þegar búið er að kenna þau; koma ekki í stað hoppa." },
  basis: "trial",
  dose: { en: "3 × 3–5, fast · empty bar at first, add weight only while the jump stays high · 1–2× a week", is: "3 × 3–5, hratt · tóm stöng fyrst, þyngdu aðeins meðan hoppið helst hátt · 1–2× í viku" },
  howTo: [
    { en: "In the gym, first, before the heavy lifts, with a coach watching.", is: "Í salnum, fyrst, á undan þungu lyftunum, með þjálfara sem fylgist með." },
    { en: "Teach in this order: mid-thigh pull from blocks, then jump shrug, then hang high pull. Start with an empty bar or a stick.", is: "Kenndu í þessari röð: tog frá miðju læri af kubbum, svo jump shrug, svo hang high pull. Byrjaðu með tóma stöng eða prik." },
    { en: "Jump shrug: bar just above the knees, short dip, jump as high as possible and shrug; land soft in an athletic stance.", is: "Jump shrug: stöngin rétt fyrir ofan hné, stutt beygja, hoppað eins hátt og hægt er og axlirnar dregnar upp; lent mjúkt í íþróttastöðu." },
    { en: "Hang high pull: same start, then lead with the elbows so the bar reaches the chest; lower it under control.", is: "Hang high pull: sama byrjun, svo leiða olnbogarnir svo stöngin nái upp að bringu; látin síga stýrt niður." },
    { en: "The papers load these at 30–45% of a hang power clean max. Without that max: add weight only while every rep stays fast and high.", is: "Í greinunum er þyngdin 30–45% af hámarki í hang power clean. Án þess hámarks: bættu aðeins við þyngd meðan hver endurtekning helst hröð og há." },
  ],
  findings: [
    { ref: "berton2022", text: { en: "45 trained men new to the lifts, 8 weeks after 4 weeks of learning: jumps improved the squat jump (+7.8%) and 5–20 m sprints; the weightlifting group (pulls plus a power clean, from blocks) did not improve significantly in either.", is: "45 vanir karlar sem kunnu ekki lyfturnar, 8 vikur eftir 4 vikna kennslu: hopp bættu hnébeygjuhopp (+7,8%) og 5–20 m spretti; lyftingahópurinn (tog og power clean af kubbum) bætti hvorugt marktækt." } },
    { ref: "suchomel2022", text: { en: "27 experienced male lifters, 10 weeks: pulls without a catch gave small-to-moderate gains in countermovement-jump power (effects 0.25–0.81); the same lifts with a catch gave trivial ones. Sprints were not measured.", is: "27 vanir karlkyns lyftarar, 10 vikur: tog án grips gaf litla til miðlungs bætingu á krafti í CMJ (áhrif 0,25–0,81); sömu lyftur með gripi nánast enga. Sprettir voru ekki mældir." } },
    { ref: "garciavalverde2022", text: { en: "34 studies: Olympic lifts plus normal lifting made sprints faster (effect −0.44). Effects are before-after, without a control group.", is: "34 rannsóknir: ólympískar lyftingar ásamt venjulegum lyftingum gerðu spretti hraðari (áhrif −0,44). Áhrifin eru fyrir-eftir, án samanburðarhóps." } },
    { ref: "suchomel2017", text: { en: "Review: the jump shrug and hang high pull move faster than the hang power clean; suggested load 30–45% of the hang power clean max. Expert guidance, not a training trial.", is: "Yfirlit: jump shrug og hang high pull eru hraðari en hang power clean; ráðlögð þyngd 30–45% af hámarki í hang power clean. Ráðlegging sérfræðinga, ekki þjálfunarrannsókn." } },
  ],
  caution: { en: "Not a replacement for jumps or bounds: in the one trial that compared them, jumps did better. No study here tested these pulls in under-18s, in women or in season.", is: "Kemur ekki í stað hoppa eða skrefstökka: í einu rannsókninni sem bar þau saman gáfu hoppin meira. Engin rannsókn hér prófaði þessi tog hjá yngri en 18 ára, konum eða á keppnistímabili." },
};

export const ACCEL_METHODS: GoalMethod[] = [
  {
    key: "accel_sprints",
    label: { en: "Short sprints from a standing start", is: "Stuttir sprettir frá kyrrstöðu" },
    summary: { en: "10–20 m flat out from a standing start: the most direct way to train the first steps.", is: "10–20 m á fullu frá kyrrstöðu: beinasta leiðin til að þjálfa fyrstu skrefin." },
    basis: "trial",
    dose: { en: "4–6 × 10–20 m · 2–3 min rest", is: "4–6 × 10–20 m · 2–3 mín hvíld" },
    howTo: [
      { en: "Early in the session, straight after a full warm-up, before anything tiring.", is: "Snemma á æfingu, strax eftir fulla upphitun, á undan öllu sem þreytir." },
      { en: "Cones at the start line and at 10 m (or 20 m). Start from a split stance, the same start every time.", is: "Keilur á byrjunarlínu og við 10 m (eða 20 m). Byrjað úr skrefstöðu, sama start í hvert sinn." },
      { en: "Every rep flat out. Walk back and rest 2–3 min, so each sprint is as fast as the first.", is: "Hver sprettur á fullu. Gengið til baka og hvílt í 2–3 mín, svo hver sprettur sé jafn hraður og sá fyrsti." },
      { en: "Cue (coach's practice): \"push the ground back\" and stay low for the first steps.", is: "Leiðbeining (reynsla þjálfara): „ýttu jörðinni aftur\" og vertu lágur í fyrstu skrefunum." },
      { en: "Stop when a rep is clearly slower or the player is no longer going flat out.", is: "Hættu þegar sprettur er greinilega hægari eða leikmaðurinn fer ekki lengur á fullu." },
    ],
    findings: [
      { ref: "mendiguchia2020", text: { en: "Sprint training in footballers: 5 m time −3.4% and 20 m −2.6%.", is: "Sprettþjálfun hjá fótboltamönnum: 5 m tími −3,4% og 20 m −2,6%." } },
      { ref: "haugen2019", text: { en: "Best-practice guide: 10–50 m at over 98% effort, 2–7 min rest, 100–300 m a session.", is: "Viðmið: 10–50 m á yfir 98% átaki, 2–7 mín hvíld, 100–300 m á æfingu." } },
    ],
  },
  {
    key: "resisted_sled",
    label: { en: "Sled sprints", is: "Sleðasprettir" },
    summary: { en: "Short sprints pulling a sled. They help the start about as much as the same sprints without a sled, and do not raise top speed.", is: "Stuttir sprettir með sleða. Þeir hjálpa startinu álíka mikið og sömu sprettir án sleða og hækka ekki hámarkshraða." },
    basis: "trial",
    dose: { en: "4–5 × 15–20 m (60–100 m) · load that slows the run by 15–30% · 3 min rest · plus normal sprints", is: "4–5 × 15–20 m (60–100 m) · þyngd sem hægir hlaupið um 15–30% · 3 mín hvíld · auk venjulegra spretta" },
    howTo: [
      { en: "On grass or turf, harness at the hips. Use the same surface each time: the surface changes how heavy the sled feels.", is: "Á grasi eða gervigrasi, belti um mjaðmir. Notaðu sama undirlag í hvert sinn: undirlagið breytir því hve þungur sleðinn er." },
      { en: "Find the load in a test run: time 20 m with and without the sled; with it, the run should take 15–30% longer.", is: "Finndu þyngdina í prufuhlaupi: taktu tíma á 20 m með og án sleða; með sleðanum á hlaupið að taka 15–30% lengri tíma." },
      { en: "4–5 × 15–20 m with 3 min rest, then the normal sprints, so the last runs are without the sled.", is: "4–5 × 15–20 m með 3 mín hvíld, svo venjulegu sprettirnir, svo síðustu hlaupin séu án sleða." },
      { en: "If the player stands up tall or the stride breaks down, the sled is too heavy: take weight off (coach's practice).", is: "Ef leikmaðurinn réttir úr sér eða skrefið brotnar niður er sleðinn of þungur: taktu af þyngd (reynsla þjálfara)." },
    ],
    findings: [
      { ref: "alcaraz2018", text: { en: "13 studies: the first 10 m got 2.3% faster (effect 0.61), but no faster than with the same sprints without a sled (0.09, not significant). Over 20% of body weight did no better than lighter, and is not for inexperienced players.", is: "13 rannsóknir: fyrstu 10 m urðu 2,3% hraðari (áhrif 0,61), en ekki hraðari en með sömu sprettum án sleða (0,09, ómarktækt). Yfir 20% af líkamsþyngd gerði ekki betur en léttara og er ekki fyrir óvana leikmenn." } },
      { ref: "petrakos2016", text: { en: "11 studies, loads up to a 30% slow-down: sled sprints were no more effective than normal sprints. Blocks that worked: 6+ weeks, 2–3 a week, 60–340 m a session. Gains in season were smaller than in pre-season.", is: "11 rannsóknir, þyngdir upp í 30% hægingu: sleðasprettir voru ekki árangursríkari en venjulegir sprettir. Það sem virkaði: 6+ vikur, 2–3 í viku, 60–340 m á æfingu. Bæting á keppnistímabili var minni en á undirbúningstímabili." } },
      { ref: "myrvang2024", text: { en: "21 studies of resisted and assisted sprints (sled, vest, parachute, slope, towing): resisted sprints had a small edge over normal sprinting at 10 m only; none at 20 m or in top speed.", is: "21 rannsókn á sprettum með mótstöðu og aðstoð (sleði, vesti, fallhlíf, brekka, dráttur): mótstaða gaf lítið forskot á venjulega spretti aðeins á 10 m; ekkert á 20 m né í hámarkshraða." } },
      { ref: "hicks2020", text: { en: "A sled that slows the run by about half is called the \"best power\" load, but a trial it cites found it no better than lighter or heavier sleds: a coach's option for experienced players only.", is: "Sleði sem hægir hlaupið um u.þ.b. helming er kallaður „besta afls\"-þyngdin, en rannsókn sem vísað er í fann hann ekki betri en léttari eða þyngri sleða: val þjálfara aðeins fyrir vana leikmenn." } },
    ],
    caution: { en: "Under 18: no sled in this plan. That is MicroPulse's rule; none of the reviews sets an age limit.", is: "Undir 18 ára: enginn sleði í þessari áætlun. Það er regla MicroPulse; ekkert yfirlitanna setur aldursmörk." },
  },
  {
    key: "heavy_strength",
    label: { en: "Heavy leg strength", is: "Þungur fótastyrkur" },
    summary: { en: "Stronger legs go with faster first steps; lifting heavy is the strength-first part of the plan.", is: "Sterkari fætur fylgja hraðari fyrstu skrefum; þungar lyftur eru styrkurinn-fyrst hluti áætlunarinnar." },
    basis: "trial",
    dose: { en: "Squat or trap-bar deadlift 3–4 × 3–5 at about 75–85% of max · 2–3 min rest · 2 × a week", is: "Hnébeygja eða trap bar 3–4 × 3–5 á um 75–85% af hámarki · 2–3 mín hvíld · 2 × í viku" },
    howTo: [
      { en: "On a gym day at least 2 days before a match. Jumps and jump squats come first in the session, heavy lifts after.", is: "Á styrktardegi minnst 2 dögum fyrir leik. Hopp og hnébeygjuhopp koma fyrst á æfingunni, þungar lyftur á eftir." },
      { en: "Squat or trap-bar deadlift: pick the one the player does with good technique.", is: "Hnébeygja eða trap bar: veldu þá sem leikmaðurinn gerir með góðri tækni." },
      { en: "Warm up with 2–3 lighter sets, then 3–4 × 3–5 at a weight the player could lift 1–2 more times (about 75–85% of max).", is: "Hitaðu upp með 2–3 léttari settum, svo 3–4 × 3–5 með þyngd sem leikmaðurinn gæti lyft 1–2 sinnum oftar (um 75–85% af hámarki)." },
      { en: "Rest 2–3 min between sets. Add weight only when every rep keeps depth and technique.", is: "Hvíld 2–3 mín milli setta. Bættu aðeins við þyngd þegar hver endurtekning heldur dýpt og tækni." },
      { en: "Keep sets short: stop at about half the reps the player could do, or split each set into 2s with 30 s rest. With a bar-speed device: stop when the bar has slowed by about 10–20%.", is: "Haltu settunum stuttum: hættu við um helming þeirra endurtekninga sem leikmaðurinn gæti gert, eða skiptu settinu í tvennur með 30 s hvíld. Með stangarhraðamæli: hættu þegar stöngin hefur hægt á sér um 10–20%." },
    ],
    findings: [
      { ref: "seitz2014", text: { en: "15 trials: sprints got 3.1% faster in training groups and did not change in controls; more strength gain went with more sprint gain (r = −0.77). Two sessions a week did better than more, and 60–85% of max did best. Almost all tests were under 30 m. A 2022 re-analysis found the effect sizes inflated.", is: "15 rannsóknir: sprettir urðu 3,1% hraðari í þjálfunarhópum og breyttust ekki hjá samanburðarhópum; meiri styrktarbæting fór saman við meiri sprettbætingu (r = −0,77). Tvær æfingar á viku gáfu betra en fleiri, og 60–85% af hámarki best. Nær öll prófin voru undir 30 m. Endurgreining 2022 fann áhrifastærðirnar ofmetnar." } },
      { ref: "wisloff2004", text: { en: "17 elite footballers: stronger half squat went with faster 10 m (r = 0.94). A link, not proof that lifting makes you faster.", is: "17 afreksfótboltamenn: sterkari hálf-hnébeygja fór saman við hraðari 10 m (r = 0,94). Tengsl, ekki sönnun þess að lyftingar geri þig hraðari." } },
      { ref: "garciavalverde2022", text: { en: "34 studies: Olympic pulls plus normal lifting made sprints faster (effect −0.44); 2 days a week or fewer did as well as more (−0.50). Effects are before-after, without a control group.", is: "34 rannsóknir: ólympískar togæfingar ásamt venjulegum lyftingum gerðu spretti hraðari (áhrif −0,44); 2 dagar í viku eða færri dugðu eins vel (−0,50). Áhrifin eru fyrir-eftir, án samanburðarhóps." } },
      { ref: "liao2021", text: { en: "Choosing the weight by bar speed or by % of max made no difference to 10 m (0.01 s).", is: "Að velja þyngd eftir stangarhraða eða % af hámarki breytti engu fyrir 10 m (0,01 s)." } },
      { ref: "hernandezbelmonte2022", text: { en: "10 studies, 308 trained men: stopping sets early (at most 25% bar-speed loss, about half the reps possible) gave bigger gains within the group in sprint (effect 0.35 vs 0.05) and jump (0.59 vs 0.36) with about half the reps. Compared directly, the difference was not significant (sprint p = 0.12, jump p = 0.23).", is: "10 rannsóknir, 308 vanir karlar: að hætta settinu snemma (mest 25% hraðatap á stöng, um helmingur mögulegra endurtekninga) gaf meiri bætingu innan hópsins í spretti (áhrif 0,35 á móti 0,05) og stökki (0,59 á móti 0,36) með um helmingi færri endurtekningum. Í beinum samanburði var munurinn ekki marktækur (sprettur p = 0,12, stökk p = 0,23)." } },
      { ref: "jukic2022", text: { en: "One session, 31 trained men (Smith machine): sets of 6 split into 2s with 30 s rest, or 9 sets of 2 with 45 s rest, kept more reps under a 20% bar-speed loss than straight sets of 6. A way to keep sets short without a device; no training effect was measured.", is: "Ein æfing, 31 vanur karlmaður (Smith-vél): 6 endurtekninga sett brotin í tvennur með 30 s hvíld, eða 9 sett af 2 með 45 s hvíld, héldu fleiri endurtekningum innan við 20% hraðatap en venjuleg sett af 6. Leið til að halda settum stuttum án mælis; áhrif á þjálfun voru ekki mæld." } },
    ],
    caution: { en: "The bar-speed studies were almost all on men and mostly on a Smith machine.", is: "Rannsóknirnar á stangarhraða voru nær allar á körlum og flestar á Smith-vél." },
  },
  {
    key: "bounds",
    label: { en: "Forward bounds and hurdle hops", is: "Skrefstökk og grindahopp" },
    summary: { en: "Short, springy jumps forward: the fast part of the starts-first branch.", is: "Stutt, fjaðrandi stökk áfram: hraði hlutinn í „stört fyrst\"-greininni." },
    basis: "review",
    dose: { en: "Forward bounds 3–5 × 8 contacts · or hurdle hops 3–5 × 5 contacts", is: "Skrefstökk 3–5 × 8 snertingar · eða grindahopp 3–5 × 5 snertingar" },
    howTo: [
      { en: "On grass or turf, after the sprints and before the gym.", is: "Á grasi eða gervigrasi, á eftir sprettunum og á undan salnum." },
      { en: "Forward bounds: long, springy strides, 8 foot contacts a set, landing on the front of the foot.", is: "Skrefstökk: löng, fjaðrandi skref, 8 snertingar í setti, lent á framfæti." },
      { en: "Hurdle hops: 5 low hurdles in a row, off the ground again as fast as possible after each one.", is: "Grindahopp: 5 lágar grindur í röð, upp aftur eins hratt og hægt er eftir hverja." },
      { en: "Walk back between sets. Stop the set when ground contacts get long and heavy.", is: "Gengið til baka milli setta. Hættu settinu þegar snertingar verða langar og þungar." },
    ],
    findings: [
      { ref: "wangk2026", text: { en: "Youth soccer (20 trials for 5–10 m): hops plus short sprints or planned cuts ranked first for acceleration (effect 1.20); strength alone was uncertain in youth. Low certainty; few trials reported injuries or safety.", is: "Unglingar í fótbolta (20 rannsóknir á 5–10 m): hopp ásamt stuttum sprettum eða fyrirfram ákveðnum stefnubreytingum voru efst fyrir hröðun (áhrif 1,20); styrkur einn og sér var óviss hjá unglingum. Lítil vissa; fáar rannsóknir skráðu meiðsli eða öryggi." } },
      { ref: "hicks2020", text: { en: "Review template for \"force at high speed\": bounds 3–5 × 8, hurdle hops 3–5 × 5, week 4 lighter. Not tested as written.", is: "Sniðmát úr yfirliti fyrir „kraft á miklum hraða\": skrefstökk 3–5 × 8, grindahopp 3–5 × 5, vika 4 léttari. Ekki prófað eins og það er skrifað." } },
    ],
  },
  {
    key: "jump_squat",
    label: { en: "Light jump squats", is: "Hnébeygjuhopp með léttri þyngd" },
    summary: { en: "Fast jumps with a light bar: power for the first steps.", is: "Hröð hopp með léttri stöng: kraftur fyrir fyrstu skrefin." },
    basis: "trial",
    dose: { en: "3–4 × 5, fast, light load", is: "3–4 × 5, hratt, létt þyngd" },
    howTo: [
      { en: "In the gym, first, before the heavy lifts.", is: "Í salnum, fyrst, á undan þungu lyftunum." },
      { en: "Light bar or dumbbells: the jump must stay fast. If it slows, the weight is too heavy.", is: "Létt stöng eða handlóð: hoppið verður að vera hratt. Ef það hægist er þyngdin of mikil." },
      { en: "Short dip, then jump as high and fast as possible. Land soft, reset, next rep.", is: "Stutt beygja, svo hoppað eins hátt og hratt og hægt er. Lent mjúkt, stillt sig af, næsta endurtekning." },
      { en: "3–4 × 5. Stop the set when the jumps get lower.", is: "3–4 × 5. Hættu settinu þegar hoppin lækka." },
      { en: "With a bar-speed device: show the player the speed after every jump.", is: "Með stangarhraðamæli: sýndu leikmanninum hraðann eftir hvert hopp." },
    ],
    findings: [
      { ref: "loturco2016", text: { en: "U-20 footballers: jump squats went with faster sprints; push press did not.", is: "U-20 fótboltamenn: hnébeygjuhopp fóru saman við hraðari spretti; push press ekki." } },
      { ref: "randell2011", text: { en: "13 professional rugby players, 6 weeks: those shown their bar speed after every jump squat cut 30 m from 4.20 to 4.14 s; the others did not improve. Only 30 m and the long jump differed significantly between the groups.", is: "13 atvinnumenn í ruðningi, 6 vikur: þeir sem sáu stangarhraðann eftir hvert hnébeygjuhopp bættu 30 m úr 4,20 í 4,14 s; hinir bættu sig ekki. Aðeins 30 m og langstökk voru marktækt ólík milli hópanna." } },
    ],
  },
  PULLING_DERIVATIVES,
];

export type AccelStart = "youth" | "strength_first" | "starts_first" | "balanced";

export const ACCEL_START_LABEL: Record<AccelStart, Bi> = {
  youth: { en: "Youth level", is: "Unglingastig" },
  strength_first: { en: "Strength first", is: "Styrkur fyrst" },
  starts_first: { en: "Starts first", is: "Stört fyrst" },
  balanced: { en: "Balanced", is: "Jafnvægi" },
};

/** Starts the coach may choose: under 18 (or age unknown) always stays on the youth level. */
export function accelAllowed(input: GoalPlanInput): AccelStart[] {
  return isYouth(input.ageYears) ? ["youth"] : ["strength_first", "starts_first", "balanced"];
}

export function accelStart(input: GoalPlanInput): AccelStart {
  if (isYouth(input.ageYears)) return "youth"; // Wang K 2026: sprints + hops for youth, whatever the strength test
  const s = input.strength;
  if (s?.imtpBand === "below" || s?.imtpBand === "average") return "strength_first";
  if (s?.imtpBand === "good" || s?.imtpBand === "elite") return "starts_first";
  if (s?.dsiTier === "max_strength") return "strength_first";
  if (s?.dsiTier === "ballistic") return "starts_first";
  return "balanced";
}

const starts = (reps: string, metres: string): GoalBlock => ({
  method: "accel_sprints",
  supervised: true,
  what: { en: "Sprints from a standing start", is: "Sprettir frá kyrrstöðu" },
  dose: { en: `${reps} × ${metres} m flat out · 2–3 min rest`, is: `${reps} × ${metres} m á fullu · 2–3 mín hvíld` },
});

const sled = (reps: number, metres: number): GoalBlock => ({
  method: "resisted_sled",
  supervised: true,
  sledM: reps * metres,
  what: { en: "Sled sprints", is: "Sleðasprettir" },
  dose: { en: `${reps} × ${metres} m · load that slows the run by 15–30% · 2–3 min rest`, is: `${reps} × ${metres} m · þyngd sem hægir hlaupið um 15–30% · 2–3 mín hvíld` },
});

const bounds = (sets: number): GoalBlock => ({
  method: "bounds",
  contacts: sets * 8,
  what: { en: "Forward bounds", is: "Skrefstökk áfram" },
  dose: { en: `${sets} × 8 contacts`, is: `${sets} × 8 snertingar` },
});

/** Beginner level: fewer, lower bounds. */
const lowBounds = (sets: number): GoalBlock => ({
  method: "bounds",
  contacts: sets * 8,
  what: { en: "Low, short forward bounds", is: "Lág, stutt skrefstökk áfram" },
  dose: { en: `${sets} × 8 contacts · low and quick, land softly`, is: `${sets} × 8 snertingar · lágt og snöggt, mjúk lending` },
});

/** Advanced level: single-leg bounds. */
const singleLegBounds = (sets: number): GoalBlock => ({
  method: "bounds",
  contacts: sets * 12,
  what: { en: "Single-leg bounds", is: "Einfóta skrefstökk" },
  dose: { en: `${sets} × 6 each leg`, is: `${sets} × 6 hvor fótur` },
});

/** Reps as a whole number string, moved by `d` and never under 2. */
const bump = (reps: string, d: number): string => String(Math.max(2, Number(reps) + d));

const test10: GoalBlock = {
  method: "accel_sprints",
  test: true,
  supervised: true,
  what: { en: "10 m test", is: "10 m próf" },
  dose: { en: "2–3 × 10 m from a standing start · full rest · best counts · same start, shoes and surface each time", is: "2–3 × 10 m frá kyrrstöðu · full hvíld · besti gildir · sama start, skór og undirlag í hvert sinn" },
};

function gym(start: AccelStart, light: boolean, youth: boolean, level: TrainingLevel = "intermediate"): GoalSession {
  const adult = !youth && start !== "youth";
  const technique = youth || (adult && level === "beginner");
  const heavy: GoalBlock = {
    method: "heavy_strength",
    what: technique ? { en: "Leg strength, technique first", is: "Fótastyrkur, tækni fyrst" } : { en: "Heavy legs", is: "Þungar fætur" },
    dose: light
      ? { en: "Squat or trap-bar deadlift 2 × 3", is: "Hnébeygja eða trap bar 2 × 3" }
      : technique
        ? { en: "Squat or trap-bar deadlift 3 × 5, technique first, a weight that leaves 2–3 reps in reserve", is: "Hnébeygja eða trap bar 3 × 5, tækni fyrst, þyngd sem skilur 2–3 endurtekningar eftir" }
        : adult && level === "advanced"
          ? { en: "Squat or trap-bar deadlift 4 × 3–5 at about 80–90% of max · 3 min rest", is: "Hnébeygja eða trap bar 4 × 3–5 á um 80–90% af hámarki · 3 mín hvíld" }
          : { en: "Squat or trap-bar deadlift 3–4 × 3–5 at about 75–85% of max · 2–3 min rest", is: "Hnébeygja eða trap bar 3–4 × 3–5 á um 75–85% af hámarki · 2–3 mín hvíld" },
  };
  if (start === "youth") {
    return { slot: "B", focus: { en: "Gym: technique strength", is: "Salur: tæknistyrkur" }, when: WHEN.gym_day, minutes: 20, blocks: [heavy] };
  }
  const jsSets = light ? 2 : level === "beginner" ? 3 : 4;
  const jumpSq: GoalBlock = { method: "jump_squat", what: { en: "Light jump squats", is: "Hnébeygjuhopp með léttri þyngd" }, dose: { en: `${jsSets} × 5, fast`, is: `${jsSets} × 5, hratt` } };
  // Power before strength in the same session (coach's rule): jump squats always come before the heavy lifts.
  const blocks = start === "strength_first" ? [heavy] : [jumpSq, heavy];
  if (start === "starts_first" && !light && level === "intermediate") blocks[1] = { ...heavy, dose: { en: "Squat or trap-bar deadlift 2–3 × 3–5", is: "Hnébeygja eða trap bar 2–3 × 3–5" } };
  return {
    slot: "B",
    focus: start === "strength_first" ? { en: "Gym: strength", is: "Salur: styrkur" } : start === "starts_first" ? { en: "Gym: fast", is: "Salur: hratt" } : { en: "Gym: fast + strength", is: "Salur: hratt + styrkur" },
    when: WHEN.gym_day,
    minutes: 20,
    blocks,
  };
}

function pitch(start: AccelStart, phase: "base" | "build" | "light" | "test", youth: boolean, level: TrainingLevel = "intermediate"): GoalSession {
  const len = phase === "build" ? "15–20" : "10–15";
  let blocks: GoalBlock[];
  // Levels (adults only): beginner = one sprint fewer, all 10 m, no sled, low bounds; advanced = one sprint and one
  // sled run more, single-leg bounds. Intermediate is the plan as it was.
  const beg = level === "beginner";
  const adv = level === "advanced";
  const r = (reps: string) => (beg ? bump(reps, -1) : adv ? bump(reps, 1) : reps);
  const m = (metres: string) => (beg ? "10" : metres);
  const bnd = (sets: number) => (beg ? lowBounds(Math.max(2, sets - 1)) : adv ? singleLegBounds(sets) : bounds(sets));
  // Sled volume: base 4 × 15 = 60 m, build 5 × 20 = 100 m, lighter week 3 × 15 = 45 m (advanced: one run more).
  const sledBlock = () => {
    const [n, metres] = phase === "light" ? [3, 15] : phase === "build" ? [5, 20] : [4, 15];
    return sled(adv ? n + 1 : n, metres);
  };
  if (phase === "test") blocks = [test10, starts("2", "10")];
  else if (start === "youth" || youth) blocks = [starts(phase === "light" ? "3" : "5", len), bounds(2)];
  else if (start === "strength_first") blocks = beg ? [starts(phase === "light" ? "3" : "4", "10")] : [sledBlock(), starts(r(phase === "light" ? "2" : "3"), "10")];
  else if (start === "starts_first") blocks = [starts(r(phase === "light" ? "3" : phase === "build" ? "6" : "5"), m(len)), bnd(phase === "light" ? 2 : phase === "build" ? 4 : 3)];
  else blocks = beg ? [starts(phase === "light" ? "3" : "4", "10")] : [sledBlock(), starts(r(phase === "light" ? "2" : "3"), len)];
  const hasSled = blocks.some((b) => b.method === "resisted_sled");
  return { slot: "A", focus: phase === "test" ? { en: "Test + starts", is: "Mæling + stört" } : hasSled ? { en: "Sled + starts", is: "Sleði + stört" } : { en: "Starts", is: "Stört" }, when: WHEN.warmup_any, minutes: hasSled ? 20 : 15, blocks };
}

/** The plan's building blocks, shared with the Programme Library team plans (`qualityPlans.ts`) so the doses match. */
export const ACCEL_BLOCKS = { starts, sled, bounds, lowBounds, singleLegBounds, bump, test10, gym };

const offSeason = (level: TrainingLevel): GoalSession => ({ slot: "C", focus: { en: "Starts (short)", is: "Stört (stutt)" }, when: WHEN.off_day, minutes: 10, blocks: [starts(level === "beginner" ? "3" : level === "advanced" ? "5" : "4", "10")] });

/** The goal plan's 8 weeks. `level`: the Programme Library's or the coach's choice for a goal plan (lota 5); intermediate is the default. */
export function accelWeeks(start: AccelStart, youth: boolean, level: TrainingLevel = "intermediate") {
  const lv: TrainingLevel = youth || start === "youth" ? "intermediate" : level;
  return expandWeeks([
    { weeks: [1], label: (w) => weekLabel(w, "test + starts", "mæling + stört"), sessions: [pitch(start, "test", youth, lv), gym(start, false, youth, lv), offSeason(lv)] },
    { weeks: [2, 3], label: (w) => weekLabel(w, "", ""), sessions: [pitch(start, "base", youth, lv), gym(start, false, youth, lv), offSeason(lv)] },
    { weeks: [4], label: (w) => weekLabel(w, "lighter", "léttari"), sessions: [pitch(start, "light", youth, lv), gym(start, true, youth, lv)] },
    { weeks: [5, 6, 7], label: (w) => weekLabel(w, "", ""), sessions: [pitch(start, "build", youth, lv), gym(start, false, youth, lv), offSeason(lv)] },
    { weeks: [8], label: (w) => weekLabel(w, "test", "mæling"), sessions: [pitch(start, "test", youth, lv), gym(start, true, youth, lv)] },
  ]);
}

export function buildAccelerationParts(input: GoalPlanInput): GoalParts {
  const youth = isYouth(input.ageYears);
  const start = pickStart(input, accelStart(input), accelAllowed(input));
  const s = input.strength;
  const t = input.sprintTimes;
  const used: Bi[] = [];
  const missing: Bi[] = [];
  if (s?.imtpBand || s?.dsiTier) used.push({ en: "Force-plate strength test", is: "Styrkmæling á kraftplötu" });
  else missing.push({ en: "Strength test on the force plates", is: "Styrkmæling á kraftplötu" });
  if (t?.s10 != null) used.push({ en: `10 m sprint time ${t.s10.toFixed(2)} s (${t.date})`, is: `10 m sprett-tími ${t.s10.toFixed(2)} s (${t.date})` });
  else missing.push({ en: "Timed 10 m (taken in week 1)", is: "Tímamældur 10 m (tekinn í viku 1)" });

  const startWhy: Bi =
    start === "youth"
      ? input.ageYears == null
        ? { en: "Age not on record, so the plan uses the youth level: short sprints and low hops, with technique strength in the gym.", is: "Aldur ekki skráður, svo áætlunin notar unglingastigið: stuttir sprettir og lág hopp, með tæknistyrk í sal." }
        : { en: "Under 18, so the plan uses short sprints and low hops with technique strength; in youth football this mix ranked first for the first 10 m (Wang K 2026).", is: "Undir 18 ára, svo áætlunin notar stutta spretti og lág hopp með tæknistyrk; hjá unglingum í fótbolta var sú blanda efst fyrir fyrstu 10 m (Wang K 2026)." }
      : start === "strength_first"
        ? s?.imtpBand
          ? { en: `The force-plate strength test is ${BAND_LABEL[s.imtpBand].en} for the player's group, so strength comes first: heavy lifts and sled sprints.`, is: `Styrkpróf á kraftplötu er ${BAND_LABEL[s.imtpBand].is} miðað við hóp leikmannsins, svo styrkur kemur fyrst: þungar lyftur og sleðasprettir.` }
          : { en: "Force-plate tests show the player already uses most of the strength there is, so raising strength comes first.", is: "Kraftplötumælingar sýna að leikmaðurinn nýtir nú þegar mest af styrknum sem er til, svo aukinn styrkur kemur fyrst." }
        : start === "starts_first"
          ? s?.imtpBand
            ? { en: `The force-plate strength test is ${BAND_LABEL[s.imtpBand].en}, so the plan spends its time on fast starts and bounds.`, is: `Styrkpróf á kraftplötu er ${BAND_LABEL[s.imtpBand].is}, svo áætlunin eyðir tímanum í hröð stört og skrefstökk.` }
            : { en: "Force-plate tests show more strength than the player turns into speed, so the plan spends its time on fast starts and bounds.", is: "Kraftplötumælingar sýna meiri styrk en leikmaðurinn nær að breyta í hraða, svo áætlunin eyðir tímanum í hröð stört og skrefstökk." }
          : { en: "No strength test on record, so the plan mixes sled sprints and strength with fast starts.", is: "Engin styrkmæling skráð, svo áætlunin blandar sleðasprettum og styrk við hröð stört." };

  const counterfactual: Bi =
    start === "youth"
      ? { en: "If the player were 18 or over (with the date of birth on record), the start would follow the strength test.", is: "Ef leikmaðurinn væri 18 ára eða eldri (með fæðingardag skráðan) réði styrkprófið upphafinu." }
      : start === "strength_first"
        ? { en: "If the strength test had been above average, the plan would start with fast starts and bounds instead.", is: "Ef styrkprófið hefði verið yfir meðallagi byrjaði áætlunin á hröðum störtum og skrefstökkum í staðinn." }
        : start === "starts_first"
          ? { en: "If the strength test had been average or below, the plan would start with strength and sled sprints.", is: "Ef styrkprófið hefði verið í meðallagi eða undir byrjaði áætlunin á styrk og sleðasprettum." }
          : { en: "With a force-plate strength test on record, the plan would lean either to strength or to fast starts.", is: "Með styrkmælingu á kraftplötu skráða myndi áætlunin halla annaðhvort að styrk eða hröðum störtum." };

  return {
    verdict:
      start === "youth"
        ? { en: "Short sprints and low hops twice a week for 8 weeks, with technique strength in the gym.", is: "Stuttir sprettir og lág hopp tvisvar í viku í 8 vikur, með tæknistyrk í sal." }
        : start === "strength_first"
          ? { en: "Build leg strength first, with sled and short sprints each week: twice a week for 8 weeks.", is: "Byggðu fyrst upp fótastyrk, með sleða og stuttum sprettum í hverri viku: tvisvar í viku í 8 vikur." }
          : start === "starts_first"
            ? { en: "Fast starts and bounds twice a week for 8 weeks; strength is already there.", is: "Hröð stört og skrefstökk tvisvar í viku í 8 vikur; styrkurinn er þegar til staðar." }
            : { en: "Short sprints plus strength twice a week for 8 weeks.", is: "Stuttir sprettir og styrkur tvisvar í viku í 8 vikur." },
    facts: [
      startWhy,
      { en: "Short sprints improve the first 10 m in trials. A sled helps about as much as the same sprints without one, and does not raise top speed (Alcaraz 2018; Petrakos 2016).", is: "Stuttir sprettir bæta fyrstu 10 m í rannsóknum. Sleði hjálpar álíka mikið og sömu sprettir án hans og hækkar ekki hámarkshraða (Alcaraz 2018; Petrakos 2016)." },
      { en: "Getting stronger went with faster short sprints in training studies (Seitz 2014). Choosing the start from a strength test is MicroPulse's rule, not tested.", is: "Aukinn styrkur fór saman við hraðari stutta spretti í þjálfunarrannsóknum (Seitz 2014). Að velja upphafið út frá styrkprófi er regla MicroPulse, ekki prófuð." },
    ],
    branch: { key: start, label: ACCEL_START_LABEL[start], why: startWhy },
    start,
    counterfactual,
    evidence: "partly",
    confidence: { level: used.length === 2 ? "high" : used.length === 1 ? "moderate" : "low", used, missing },
    weeks: accelWeeks(start, youth, input.level ?? "intermediate"),
    tests: {
      weeks: [1, 8],
      what: { en: "Timed 10 m from a standing start in week 1 and week 8. Hand timing is not precise enough: use timing gates or a video app.", is: "Tímamældur 10 m frá kyrrstöðu í viku 1 og viku 8. Handtímataka er ekki nógu nákvæm: notaðu tímahlið eða myndbandsforrit." },
      change: { en: "None of the papers gives the smallest real change for 10 m. MicroPulse reads less than 2% faster as no clear change (a MicroPulse rule).", is: "Engin greinanna gefur minnstu raunbreytingu fyrir 10 m. MicroPulse les minna en 2% bætingu sem enga skýra breytingu (regla MicroPulse)." },
    },
    safety: [
      { en: "Full-effort starts and sled sprints are done after the team warm-up with a coach there.", is: "Stört á fullu og sleðasprettir eru gerð eftir upphitun með liðinu og þjálfari á staðnum." },
      { en: "A heavier sled (slowing the run by about half) is only a coach's choice for experienced players; over 20% of body weight is not for inexperienced players (Alcaraz 2018).", is: "Þyngri sleði (sem hægir hlaupið um u.þ.b. helming) er aðeins val þjálfara fyrir vana leikmenn; yfir 20% af líkamsþyngd er ekki fyrir óvana (Alcaraz 2018)." },
      { en: "Under 18: no sled and no lifts over 75% of max in this plan (MicroPulse's rule); growth can make changes look bigger or smaller (Liao 2021).", is: "Undir 18 ára: enginn sleði og engar lyftur yfir 75% af hámarki í þessari áætlun (regla MicroPulse); vöxtur getur látið breytingar líta út stærri eða minni (Liao 2021)." },
    ],
    limits: [
      { en: "Sled sprints are not shown to beat the same sprints without a sled (Alcaraz 2018; Petrakos 2016).", is: "Sleðasprettir eru ekki sýndir betri en sömu sprettir án sleða (Alcaraz 2018; Petrakos 2016)." },
      input.inSeason
        ? { en: "The sled volume here (60–100 m) is at the bottom of what worked (60–340 m, Petrakos 2016) and under the >160 m that did best in Alcaraz 2018, because this is a short add-on in season.", is: "Sleðamagnið hér (60–100 m) er neðst í því sem virkaði (60–340 m, Petrakos 2016) og undir >160 m sem gaf best í Alcaraz 2018, því þetta er stutt viðbót á keppnistímabili." }
        : { en: "The sled volume here (60–100 m) is at the bottom of what worked (60–340 m, Petrakos 2016) and under the >160 m that did best in Alcaraz 2018, because this is a short add-on to the team's training.", is: "Sleðamagnið hér (60–100 m) er neðst í því sem virkaði (60–340 m, Petrakos 2016) og undir >160 m sem gaf best í Alcaraz 2018, því þetta er stutt viðbót við æfingar liðsins." },
      // Only in season: out of season the gains in the trials were the larger ones (Petrakos 2016).
      ...(input.inSeason ? [{ en: "Expect smaller gains in season than in pre-season (Petrakos 2016).", is: "Búast má við minni bætingu á keppnistímabili en á undirbúningstímabili (Petrakos 2016)." }] : []),
      { en: "The strength-to-sprint link is from group results, and a 2022 re-analysis found Seitz 2014's effect sizes inflated.", is: "Tengsl styrks og spretta byggja á hópniðurstöðum, og endurgreining 2022 fann áhrifastærðir Seitz 2014 ofmetnar." },
      { en: "No study tested choosing the start from a strength test, and none sets an age limit for sleds: both are MicroPulse's rules.", is: "Engin rannsókn prófaði að velja upphafið út frá styrkprófi og engin setur aldursmörk fyrir sleða: hvort tveggja eru reglur MicroPulse." },
    ],
    refs: Object.values(ACCEL_REFS),
  };
}
