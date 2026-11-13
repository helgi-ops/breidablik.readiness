/**
 * Top-speed (maximum sprint velocity) methods — what training has been shown to raise top speed, and three
 * ready plans built from those doses.
 *
 * Pure and client-safe (no React, no DB). Reference content for coaches: the Programme Library tab "Top
 * speed" (`SpeedMethodLibrary`) and the plan PDF (`SpeedPlanPdf`). Nothing here is sent to a player, and
 * nothing reads or writes the readiness colour, a load target or a daily decision.
 *
 * Every finding names its source and whether MicroPulse read the full paper or only its abstract
 * (`verifiedFrom`). No study tested the three plans as written: the doses come from the cited studies, and
 * putting them into a week is MicroPulse's work (`SPEED_PLAN_BASIS`, shown on the page and in the PDF).
 *
 * The coach's request (Nov 2026): "find which exercises have been shown to improve maximum velocity — find
 * more studies", starting from Delecluse 1997 and Kotzamanidis 2005.
 */

import type { Bi } from "@/lib/micropulse/load/peakPeriod";
import { LONG_GAP_DAYS } from "@/lib/micropulse/nearMaxExposure";

export type { Bi };

// ─── References ───────────────────────────────────────────────────────────

/** "full_text" = MicroPulse read the paper; "abstract" = only the abstract or a published summary. */
export type VerifiedFrom = "full_text" | "abstract";

export type SpeedRefKey =
  | "delecluse1997"
  | "kotzamanidis2005"
  | "nicholson2022"
  | "rumpf2016"
  | "haugen2019"
  | "mendiguchia2020"
  | "saez2012"
  | "moran2021"
  | "loturco2016"
  | "paradisis2006"
  | "alcaraz2018"
  | "myrvang2024"
  | "ishoi2018"
  | "lin2026"
  | "haugen2015"
  | "ronnestad2011"
  | "seitz2014"
  | "weyand2000"
  | "malone2017"
  | "buchheit2023";

export type SpeedRef = { key: SpeedRefKey; short: string; cite: string; verifiedFrom: VerifiedFrom };

export const SPEED_REFS: Record<SpeedRefKey, SpeedRef> = {
  delecluse1997: { key: "delecluse1997", short: "Delecluse 1997", cite: "Delecluse C. Influence of strength training on sprint running performance. Sports Med 1997;24(3):147–156.", verifiedFrom: "full_text" },
  kotzamanidis2005: { key: "kotzamanidis2005", short: "Kotzamanidis 2005", cite: "Kotzamanidis C, Chatzopoulos D, Michailidis C, Papaiakovou G, Patikas D. The effect of a combined high-intensity strength and speed training program on the running and jumping ability of soccer players. J Strength Cond Res 2005;19(2):369–375.", verifiedFrom: "full_text" },
  nicholson2022: { key: "nicholson2022", short: "Nicholson 2022", cite: "Nicholson B et al. The training of medium- to long-distance sprint performance in football code athletes: a systematic review and meta-analysis. Sports Med 2022;52(2). doi:10.1007/s40279-021-01552-4", verifiedFrom: "full_text" },
  rumpf2016: { key: "rumpf2016", short: "Rumpf 2016", cite: "Rumpf MC, Lockie RG, Cronin JB, Jalilvand F. Effect of different sprint training methods on sprint performance over various distances: a brief review. J Strength Cond Res 2016;30(6):1767–1785.", verifiedFrom: "abstract" },
  haugen2019: { key: "haugen2019", short: "Haugen 2019", cite: "Haugen T, Seiler S, Sandbakk Ø, Tønnessen E. The training and development of elite sprint performance: an integration of scientific and best practice literature. Sports Med Open 2019. doi:10.1186/s40798-019-0221-0", verifiedFrom: "full_text" },
  mendiguchia2020: { key: "mendiguchia2020", short: "Mendiguchia 2020", cite: "Mendiguchia J et al. Sprint versus isolated eccentric training: comparative effects on hamstring architecture and performance in soccer players. PLoS One 2020;15(2):e0228283.", verifiedFrom: "full_text" },
  saez2012: { key: "saez2012", short: "Sáez de Villarreal 2012", cite: "Sáez de Villarreal E, Requena B, Cronin JB. The effects of plyometric training on sprint performance: a meta-analysis. J Strength Cond Res 2012;26(2).", verifiedFrom: "abstract" },
  moran2021: { key: "moran2021", short: "Moran 2021", cite: "Moran J et al. Effects of vertically and horizontally orientated plyometric training on physical performance: a meta-analytical comparison. Sports Med 2021.", verifiedFrom: "abstract" },
  loturco2016: { key: "loturco2016", short: "Loturco 2016", cite: "Loturco I et al. Jump squat is more related to sprinting and jumping abilities than Olympic push press; training study in elite U-20 soccer players. PLoS One 2016.", verifiedFrom: "abstract" },
  paradisis2006: { key: "paradisis2006", short: "Paradisis 2006", cite: "Paradisis GP, Cooke CB. The effects of sprint running training on sloping surfaces. J Strength Cond Res 2006;20(4):767–777.", verifiedFrom: "abstract" },
  alcaraz2018: { key: "alcaraz2018", short: "Alcaraz 2018", cite: "Alcaraz PE et al. The effectiveness of resisted sled training (RST) for sprint performance: a systematic review and meta-analysis. Sports Med 2018. doi:10.1007/s40279-018-0947-8", verifiedFrom: "abstract" },
  myrvang2024: { key: "myrvang2024", short: "Myrvang 2024", cite: "Myrvang S, van den Tillaar R. The longitudinal effects of resisted and assisted sprint training on sprint kinematics, acceleration, and maximum velocity: a systematic review and meta-analysis. Sports Med Open 2024;10:110.", verifiedFrom: "full_text" },
  ishoi2018: { key: "ishoi2018", short: "Ishøi 2018", cite: "Ishøi L et al. Effects of the Nordic Hamstring exercise on sprint capacity in male football players: a randomized controlled trial. J Sports Sci 2018. doi:10.1080/02640414.2017.1409609", verifiedFrom: "abstract" },
  lin2026: { key: "lin2026", short: "Lin 2026", cite: "Lin et al. Acute and long-term effects of hip thrust training on athletic performance: a systematic review and meta-analysis. PeerJ 2026.", verifiedFrom: "abstract" },
  haugen2015: { key: "haugen2015", short: "Haugen 2015", cite: "Haugen T et al. Sprint conditioning of junior soccer players: effects of training intensity and technique supervision. PLoS One 2015;10(3):e0121827.", verifiedFrom: "abstract" },
  ronnestad2011: { key: "ronnestad2011", short: "Rønnestad 2011", cite: "Rønnestad BR, Nymark BS, Raastad T. Effects of in-season strength maintenance training frequency in professional soccer players. J Strength Cond Res 2011.", verifiedFrom: "abstract" },
  seitz2014: { key: "seitz2014", short: "Seitz 2014", cite: "Seitz LB et al. Increases in lower-body strength transfer positively to sprint performance: a systematic review with meta-analysis. Sports Med 2014. doi:10.1007/s40279-014-0227-1 (re-analysed in Sports Med 2022: effect sizes over-estimated).", verifiedFrom: "abstract" },
  weyand2000: { key: "weyand2000", short: "Weyand 2000", cite: "Weyand PG et al. Faster top running speeds are achieved with greater ground forces not more rapid leg movements. J Appl Physiol 2000;89.", verifiedFrom: "abstract" },
  malone2017: { key: "malone2017", short: "Malone 2017", cite: "Malone S et al. High chronic training loads and exposure to bouts of maximal velocity running reduce injury risk in elite Gaelic football. J Sci Med Sport 2017;20:250–254.", verifiedFrom: "abstract" },
  buchheit2023: { key: "buchheit2023", short: "Buchheit 2023", cite: "Buchheit M, Settembre M, Hader K, McHugh D. Exposures to near-to-maximal speed running bouts during different turnarounds in elite football: association with match hamstring injuries. Biol Sport 2023.", verifiedFrom: "abstract" },
};

// ─── Methods ──────────────────────────────────────────────────────────────

/** How well a method is supported FOR TOP SPEED (not for sprinting in general). */
export type SpeedEvidence = "best" | "some" | "accel" | "none";

export const SPEED_EVIDENCE_LABEL: Record<SpeedEvidence, Bi> = {
  best: { en: "Best evidence", is: "Sterkust gögn" },
  some: { en: "Some evidence", is: "Nokkur gögn" },
  accel: { en: "Helps the start, not top speed", is: "Hjálpar startinu, ekki hámarkshraða" },
  none: { en: "No top-speed gain shown", is: "Engin bæting á hámarkshraða sýnd" },
};

/** Display order: strongest first. */
export const SPEED_EVIDENCE_ORDER: SpeedEvidence[] = ["best", "some", "accel", "none"];

export type SpeedMethodKey =
  | "flying_sprints"
  | "strength_plus_sprint"
  | "heavy_strength"
  | "plyometrics"
  | "jump_squat"
  | "uphill_downhill"
  | "accel_sprints"
  | "resisted_sled"
  | "hip_thrust"
  | "nordic"
  | "assisted"
  | "submax_sprints"
  | "team_only";

export type SpeedFinding = { text: Bi; ref: SpeedRefKey };

export type SpeedMethod = {
  key: SpeedMethodKey;
  label: Bi;
  /** One plain sentence: what it is and what it does for top speed. */
  summary: Bi;
  evidence: SpeedEvidence;
  /** The dose in one line. */
  dose: Bi;
  /** Behind "Show details": the numbers, each with its source. */
  findings: SpeedFinding[];
  howTo: Bi[];
  caution?: Bi;
};

export const SPEED_METHODS: SpeedMethod[] = [
  {
    key: "flying_sprints",
    label: { en: "Flying sprints", is: "Fljúgandi sprettir" },
    summary: {
      en: "Build up over 20–40 m, then run 10–30 m flat out. The most direct way to train top speed.",
      is: "Byggðu upp hraða á 20–40 m og hlauptu svo 10–30 m á fullum hraða. Beinasta leiðin til að þjálfa hámarkshraða.",
    },
    evidence: "best",
    dose: {
      en: "3–5 runs of 10–30 m at full speed · 4+ min rest · 50–150 m in all · 48–72 h to the next one",
      is: "3–5 sprettir 10–30 m á fullum hraða · 4+ mín hvíld · 50–150 m alls · 48–72 klst í næsta",
    },
    findings: [
      {
        ref: "haugen2019",
        text: {
          en: "Best-practice guide for sprinters: 10–30 m at over 98% of top speed, 20–40 m build-up, 4–15 min rest (longer the faster), 50–150 m a session, 48–72 h between sessions.",
          is: "Viðmið bestu þjálfara: 10–30 m á yfir 98% af hámarkshraða, 20–40 m aðhlaup, 4–15 mín hvíld (lengri því hraðar), 50–150 m á æfingu, 48–72 klst milli æfinga.",
        },
      },
      {
        ref: "nicholson2022",
        text: {
          en: "Football players given sprint training improved their top-speed phase far more than players who only did team training (between-group effect 1.13, large). The change inside the sprint groups on their own was small and not significant.",
          is: "Fótboltamenn sem fengu sprettþjálfun bættu hámarkshraðafasann mun meira en þeir sem æfðu bara með liðinu (munur milli hópa 1,13, mikill). Breytingin innan sprettahópanna einna var lítil og ekki marktæk.",
        },
      },
      {
        ref: "mendiguchia2020",
        text: {
          en: "Two sprint sessions a week for 6 weeks in footballers (including 4 × 20 m flying): top speed +1.5% (small), horizontal push +7.4%, hamstring fibres +16% longer.",
          is: "Tvær sprettæfingar á viku í 6 vikur hjá fótboltamönnum (þ.m.t. 4 × 20 m fljúgandi): hámarkshraði +1,5% (lítið), lárétt kraftgeta +7,4%, vöðvaþræðir aftanlæris 16% lengri.",
        },
      },
      {
        ref: "rumpf2016",
        text: {
          en: "Across 48 studies, sprint-specific training had its largest effects over 31 m and longer.",
          is: "Í 48 rannsóknum hafði sértæk sprettþjálfun mest áhrif á 31 m og lengra.",
        },
      },
    ],
    howTo: [
      { en: "Do them early in the session, after a full warm-up, while players are fresh.", is: "Hafðu þá snemma á æfingu, eftir góða upphitun, meðan leikmenn eru ferskir." },
      { en: "Mark the build-up and the fast zone with cones; time the zone or read top speed from GPS.", is: "Merktu aðhlaup og hraðasvæði með keilum; taktu tímann á svæðinu eða lestu hámarkshraða úr GPS." },
      { en: "Start short (10 m fast zone, 20 m build-up) and lengthen over the weeks.", is: "Byrjaðu stutt (10 m hraðasvæði, 20 m aðhlaup) og lengdu yfir vikurnar." },
      { en: "Stop when speed drops or the running looks tight.", is: "Hættu þegar hraðinn dettur eða hlaupið stífnar." },
    ],
  },
  {
    key: "strength_plus_sprint",
    label: { en: "Heavy strength + sprints in one session", is: "Þungur styrkur + sprettir á sömu æfingu" },
    summary: {
      en: "Lift heavy, rest 10 minutes, then sprint flat out. Beat lifting alone for 30 m speed.",
      is: "Lyftu þungt, hvíldu í 10 mínútur og sprettu svo á fullu. Betra en lyftingar einar fyrir 30 m hraða.",
    },
    evidence: "best",
    dose: {
      en: "4 heavy sets (8, then 6, then 3 reps over the weeks) · 10 min rest · 4–6 × 30 m flat out, 3 min rest · 2× a week",
      is: "4 þung sett (8, svo 6, svo 3 endurtekningar yfir vikurnar) · 10 mín hvíld · 4–6 × 30 m á fullu, 3 mín hvíld · 2× í viku",
    },
    findings: [
      {
        ref: "kotzamanidis2005",
        text: {
          en: "17-year-old footballers, 9 weeks, 2 sessions a week: 30 m time 4.34 → 4.19 s (−3.5%) with lifting + sprints; lifting alone 4.33 → 4.31 s (no real change). Both groups got equally stronger (half squat +9–10%).",
          is: "17 ára fótboltamenn, 9 vikur, 2 æfingar á viku: 30 m tími 4,34 → 4,19 s (−3,5%) með lyftingum + sprettum; lyftingar einar 4,33 → 4,31 s (engin raunveruleg breyting). Báðir hópar urðu jafn sterkir (hálf hnébeygja +9–10%).",
        },
      },
      {
        ref: "delecluse1997",
        text: {
          en: "Review: strength carries over to sprinting best when sprinting is trained alongside it; strength work alone often did not change sprint times.",
          is: "Yfirlit: styrkur skilar sér best í sprett þegar sprettir eru æfðir samhliða; styrkur einn breytti oft ekki sprettímum.",
        },
      },
      {
        ref: "nicholson2022",
        text: {
          en: "Programmes that combined sprinting with strength or power work improved sprints of 30 m and longer.",
          is: "Prógrömm sem sameinuðu spretti og styrk eða kraft bættu spretti á 30 m og lengra.",
        },
      },
    ],
    howTo: [
      { en: "Lift first (the study used half squat, step-up and hamstring curl), then 10 minutes of easy ball work, then the sprints.", is: "Lyftu fyrst (rannsóknin notaði hálfa hnébeygju, uppstig og aftanlærisbeygju), svo 10 mínútur af léttri boltavinnu og þá sprettirnir." },
      { en: "Every sprint should be as fast as the first; stop when times slip.", is: "Hver sprettur á að vera jafn hraður og sá fyrsti; hættu þegar tíminn lengist." },
      { en: "The study first did 4 weeks of general strength work before going heavy.", is: "Í rannsókninni voru fyrst 4 vikur af almennum styrk áður en farið var í þungar lyftur." },
    ],
    caution: {
      en: "The 30 m test started from standing, so it measures the start and top speed together.",
      is: "30 m prófið var frá kyrrstöðu og mælir því start og hámarkshraða saman.",
    },
  },
  {
    key: "heavy_strength",
    label: { en: "Strength and power training", is: "Styrkur og kraftur" },
    summary: {
      en: "Squats, deadlift variations and jumps. The only training type with a significant top-speed gain in a review of 60 football studies.",
      is: "Hnébeygjur, réttstöðulyftur og stökk. Eina þjálfunartegundin með marktæka bætingu á hámarkshraða í yfirliti 60 fótboltarannsókna.",
    },
    evidence: "best",
    dose: {
      en: "2× a week in pre-season, 1× a week in season · 3–5 heavy sets on the legs",
      is: "2× í viku á undirbúningstímabili, 1× í viku á tímabili · 3–5 þung sett á fætur",
    },
    findings: [
      {
        ref: "nicholson2022",
        text: {
          en: "60 studies, 1,500 football players: strength, power and jump training was the only type that improved the top-speed phase on its own (effect 0.45, moderate).",
          is: "60 rannsóknir, 1.500 fótboltamenn: styrkur, kraftur og stökk var eina tegundin sem bætti hámarkshraðafasann ein og sér (áhrif 0,45, miðlungs).",
        },
      },
      {
        ref: "ronnestad2011",
        text: {
          en: "In season, one strength session a week kept the 40 m sprint gains from pre-season; one every second week did not.",
          is: "Á tímabili hélt ein styrktaræfing á viku 40 m bætingu undirbúningstímabilsins; ein önnur hver vika gerði það ekki.",
        },
      },
      {
        ref: "weyand2000",
        text: {
          en: "Faster runners reach higher top speeds by pushing harder into the ground, not by moving their legs faster.",
          is: "Hraðari hlauparar ná hærri hámarkshraða með því að ýta fastar í jörðina, ekki með hraðari fótahreyfingum.",
        },
      },
      {
        ref: "seitz2014",
        text: {
          en: "Gains in squat strength went with faster sprints (15 studies). A 2022 re-analysis found the original numbers inflated, so treat the size of the link with care.",
          is: "Aukinn styrkur í hnébeygju fylgdi hraðari sprettum (15 rannsóknir). Endurgreining 2022 fann að tölurnar voru ofmetnar, svo taktu stærð tengslanna með fyrirvara.",
        },
      },
    ],
    howTo: [
      { en: "Sprint first and lift after, or lift on a day with no speed work the next day.", is: "Sprettu fyrst og lyftu svo, eða lyftu á degi þar sem enginn hraði er daginn eftir." },
      { en: "Over the weeks: heavier with fewer reps, then shift towards fast, light lifts and jumps.", is: "Yfir vikurnar: þyngra með færri endurtekningum, svo meira yfir í hraðar, léttar lyftur og stökk." },
    ],
    caution: {
      en: "Heavy lifting can blunt sprint speed for a day or two (Haugen 2019).",
      is: "Þungar lyftur geta dregið úr sprettahraða í einn til tvo daga (Haugen 2019).",
    },
  },
  {
    key: "plyometrics",
    label: { en: "Jumps and bounds", is: "Hopp og skrefstökk" },
    summary: {
      en: "Short, springy jumps and forward bounds. They improve sprints; forward bounds help the first 10 m most.",
      is: "Stutt, fjaðrandi hopp og skrefstökk áfram. Þau bæta spretti; skrefstökk áfram hjálpa mest fyrstu 10 m.",
    },
    evidence: "some",
    dose: {
      en: "60–100 foot contacts a session · 2× a week · blocks under 10 weeks · mix upward and forward jumps",
      is: "60–100 snertingar á æfingu · 2× í viku · lotur undir 10 vikum · blandaðu hoppum upp og áfram",
    },
    findings: [
      {
        ref: "saez2012",
        text: {
          en: "26 studies: the biggest sprint gains came from programmes under 10 weeks with 15+ sessions and 80+ jumps a session, mixing jump types and including forward jumps. Adding weight to jumps added nothing.",
          is: "26 rannsóknir: mesta bætingin í sprettum kom úr prógrömmum undir 10 vikum með 15+ æfingum og 80+ hoppum á æfingu, blönduðum hopptegundum og hoppum áfram. Þyngd í hoppum bætti engu við.",
        },
      },
      {
        ref: "moran2021",
        text: {
          en: "Forward jump training improved forward outcomes more than upward jump training did (effect 0.65).",
          is: "Hopp áfram bættu láréttar mælingar meira en hopp upp (áhrif 0,65).",
        },
      },
      {
        ref: "haugen2019",
        text: {
          en: "Sprint coaches use bounding, hurdle jumps and skipping with very short ground contacts; demanding on the Achilles.",
          is: "Sprettþjálfarar nota skrefstökk, grindahopp og skipp með mjög stuttri snertingu; reynir á hásinina.",
        },
      },
    ],
    howTo: [
      { en: "Quality over volume: short ground contact, and stop when jumps get slow or heavy.", is: "Gæði fram yfir magn: stutt snerting, og hættu þegar hoppin hægjast eða þyngjast." },
      { en: "Count foot contacts and build them up over the weeks.", is: "Teldu snertingar og byggðu þær upp yfir vikurnar." },
    ],
    caution: {
      en: "High jump volumes load the Achilles and calves; build up gradually.",
      is: "Mikið magn af hoppum reynir á hásin og kálfa; byggðu upp smám saman.",
    },
  },
  {
    key: "jump_squat",
    label: { en: "Light jump squats", is: "Hnébeygjuhopp með léttri þyngd" },
    summary: {
      en: "Squat jumps with a light bar, moved as fast as possible. Carried over to 5–30 m sprints in young footballers.",
      is: "Hnébeygjuhopp með léttri stöng, eins hratt og hægt er. Skiluðu sér í 5–30 m spretti hjá ungum fótboltamönnum.",
    },
    evidence: "some",
    dose: {
      en: "3–4 sets of 5 · light enough to stay fast · full rest · 1–2× a week",
      is: "3–4 sett af 5 · nógu létt til að vera hratt · full hvíld · 1–2× í viku",
    },
    findings: [
      {
        ref: "loturco2016",
        text: {
          en: "Under-20 players, 6 weeks: jump squats at the load that gave the most power improved 5–30 m sprints and jumps more than push presses did.",
          is: "Leikmenn undir 20 ára, 6 vikur: hnébeygjuhopp með þeirri þyngd sem gaf mestan kraft bættu 5–30 m spretti og stökk meira en push press.",
        },
      },
      {
        ref: "haugen2019",
        text: {
          en: "Sprint coaches use fast lifts up to about 60% of max to build power.",
          is: "Sprettþjálfarar nota hraðar lyftur upp að um 60% af hámarki til að byggja kraft.",
        },
      },
    ],
    howTo: [
      { en: "Pick a load the player can still jump fast with; if a bar-speed device is used, keep the bar fast.", is: "Veldu þyngd sem leikmaðurinn getur enn stokkið hratt með; ef stangarhraðamælir er notaður, haltu stönginni hraðri." },
    ],
    caution: {
      en: "Measured over 5–30 m from a standing start, not top speed alone.",
      is: "Mælt á 5–30 m frá kyrrstöðu, ekki hámarkshraði einn og sér.",
    },
  },
  {
    key: "uphill_downhill",
    label: { en: "Uphill + downhill sprints", is: "Sprettir upp og niður brekku" },
    summary: {
      en: "Sprints on a gentle 3° slope, up and down. One study found a 3.5% top-speed gain, but the setup is hard to copy.",
      is: "Sprettir í 3° halla, upp og niður. Ein rannsókn fann 3,5% bætingu á hámarkshraða, en erfitt er að setja þetta upp.",
    },
    evidence: "some",
    dose: {
      en: "Needs an even 3° slope · same rest and volume as flying sprints",
      is: "Þarf jafnan 3° halla · sama hvíld og magn og fljúgandi sprettir",
    },
    findings: [
      {
        ref: "paradisis2006",
        text: {
          en: "6 weeks: combined up-and-downhill training raised top speed by 0.29 m/s (3.5%) and step rate by 3.4%, more than flat or one-way slope training.",
          is: "6 vikur: þjálfun upp og niður brekku jók hámarkshraða um 0,29 m/s (3,5%) og skreftíðni um 3,4%, meira en á sléttu eða aðeins í aðra áttina.",
        },
      },
      {
        ref: "myrvang2024",
        text: {
          en: "In a 2024 review, slope training gave the largest top-speed gain within groups (effect 0.54), but not a significant one against normal sprinting.",
          is: "Í yfirliti 2024 gaf brekkuþjálfun mesta bætingu á hámarkshraða innan hópa (áhrif 0,54), en ekki marktæka á móti venjulegum sprettum.",
        },
      },
    ],
    howTo: [
      { en: "Only on a measured, even slope; a steeper hill changes the running.", is: "Aðeins í mældum, jöfnum halla; brattari brekka breytir hlaupinu." },
    ],
    caution: {
      en: "Few studies, none in footballers.",
      is: "Fáar rannsóknir, engin hjá fótboltamönnum.",
    },
  },
  {
    key: "accel_sprints",
    label: { en: "Short sprints from a standing start", is: "Stuttir sprettir frá kyrrstöðu" },
    summary: {
      en: "5–30 m sprints from a standing or crouched start. They train the start; top speed needs longer, flying runs.",
      is: "5–30 m sprettir frá kyrrstöðu. Þeir þjálfa startið; hámarkshraði þarf lengri, fljúgandi spretti.",
    },
    evidence: "accel",
    dose: {
      en: "4–8 × 10–30 m at full effort · 2–7 min rest · 100–300 m in all",
      is: "4–8 × 10–30 m á fullu · 2–7 mín hvíld · 100–300 m alls",
    },
    findings: [
      {
        ref: "haugen2019",
        text: {
          en: "Best-practice guide for the start: 10–50 m at over 98%, 2–7 min rest, 100–300 m a session.",
          is: "Viðmið fyrir startið: 10–50 m á yfir 98%, 2–7 mín hvíld, 100–300 m á æfingu.",
        },
      },
      {
        ref: "mendiguchia2020",
        text: {
          en: "Sprint group in footballers: 5 m time −3.4% and 20 m −2.6% (moderate and small), a bigger gain at the start than at top speed.",
          is: "Sprettahópur hjá fótboltamönnum: 5 m tími −3,4% og 20 m −2,6% (miðlungs og lítið), meiri bæting í starti en í hámarkshraða.",
        },
      },
    ],
    howTo: [
      { en: "Pair them with flying sprints in the same session: start first, then top speed.", is: "Paraðu þá við fljúgandi spretti á sömu æfingu: start fyrst, svo hámarkshraði." },
    ],
  },
  {
    key: "resisted_sled",
    label: { en: "Sled sprints", is: "Sleðasprettir" },
    summary: {
      en: "Sprints pulling a sled or wearing a weighted vest. They improve the start, not top speed.",
      is: "Sprettir með sleða eða þyngdarvesti. Þeir bæta startið, ekki hámarkshraða.",
    },
    evidence: "accel",
    dose: {
      en: "10–30 m · 50–200 m in all · 3–6 min rest · load chosen by how much it slows the runner",
      is: "10–30 m · 50–200 m alls · 3–6 mín hvíld · þyngd valin eftir því hve mikið hún hægir á",
    },
    findings: [
      {
        ref: "alcaraz2018",
        text: {
          en: "Meta-analysis: sled training improved the start (effect 0.61) but not the top-speed phase (0.27, not significant).",
          is: "Safngreining: sleðaþjálfun bætti startið (áhrif 0,61) en ekki hámarkshraðafasann (0,27, ómarktækt).",
        },
      },
      {
        ref: "myrvang2024",
        text: {
          en: "21 studies: sled training beat normal sprinting only over 10 m; no difference in top speed.",
          is: "21 rannsókn: sleði var betri en venjulegir sprettir aðeins á 10 m; enginn munur á hámarkshraða.",
        },
      },
    ],
    howTo: [
      { en: "Use it for the start, not as the top-speed session.", is: "Notaðu hann fyrir startið, ekki sem hámarkshraðaæfingu." },
    ],
  },
  {
    key: "hip_thrust",
    label: { en: "Hip thrust", is: "Hip thrust (mjaðmalyfta)" },
    summary: {
      en: "Helps the start a little, mostly in young athletes. Little shown for top speed.",
      is: "Hjálpar startinu lítillega, helst hjá ungum íþróttamönnum. Lítið sýnt fyrir hámarkshraða.",
    },
    evidence: "accel",
    dose: {
      en: "As part of strength work, not instead of squats",
      is: "Sem hluti af styrktarvinnu, ekki í stað hnébeygju",
    },
    findings: [
      {
        ref: "lin2026",
        text: {
          en: "20 trials: sprint gains mostly in athletes under 18 (effect 0.50); hip thrust on its own gave a borderline effect (0.22). Low certainty.",
          is: "20 rannsóknir: bæting í sprettum helst hjá yngri en 18 ára (áhrif 0,50); hip thrust eitt og sér gaf varla marktæk áhrif (0,22). Lítil vissa.",
        },
      },
    ],
    howTo: [],
  },
  {
    key: "nordic",
    label: { en: "Nordic hamstring curl", is: "Nordic aftanlærisæfing" },
    summary: {
      en: "Builds hamstring strength. A small gain over 10 m in one trial; no top-speed gain shown.",
      is: "Byggir styrk í aftanlæri. Lítil bæting á 10 m í einni rannsókn; engin bæting á hámarkshraða sýnd.",
    },
    evidence: "none",
    dose: {
      en: "Keep it for the hamstrings: 2–3 × 4–6, 1–2× a week",
      is: "Haltu henni fyrir aftanlærið: 2–3 × 4–6, 1–2× í viku",
    },
    findings: [
      {
        ref: "ishoi2018",
        text: {
          en: "10 weeks in season: 10 m sprint 0.05 s faster than controls (d 0.64), with large gains in hamstring strength.",
          is: "10 vikur á tímabili: 10 m sprettur 0,05 s hraðari en hjá viðmiðunarhópi (d 0,64), og mikil aukning í styrk aftanlæris.",
        },
      },
      {
        ref: "mendiguchia2020",
        text: {
          en: "6 weeks of Nordics alone: top speed unchanged, start slightly slower; hamstring fibres +7% longer (sprint training gave +16%).",
          is: "6 vikur af Nordic einni: hámarkshraði óbreyttur, start aðeins hægara; vöðvaþræðir aftanlæris 7% lengri (sprettþjálfun gaf 16%).",
        },
      },
    ],
    howTo: [],
  },
  {
    key: "assisted",
    label: { en: "Assisted (towed) sprints", is: "Sprettir með aðstoð (dregnir)" },
    summary: {
      en: "Being towed faster than you can run. No better than normal sprinting, and coaches avoid it for injury risk.",
      is: "Að vera dreginn hraðar en maður hleypur. Ekki betra en venjulegir sprettir og þjálfarar forðast það vegna meiðslahættu.",
    },
    evidence: "none",
    dose: { en: "Not recommended for teams", is: "Ekki mælt með fyrir lið" },
    findings: [
      {
        ref: "myrvang2024",
        text: {
          en: "No difference against normal sprinting in top speed, 20 m time or stride.",
          is: "Enginn munur á móti venjulegum sprettum í hámarkshraða, 20 m tíma eða skrefum.",
        },
      },
      {
        ref: "haugen2019",
        text: {
          en: "Elite coaches rarely use towing devices because of injury risk; a tailwind is the preferred way to run faster than usual.",
          is: "Bestu þjálfarar nota sjaldan dráttartæki vegna meiðslahættu; meðvindur er frekar notaður til að hlaupa hraðar en venjulega.",
        },
      },
    ],
    howTo: [],
  },
  {
    key: "submax_sprints",
    label: { en: "Sprint sets at 90% once a week", is: "Sprettir á 90% einu sinni í viku" },
    summary: {
      en: "Weekly 20 m sprint sets at 90% or full effort with short rest. No gain in junior footballers.",
      is: "Vikulegir 20 m sprettir á 90% eða fullu með stuttri hvíld. Engin bæting hjá ungum fótboltamönnum.",
    },
    evidence: "none",
    dose: {
      en: "Not enough on its own: run faster, rest longer, or add strength work",
      is: "Dugar ekki eitt og sér: hlauptu hraðar, hvíldu lengur eða bættu við styrk",
    },
    findings: [
      {
        ref: "haugen2015",
        text: {
          en: "7 weeks, one session a week (15 × 20 m at full speed or 30 × 20 m at 90%): no group got faster than the controls.",
          is: "7 vikur, ein æfing á viku (15 × 20 m á fullu eða 30 × 20 m á 90%): enginn hópur varð hraðari en viðmiðunarhópurinn.",
        },
      },
    ],
    howTo: [],
  },
  {
    key: "team_only",
    label: { en: "Team training only", is: "Bara liðsæfingar" },
    summary: {
      en: "Matches, games and drills with no sprint or strength work. Did not improve top speed.",
      is: "Leikir, spil og æfingar án spretta eða styrktar. Bætti ekki hámarkshraða.",
    },
    evidence: "none",
    dose: { en: "Add flying sprints and strength work on top", is: "Bættu fljúgandi sprettum og styrk ofan á" },
    findings: [
      {
        ref: "nicholson2022",
        text: {
          en: "Groups that only did team training did not improve their top-speed phase.",
          is: "Hópar sem æfðu bara með liðinu bættu ekki hámarkshraðafasann.",
        },
      },
    ],
    howTo: [],
  },
];

export const SPEED_METHOD_BY_KEY: Record<SpeedMethodKey, SpeedMethod> = Object.fromEntries(
  SPEED_METHODS.map((m) => [m.key, m]),
) as Record<SpeedMethodKey, SpeedMethod>;

// ─── Library read (layer 0 → 1 → 2) ──────────────────────────────────────

export const SPEED_VERDICT: Bi = {
  en: "Sprint at full speed and build strength: together they have the best evidence for top speed. A sled helps the start, not top speed.",
  is: "Sprettu á fullum hraða og byggðu styrk: saman hafa þau sterkustu gögnin fyrir hámarkshraða. Sleði hjálpar startinu, ekki hámarkshraðanum.",
};

export const SPEED_FACTS: Bi[] = [
  {
    en: "Team training alone does not raise top speed. In 60 football studies, only groups that added strength, power or jump work improved it significantly (Nicholson 2022).",
    is: "Liðsæfingar einar hækka ekki hámarkshraða. Í 60 fótboltarannsóknum bættu aðeins hópar sem bættu við styrk, krafti eða stökkum hann marktækt (Nicholson 2022).",
  },
  {
    en: "Expect small gains: about 1.5–3.5% over 6–9 weeks in the trials here.",
    is: "Búðu þig undir litla bætingu: um 1,5–3,5% á 6–9 vikum í rannsóknunum hér.",
  },
  {
    en: "Full speed needs full rest: 4 minutes or more between runs, and stop when speed drops (Haugen 2019).",
    is: "Fullur hraði þarf fulla hvíld: 4 mínútur eða meira milli spretta, og hættu þegar hraðinn dettur (Haugen 2019).",
  },
];

export const SPEED_CAVEATS: Bi[] = [
  {
    en: "Many studies time 30–40 m from a standing start, which mixes the start and top speed.",
    is: "Margar rannsóknir mæla 30–40 m frá kyrrstöðu, sem blandar saman starti og hámarkshraða.",
  },
  {
    en: "Most trials are small (often 7–12 players a group) and short (6–10 weeks).",
    is: "Flestar rannsóknir eru litlar (oft 7–12 leikmenn í hóp) og stuttar (6–10 vikur).",
  },
  {
    en: "Each finding says whether MicroPulse read the full paper or only its abstract.",
    is: "Hver niðurstaða segir hvort MicroPulse las greinina alla eða aðeins útdráttinn.",
  },
];

export const VERIFIED_LABEL: Record<VerifiedFrom, Bi> = {
  full_text: { en: "full paper read", is: "öll greinin lesin" },
  abstract: { en: "abstract only", is: "aðeins útdráttur" },
};

// ─── Plans ────────────────────────────────────────────────────────────────

export const SPEED_PLAN_BASIS: Bi = {
  en: "No study tested these exact plans. The doses come from the studies cited; putting them together into a week is MicroPulse's work.",
  is: "Engin rannsókn prófaði nákvæmlega þessar áætlanir. Skammtarnir koma úr rannsóknunum sem vísað er í; samsetningin í viku er MicroPulse.",
};

/** Rules that apply to all three plans. */
export const SPEED_SAFETY: Bi[] = [
  {
    en: `A player with more than ${LONG_GAP_DAYS} days since a run at 90% of top speed starts with two build-up sessions at 80–90%, not a flat-out sprint (the "Top speed due" rule).`,
    is: `Leikmaður með meira en ${LONG_GAP_DAYS} daga síðan sprett á 90% af hámarkshraða byrjar á tveimur uppbyggingaræfingum á 80–90%, ekki hámarkssprett (sama regla og „Tími á hámarkshraða").`,
  },
  {
    en: "Sprint fresh: early in the session after a full warm-up, and stop when speed drops.",
    is: "Sprettu ferskur: snemma á æfingu eftir góða upphitun, og hættu þegar hraðinn dettur.",
  },
  {
    en: "At least 48 hours between top-speed sessions (a match counts as one).",
    is: "Minnst 48 klst milli hámarkshraðaæfinga (leikur telst sem ein).",
  },
  {
    en: "Running near top speed regularly is associated with fewer hamstring injuries; a sudden jump after a long gap is associated with more (Malone 2017; Buchheit 2023).",
    is: "Reglulegir sprettir nálægt hámarkshraða tengjast færri aftanlærismeiðslum; snögg aukning eftir langt hlé tengist fleiri (Malone 2017; Buchheit 2023).",
  },
];

/** Most metres run flat out in one session (Haugen 2019: 50–150 m, build-up excluded). */
export const MAX_FLYING_M_PER_SESSION = 150;
/** Fewest days between two top-speed sessions (48 h). */
export const MIN_DAYS_BETWEEN_TOP_SPEED = 2;

export type SpeedBlock = {
  method: SpeedMethodKey;
  what: Bi;
  dose: Bi;
  /** A run at (or meant to reach) top speed. Only "best"/"some" methods may carry it. */
  topSpeed?: boolean;
  /** Metres run flat out in this block (build-up excluded). */
  flatOutM?: number;
  /** A speed test (flying 10–20 m or GPS top speed). */
  test?: boolean;
};

export type SpeedSession = {
  /** 0 = Monday … 6 = Sunday. */
  day: number;
  dayLabel: Bi;
  focus: Bi;
  blocks: SpeedBlock[];
};

export type SpeedWeek = { label: Bi; sessions: SpeedSession[] };

export type SpeedPlanKey = "in_season" | "pre_season" | "individual";

export type SpeedPlan = {
  key: SpeedPlanKey;
  title: Bi;
  who: Bi;
  verdict: Bi;
  facts: Bi[];
  /** Match day (0 = Monday) when the plan sits around a weekly match. */
  matchDay?: number;
  weeks: SpeedWeek[];
  refs: SpeedRefKey[];
};

const DAY: Record<number, Bi> = {
  0: { en: "Monday", is: "Mánudagur" },
  1: { en: "Tuesday", is: "Þriðjudagur" },
  3: { en: "Thursday", is: "Fimmtudagur" },
  4: { en: "Friday", is: "Föstudagur" },
};

const flying = (reps: number, metres: number, buildUp: string): SpeedBlock => ({
  method: "flying_sprints",
  topSpeed: true,
  flatOutM: reps * metres,
  what: { en: "Flying sprints, straight after the warm-up", is: "Fljúgandi sprettir, strax eftir upphitun" },
  dose: {
    en: `${reps} × ${metres} m flat out · ${buildUp} m build-up · 4+ min rest`,
    is: `${reps} × ${metres} m á fullu · ${buildUp} m aðhlaup · 4+ mín hvíld`,
  },
});

const strides = (reps: string): SpeedBlock => ({
  method: "flying_sprints",
  what: { en: "Build-up runs (not flat out)", is: "Uppbyggingarsprettir (ekki á fullu)" },
  dose: { en: `${reps} × 60 m, reaching 80–90% of top speed · walk back`, is: `${reps} × 60 m, upp í 80–90% af hámarkshraða · ganga til baka` },
});

const starts = (dose: Bi): SpeedBlock => ({
  method: "accel_sprints",
  what: { en: "Short sprints from a standing start", is: "Stuttir sprettir frá kyrrstöðu" },
  dose,
});

const lifts = (dose: Bi): SpeedBlock => ({
  method: "heavy_strength",
  what: { en: "Gym: heavy legs, after the running", is: "Salur: þungar fætur, eftir hlaupin" },
  dose,
});

const jumps = (contacts: string): SpeedBlock => ({
  method: "plyometrics",
  what: { en: "Jumps and forward bounds", is: "Hopp og skrefstökk áfram" },
  dose: { en: `${contacts} foot contacts`, is: `${contacts} snertingar` },
});

const jumpSquat = (sets: number): SpeedBlock => ({
  method: "jump_squat",
  what: { en: "Light jump squats", is: "Hnébeygjuhopp með léttri þyngd" },
  dose: { en: `${sets} × 5, fast`, is: `${sets} × 5, hratt` },
});

const nordics = (dose: string): SpeedBlock => ({
  method: "nordic",
  what: { en: "Nordic curls (for the hamstrings, not for speed)", is: "Nordic (fyrir aftanlærið, ekki fyrir hraða)" },
  dose: { en: dose, is: dose },
});

const speedTest = (reps: number, metres: number): SpeedBlock => ({
  method: "flying_sprints",
  topSpeed: true,
  test: true,
  flatOutM: reps * metres,
  what: { en: "Speed test", is: "Hraðapróf" },
  dose: {
    en: `${reps} × flying ${metres} m (or GPS top speed) · 30 m build-up · full rest · keep the best`,
    is: `${reps} × fljúgandi ${metres} m (eða hámarkshraði úr GPS) · 30 m aðhlaup · full hvíld · besti gildir`,
  },
});

const heavy = (sets: string, reps: string): Bi => ({
  en: `Squat or trap-bar deadlift ${sets} × ${reps} heavy · Romanian deadlift 3 × 6`,
  is: `Hnébeygja eða trap bar ${sets} × ${reps} þungt · rúmensk réttstöðulyfta 3 × 6`,
});

const session = (day: number, focus: Bi, blocks: SpeedBlock[]): SpeedSession => ({ day, dayLabel: DAY[day], focus, blocks });

const SPEED_FOCUS: Bi = { en: "Speed + strength", is: "Hraði + styrkur" };
const JUMP_FOCUS: Bi = { en: "Start + jumps + power", is: "Start + hopp + kraftur" };

export const SPEED_PLANS: SpeedPlan[] = [
  {
    key: "in_season",
    title: { en: "In season: one match a week", is: "Á tímabili: einn leikur í viku" },
    who: { en: "Football team in season, match on Saturday (MD).", is: "Fótboltalið á tímabili, leikur á laugardegi (MD)." },
    verdict: {
      en: "One top-speed session and one strength session a week keep speed up through the season.",
      is: "Ein hámarkshraðaæfing og ein styrktaræfing á viku halda hraðanum í gegnum tímabilið.",
    },
    facts: [
      {
        en: "MD-4: flying sprints early in the pitch session, then strength in the gym after.",
        is: "MD-4: fljúgandi sprettir snemma á æfingu, svo styrkur í sal á eftir.",
      },
      {
        en: "MD-2 (optional): one or two fast runs for players the \"Top speed due\" flag names, or who did not play.",
        is: "MD-2 (valfrjálst): einn eða tveir hraðir sprettir fyrir þá sem „Tími á hámarkshraða\" nefnir, eða spiluðu ekki.",
      },
      {
        en: "One strength session a week holds pre-season speed; one every second week does not (Rønnestad 2011).",
        is: "Ein styrktaræfing á viku heldur hraða undirbúningstímabilsins; önnur hver vika gerir það ekki (Rønnestad 2011).",
      },
    ],
    matchDay: 5,
    weeks: [
      {
        label: { en: "Every week", is: "Hver vika" },
        sessions: [
          {
            day: 1,
            dayLabel: { en: "MD-4", is: "MD-4" },
            focus: { en: "Top speed + strength", is: "Hámarkshraði + styrkur" },
            blocks: [
              flying(4, 20, "20–30"),
              lifts({ en: "Squat or trap-bar deadlift 2–3 × 3–5 heavy", is: "Hnébeygja eða trap bar 2–3 × 3–5 þungt" }),
              jumpSquat(3),
              jumps("40–60"),
            ],
          },
          {
            day: 3,
            dayLabel: { en: "MD-2 (optional)", is: "MD-2 (valfrjálst)" },
            focus: { en: "Top-up for those who need it", is: "Viðbót fyrir þá sem þurfa" },
            blocks: [
              {
                method: "flying_sprints",
                topSpeed: true,
                flatOutM: 40,
                what: {
                  en: "Flying sprints for players the \"Top speed due\" flag names, or who did not play",
                  is: "Fljúgandi sprettir fyrir þá sem „Tími á hámarkshraða\" nefnir, eða spiluðu ekki",
                },
                dose: {
                  en: `1–2 × 20 m at 95–100% · 30 m build-up · full rest · more than ${LONG_GAP_DAYS} days since 90%: 2–3 build-up runs at 80–90% instead`,
                  is: `1–2 × 20 m á 95–100% · 30 m aðhlaup · full hvíld · meira en ${LONG_GAP_DAYS} dagar síðan 90%: 2–3 uppbyggingarsprettir á 80–90% í staðinn`,
                },
              },
            ],
          },
        ],
      },
    ],
    refs: ["haugen2019", "ronnestad2011", "loturco2016", "buchheit2023", "nicholson2022", "saez2012"],
  },
  {
    key: "pre_season",
    title: { en: "Pre-season: 6 weeks", is: "Undirbúningstímabil: 6 vikur" },
    who: { en: "Football team in pre-season, alongside normal team training.", is: "Fótboltalið á undirbúningstímabili, samhliða venjulegum liðsæfingum." },
    verdict: {
      en: "Two speed-and-strength days a week for 6 weeks: sprint first, lift after, 72 hours apart.",
      is: "Tveir hraða- og styrktardagar á viku í 6 vikur: sprettir fyrst, lyftingar á eftir, 72 klst á milli.",
    },
    facts: [
      {
        en: "Flying sprints build from build-up runs to 4 × 30 m, never more than 120 m of flying sprints a session.",
        is: "Fljúgandi sprettir byggjast upp úr uppbyggingarsprettum í 4 × 30 m, aldrei meira en 120 m af fljúgandi sprettum á æfingu.",
      },
      {
        en: "Strength gets heavier over the weeks (6 → 4 → 3 reps), with light, fast jump squats alongside.",
        is: "Styrkurinn þyngist yfir vikurnar (6 → 4 → 3 endurtekningar), með léttum, hröðum hnébeygjuhoppum samhliða.",
      },
      {
        en: "Test a flying 20 m (or GPS top speed) at the end of week 2, after the build-up, and again in week 6.",
        is: "Mældu fljúgandi 20 m (eða hámarkshraða úr GPS) í lok viku 2, eftir uppbygginguna, og aftur í viku 6.",
      },
    ],
    weeks: [
      {
        label: { en: "Week 1: build-up", is: "Vika 1: uppbygging" },
        sessions: [
          session(0, SPEED_FOCUS, [strides("4"), starts({ en: "4 × 20 m at 90%", is: "4 × 20 m á 90%" }), lifts(heavy("3", "6")), nordics("2 × 4")]),
          session(3, JUMP_FOCUS, [jumps("60"), starts({ en: "4 × 10–20 m at 90%", is: "4 × 10–20 m á 90%" }), jumpSquat(3)]),
        ],
      },
      {
        label: { en: "Week 2: build-up + test", is: "Vika 2: uppbygging + mæling" },
        sessions: [
          session(0, SPEED_FOCUS, [strides("5"), starts({ en: "4 × 20 m at full effort", is: "4 × 20 m á fullu" }), lifts(heavy("3", "6")), nordics("2 × 5")]),
          session(3, JUMP_FOCUS, [speedTest(2, 20), jumps("60"), jumpSquat(3)]),
        ],
      },
      {
        label: { en: "Weeks 3–4: speed", is: "Vikur 3–4: hraði" },
        sessions: [
          session(0, SPEED_FOCUS, [starts({ en: "4 × 30 m at full effort · 3 min rest", is: "4 × 30 m á fullu · 3 mín hvíld" }), flying(3, 20, "20–30"), lifts(heavy("4", "4")), nordics("3 × 5")]),
          session(3, JUMP_FOCUS, [jumps("80"), starts({ en: "5 × 10–20 m at full effort", is: "5 × 10–20 m á fullu" }), jumpSquat(4)]),
        ],
      },
      {
        label: { en: "Week 5: peak", is: "Vika 5: hámark" },
        sessions: [
          session(0, SPEED_FOCUS, [starts({ en: "3 × 30 m at full effort", is: "3 × 30 m á fullu" }), flying(4, 30, "30–40"), lifts(heavy("4", "3")), nordics("3 × 5")]),
          session(3, JUMP_FOCUS, [jumps("100"), starts({ en: "5 × 10–20 m at full effort", is: "5 × 10–20 m á fullu" }), jumpSquat(4)]),
        ],
      },
      {
        label: { en: "Week 6: ease off + test", is: "Vika 6: minna magn + mæling" },
        sessions: [
          session(0, SPEED_FOCUS, [flying(3, 20, "30"), lifts(heavy("2", "3"))]),
          session(3, JUMP_FOCUS, [speedTest(3, 20), jumps("40")]),
        ],
      },
    ],
    refs: ["mendiguchia2020", "kotzamanidis2005", "haugen2019", "saez2012", "loturco2016", "nicholson2022"],
  },
  {
    key: "individual",
    title: { en: "Individual: 8 weeks", is: "Einstaklingur: 8 vikur" },
    who: { en: "One player or client training with a coach, 4 days a week.", is: "Einn leikmaður eða skjólstæðingur sem æfir með þjálfara, 4 daga í viku." },
    verdict: {
      en: "Two sprint days and two gym days a week: build up for 2 weeks, run flying sprints for 4, then ease off and test.",
      is: "Tveir sprettdagar og tveir salardagar á viku: uppbygging í 2 vikur, fljúgandi sprettir í 4, svo minna magn og mæling.",
    },
    facts: [
      {
        en: "Test top speed (flying 20 m or GPS) at the start of week 3 and again in week 8.",
        is: "Mældu hámarkshraða (fljúgandi 20 m eða GPS) í byrjun viku 3 og aftur í viku 8.",
      },
      {
        en: "Flying sprints lengthen from 10 m to 30 m; never more than 150 m flat out a session.",
        is: "Fljúgandi sprettir lengjast úr 10 m í 30 m; aldrei meira en 150 m á fullu á æfingu.",
      },
      {
        en: "Gym: heavy legs early in the week, fast and light later in the week.",
        is: "Salur: þungar fætur snemma í vikunni, hratt og létt seinna í vikunni.",
      },
    ],
    weeks: [
      {
        label: { en: "Weeks 1–2: build-up", is: "Vikur 1–2: uppbygging" },
        sessions: [
          session(0, { en: "Sprint", is: "Sprettir" }, [strides("4–6"), starts({ en: "4 × 20 m at 90%", is: "4 × 20 m á 90%" })]),
          session(1, { en: "Gym: heavy", is: "Salur: þungt" }, [lifts(heavy("3", "6")), nordics("2 × 4")]),
          session(3, { en: "Sprint", is: "Sprettir" }, [strides("4–6"), starts({ en: "4 × 20 m at 90%", is: "4 × 20 m á 90%" })]),
          session(4, { en: "Gym: fast", is: "Salur: hratt" }, [jumps("60"), jumpSquat(3)]),
        ],
      },
      {
        label: { en: "Week 3: test + short flying sprints", is: "Vika 3: mæling + stuttir fljúgandi sprettir" },
        sessions: [
          session(0, { en: "Test + sprint", is: "Mæling + sprettir" }, [speedTest(2, 20), flying(3, 10, "20")]),
          session(1, { en: "Gym: heavy", is: "Salur: þungt" }, [lifts(heavy("4", "4")), nordics("3 × 4")]),
          session(3, { en: "Sprint", is: "Sprettir" }, [starts({ en: "3 × 20 m at full effort", is: "3 × 20 m á fullu" }), flying(4, 10, "20")]),
          session(4, { en: "Gym: fast", is: "Salur: hratt" }, [jumps("80"), jumpSquat(4)]),
        ],
      },
      {
        label: { en: "Week 4", is: "Vika 4" },
        sessions: [
          session(0, { en: "Sprint", is: "Sprettir" }, [starts({ en: "3 × 20 m at full effort", is: "3 × 20 m á fullu" }), flying(4, 15, "20–30")]),
          session(1, { en: "Gym: heavy", is: "Salur: þungt" }, [lifts(heavy("4", "4")), nordics("3 × 5")]),
          session(3, { en: "Sprint", is: "Sprettir" }, [flying(4, 15, "20–30")]),
          session(4, { en: "Gym: fast", is: "Salur: hratt" }, [jumps("80"), jumpSquat(4)]),
        ],
      },
      {
        label: { en: "Weeks 5–6", is: "Vikur 5–6" },
        sessions: [
          session(0, { en: "Sprint", is: "Sprettir" }, [starts({ en: "3 × 20 m at full effort", is: "3 × 20 m á fullu" }), flying(4, 20, "30")]),
          session(1, { en: "Gym: heavy", is: "Salur: þungt" }, [lifts(heavy("4", "3")), nordics("3 × 5")]),
          session(3, { en: "Sprint", is: "Sprettir" }, [flying(3, 30, "30–40")]),
          session(4, { en: "Gym: fast", is: "Salur: hratt" }, [jumps("100"), jumpSquat(4)]),
        ],
      },
      {
        label: { en: "Week 7: ease off", is: "Vika 7: minna magn" },
        sessions: [
          session(0, { en: "Sprint", is: "Sprettir" }, [flying(3, 20, "30")]),
          session(1, { en: "Gym: heavy", is: "Salur: þungt" }, [lifts(heavy("2", "3"))]),
          session(3, { en: "Sprint", is: "Sprettir" }, [flying(2, 30, "30–40")]),
          session(4, { en: "Gym: fast", is: "Salur: hratt" }, [jumps("60"), jumpSquat(3)]),
        ],
      },
      {
        label: { en: "Week 8: test", is: "Vika 8: mæling" },
        sessions: [
          session(0, { en: "Sprint", is: "Sprettir" }, [flying(2, 20, "30")]),
          session(1, { en: "Gym: light", is: "Salur: létt" }, [jumps("40"), jumpSquat(2)]),
          session(3, { en: "Test", is: "Mæling" }, [speedTest(3, 20)]),
        ],
      },
    ],
    refs: ["haugen2019", "mendiguchia2020", "nicholson2022", "saez2012", "loturco2016", "ronnestad2011"],
  },
];

export const SPEED_PLAN_BY_KEY: Record<SpeedPlanKey, SpeedPlan> = Object.fromEntries(
  SPEED_PLANS.map((p) => [p.key, p]),
) as Record<SpeedPlanKey, SpeedPlan>;

/** Metres run flat out in a session. */
export function flatOutMetres(s: SpeedSession): number {
  return s.blocks.reduce((sum, b) => sum + (b.topSpeed ? b.flatOutM ?? 0 : 0), 0);
}

/** True when a session holds a top-speed run. */
export function hasTopSpeed(s: SpeedSession): boolean {
  return s.blocks.some((b) => b.topSpeed);
}

/**
 * Days between consecutive top-speed exposures across the plan, weeks laid end to end (the last week wraps
 * to the first week of the next cycle for a repeating in-season week). A match counts as an exposure.
 */
export function topSpeedGaps(plan: SpeedPlan): number[] {
  const days: number[] = [];
  plan.weeks.forEach((w, wi) => {
    const inWeek = w.sessions.filter(hasTopSpeed).map((s) => s.day);
    if (plan.matchDay != null) inWeek.push(plan.matchDay);
    for (const d of [...new Set(inWeek)].sort((a, b) => a - b)) days.push(wi * 7 + d);
  });
  if (days.length < 2) return [];
  const gaps = days.slice(1).map((d, i) => d - days[i]);
  if (plan.matchDay != null) gaps.push(days[0] + plan.weeks.length * 7 - days[days.length - 1]);
  return gaps;
}

/** Every method a plan uses, in first-use order. */
export function planMethodKeys(plan: SpeedPlan): SpeedMethodKey[] {
  const keys = new Set<SpeedMethodKey>();
  for (const w of plan.weeks) for (const s of w.sessions) for (const b of s.blocks) keys.add(b.method);
  return [...keys];
}
