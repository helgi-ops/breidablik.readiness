/**
 * Coach tutorial content — bilingual, one entry per coach page.
 *
 * Source: docs/MicroPulse-notkun-leidarvisir.pdf (the coach usage guide, already
 * EN+IS). Surfaced as a "How to use this page" overlay from each page's header
 * (see CoachTutorialModal + PagePurpose). Text-only + one embedded overview video
 * on `today`; no screenshots (they go stale). Plain language, explainability-first
 * — the same "verdict → why → details" spirit the pages themselves follow.
 *
 * To add a tutorial to another page: add a slug here and pass it to that page's
 * <PagePurpose tutorial="…" />. The link only appears where a slug exists.
 */

export type Bi = { en: string; is: string };

export type TutorialSlug =
  | "today"
  | "week-setup"
  | "load-intelligence"
  | "quadrant"
  | "indoor-load"
  | "decel-intelligence"
  | "ima-intelligence"
  | "match-movement"
  | "position-comparison"
  | "post-match-recovery"
  | "train-like-you-play"
  | "injury-pattern-analysis"
  | "hsr-intelligence"
  | "return-to-training";

export type TutorialSection = { heading: Bi; body: Bi[] };

export type Tutorial = {
  title: Bi;
  intro?: Bi;
  /** Third-party embed URL (iframe), overview video for this page (optional). */
  videoEmbedUrl?: string;
  /**
   * Responsive-iframe aspect ratio as a padding-top %, taken from the embed's own
   * wrapper. Defaults to "56.25%" (16:9); set e.g. "75%" for a 4:3 source so the
   * video fills the frame without letterboxing.
   */
  videoAspectPaddingTop?: string;
  sections: TutorialSection[];
};

// Overview video for the Today tutorial (Vimeo embed). Replaced the earlier
// Pictory URL, which 404'd. The modal renders it in a 16:9 iframe automatically;
// the completeness test allows `today` (only) to carry it.
const TODAY_VIDEO: string | undefined =
  "https://player.vimeo.com/video/1212261552?h=0c3eb76e3d&badge=0&autopause=0&player_id=0&app_id=58479";

// Decel Intelligence page walkthrough (Vimeo). Content mirrors
// docs/load-guides/MicroPulse-Decel-Intelligence-full-page-explained.pdf.
const DECEL_VIDEO =
  "https://player.vimeo.com/video/1212263631?h=5652ad6f84&badge=0&autopause=0&player_id=0&app_id=58479";

// IMA Intelligence page walkthrough (Vimeo). Content mirrors
// docs/load-guides/MicroPulse-IMA-Intelligence-full-page-explained.pdf.
const IMA_VIDEO =
  "https://player.vimeo.com/video/1212270885?h=e7fee7a2f0&badge=0&autopause=0&player_id=0&app_id=58479";

// Match Movement page walkthrough (Vimeo). Content mirrors
// docs/load-guides/MicroPulse-Match-Movement-full-page-explained.pdf.
const MATCH_MOVEMENT_VIDEO =
  "https://player.vimeo.com/video/1212417376?h=bffde1c0ce&badge=0&autopause=0&player_id=0&app_id=58479";

// Indoor Load page walkthrough (Vimeo). Content mirrors
// docs/load-guides/MicroPulse-Indoor-Load-full-page-explained.pdf.
const INDOOR_LOAD_VIDEO =
  "https://player.vimeo.com/video/1212426403?h=8bfdc0ca29&badge=0&autopause=0&player_id=0&app_id=58479";

// Quadrant Intelligence page walkthrough (Vimeo). Content mirrors
// docs/load-guides/MicroPulse-Load-Quadrant-guide.pdf.
const QUADRANT_VIDEO =
  "https://player.vimeo.com/video/1212433865?h=4f2266a7c3&badge=0&autopause=0&player_id=0&app_id=58479";

// Position Comparison page walkthrough (Vimeo). Content mirrors
// docs/load-guides/MicroPulse-Position-Comparison-full-page-explained.pdf.
const POSITION_COMPARISON_VIDEO =
  "https://player.vimeo.com/video/1212444461?h=248ab8e3ff&badge=0&autopause=0&player_id=0&app_id=58479";

// Post-match Recovery page walkthrough (Vimeo). Content mirrors
// docs/load-guides/MicroPulse-Post-match-Recovery-full-page-Pictory.pptx (EN-only
// source — the Icelandic below is translated, not lifted from the deck).
const POST_MATCH_RECOVERY_VIDEO =
  "https://player.vimeo.com/video/1212447762?h=272986f3fd&badge=0&autopause=0&player_id=0&app_id=58479";

// Train like you Play page walkthrough (Vimeo). Content mirrors
// docs/load-guides/MicroPulse-Train-like-you-Play-full-page-explained.pdf.
const TRAIN_LIKE_YOU_PLAY_VIDEO =
  "https://player.vimeo.com/video/1212456357?h=78f5d93153&badge=0&autopause=0&player_id=0&app_id=58479";

// Injury Pattern Analysis page walkthrough (Vimeo). Content mirrors
// docs/load-guides/MicroPulse-Injury-Pattern-Analysis-full-page-explained.pdf.
// The page is /coach/injuries (no PagePurpose there — opened via CoachTutorialButton).
const INJURY_PATTERN_VIDEO =
  "https://player.vimeo.com/video/1212461431?h=51fdcef6e0&badge=0&autopause=0&player_id=0&app_id=58479";

// HSR Intelligence page walkthrough (Vimeo). Content mirrors
// docs/load-guides/MicroPulse-HSR-Intelligence-full-page-explained.pdf.
const HSR_VIDEO =
  "https://player.vimeo.com/video/1212478746?h=bca1c2d026&title=0&byline=0&portrait=0&badge=0&autopause=0&player_id=0&app_id=58479";

// Return-to-Training page walkthrough (Vimeo). Content mirrors
// docs/load-guides/MicroPulse-Return-to-Training-full-page-explained.pdf.
// This embed is 4:3 (the deck gave padding-top 75%), so the entry sets
// videoAspectPaddingTop to fill the frame without letterboxing.
const RETURN_TO_TRAINING_VIDEO =
  "https://player.vimeo.com/video/1212559489?h=69dfd294cc&badge=0&autopause=0&player_id=0&app_id=58479";

// Week Setup page walkthrough (Vimeo). Content mirrors
// docs/load-guides/MicroPulse-Week-Setup-full-page-explained.pdf.
const WEEK_SETUP_VIDEO =
  "https://player.vimeo.com/video/1212562893?h=4499ed9ccc&badge=0&autopause=0&player_id=0&app_id=58479";

export const TUTORIALS: Record<TutorialSlug, Tutorial> = {
  today: {
    title: { en: "How to use the Today page", is: "Hvernig á að nota Today-síðuna" },
    intro: {
      en: "You only need the Today page. It reads every signal — check-ins, Catapult load, VALD/CMJ tests, injury status — and returns one answer per player: green, amber or red, with a plain-language action. The rest of the system is there for when you want to go deeper, not every day.",
      is: "Þú þarft bara Today-síðuna. Hún les öll merkin — líðanarskráningar, Catapult-álag, VALD/CMJ-próf, stöðu gagnvart meiðslum — og skilar einu svari á leikmann: grænt, gult eða rautt, með aðgerð á mannamáli. Hitt kerfið er til staðar þegar þú vilt fara dýpra — ekki daglega.",
    },
    ...(TODAY_VIDEO ? { videoEmbedUrl: TODAY_VIDEO } : {}),
    sections: [
      {
        heading: { en: "Your morning — three minutes", is: "Morgunninn þinn — þrjár mínútur" },
        body: [
          {
            en: "Open Today and read the top sentence with the confidence beside it. Confidence tells you immediately whether to trust the day or whether too few players have checked in.",
            is: "Opnaðu Today og lestu efstu setninguna með örygginu við hliðina. Öryggið segir þér strax hvort þú getur treyst deginum eða hvort of fáir hafa skráð líðan.",
          },
          {
            en: "At the bottom the squad splits into ready / modified / recovery. A green squad means carry on as planned — that's all most days need.",
            is: "Neðst skiptist hópurinn í klár / aðlagað / endurheimt. Grænn hópur þýðir haltu áfram eins og planað var — það er allt sem flestir dagar þurfa.",
          },
          {
            en: "For each amber or red player the Decision Summary shows the action and the reason, with a counterfactual — “one more point of sleep and he'd be green” — so you can judge whether you agree.",
            is: "Fyrir hvern gulan eða rauðan leikmann sýnir Decision Summary aðgerðina og ástæðuna, með mótdæmi — „hefði svefn verið einum hærri væri hann grænn“ — svo þú getur metið hvort þú ert sammála.",
          },
        ],
      },
      {
        heading: { en: "The layered read — you choose the depth", is: "Lagskipti lesturinn — þú ræður dýptinni" },
        body: [
          {
            en: "Every screen is built in three layers so you never read more than you need. The verdict: one colour, one sentence (~5 s). The why: two or three plain facts, visible without a click (~15 s). The details: tables, ACWR, jargon — only behind “Show details”, for the S&C and physio.",
            is: "Hver skjámynd er byggð í þremur lögum svo þú lesir aldrei meira en þú þarft. Niðurstaðan: einn litur, ein setning (~5 sek). Ástæðan: tvær til þrjár einfaldar staðreyndir, sýnilegar án smells (~15 sek). Smáatriðin: töflur, ACWR, fagorð — bara á bak við „Show details“, fyrir styrktar- og sjúkraþjálfara.",
          },
        ],
      },
      {
        heading: { en: "Decision Summary", is: "Decision Summary" },
        body: [
          {
            en: "Each card shows the status, the trend since yesterday, and the action in plain language — e.g. “Clear for full session”. The reasoning (counterfactuals, drivers, confidence) is always one click below the decision; you don't have to open it, it's there when you want it.",
            is: "Hvert kort sýnir stöðuna, þróunina frá gærdeginum, og aðgerðina á mannamáli — t.d. „Clear for full session“. Rökin (mótdæmi, drivers, öryggi) liggja alltaf einum smelli undir ákvörðuninni; þú þarft ekki að opna þau, þau eru þarna þegar þú vilt.",
          },
        ],
      },
      {
        heading: { en: "Daily Briefing — trust the confidence", is: "Daily Briefing — treystu örygginu" },
        body: [
          {
            en: "Opening “Show details” expands the full morning briefing. The bottom line matters most: it states how many check-ins are missing. The system gives a verdict and in the same breath says how thin the data behind it is — so you know when to trust it and when to look at the pitch yourself.",
            is: "Þegar þú smellir á „Show details“ opnast fullt morgunyfirlit. Neðsta línan skiptir mestu: hún segir hversu margar líðanarskráningar vantar. Kerfið gefur niðurstöðu en segir um leið hversu þunn gögnin á bak við hana eru — svo þú veist hvenær þú átt að treysta því og hvenær þú átt að horfa sjálfur á völlinn.",
          },
        ],
      },
      {
        heading: { en: "What you keep fed", is: "Hvað þú þarft að halda við" },
        body: [
          {
            en: "Today reads everything automatically, but only what arrives. Five small inputs keep the day accurate: player check-ins (players, ~15 s before training — your job is the reminder), week setup (once a week), match minutes (after each match), injuries (log when they happen), and RPE. If they lapse, confidence drops and Today becomes more cautious than it needs to be.",
            is: "Today les allt sjálfkrafa, en aðeins það sem berst. Fimm lítil inntök halda deginum réttum: líðanarskráning (leikmenn, ~15 sek fyrir æfingu — þitt hlutverk er áminningin), vikuskipulag (einu sinni í viku), leikmínútur (eftir hvern leik), meiðsli (skráð þegar þau verða), og RPE. Ef þau falla niður lækkar öryggið og Today verður varkárara en það þyrfti.",
          },
        ],
      },
      {
        heading: { en: "When to go deeper", is: "Þegar þú vilt fara dýpra" },
        body: [
          {
            en: "You don't need the other pages daily. Open the relevant “Intelligence” page or tab when Today has flagged something and you want to understand why, or when a board or player asks a question that needs the number itself.",
            is: "Þú þarft ekki hinar síðurnar daglega. Opnaðu viðeigandi „Intelligence“-síðu eða flipa þegar Today hefur flaggað eitthvað og þú vilt skilja af hverju, eða þegar stjórn eða leikmaður spyr spurningar sem krefst tölunnar sjálfrar.",
          },
        ],
      },
      {
        heading: { en: "Remember", is: "Muna" },
        body: [
          {
            en: "The system advises, it does not rule. You always have the last word, and if you override a verdict it's logged with a reason. Rules decide, the AI explains — never the other way round.",
            is: "Kerfið gefur tillögu, ekki fyrirskipun. Þú hefur alltaf síðasta orðið, og ef þú hnekkir niðurstöðu er það skráð með ástæðu. Reglurnar ákveða, gervigreindin útskýrir — aldrei öfugt.",
          },
        ],
      },
    ],
  },

  "week-setup": {
    title: { en: "How to use Week Setup", is: "Hvernig á að nota Vikuskipulag" },
    intro: {
      en: "This is the upstream page — the weekly configuration that tells the whole system what a normal training day looks like. In three steps you set the week's dates and match count, its intensity, and the day-by-day plan sent to each player. Its most important output is the MD-day tag on each day, because every other page (load, readiness) reads “what's normal today” from it. Five minutes a week that the whole system depends on.",
      is: "Þetta er uppstreymissíðan — vikuuppsetningin sem segir öllu kerfinu hvað eðlilegur æfingadagur lítur út fyrir. Í þremur skrefum stillir þú dagsetningar vikunnar og fjölda leikja, ákefðina, og dag-fyrir-dag planið sem er sent til hvers leikmanns. Mikilvægasta afurðin er MD-daga merkingin á hvern dag, því allar hinar síðurnar (álag, reiðuskor) lesa „hvað er eðlilegt í dag“ úr henni. Fimm mínútur á viku sem allt kerfið treystir á.",
    },
    videoEmbedUrl: WEEK_SETUP_VIDEO,
    sections: [
      {
        heading: { en: "Use the page in 30 seconds", is: "Notaðu síðuna á 30 sekúndum" },
        body: [
          {
            en: "Step 1: set the dates and match count. Step 3: review the day-by-day plan (the MD tags and the session types). Read the microcycle suggestions and either follow or ignore them. Click “Activate” to send. And remember: the MD tag is what every other page reads.",
            is: "Skref 1: settu dagsetningar og fjölda leikja. Skref 3: yfirfarðu dag-fyrir-dag planið (MD-merkin og æfingategundirnar). Lestu microcycle-tillögurnar og annaðhvort fylgdu þeim eða hunsaðu. Smelltu á „Activate“ til að senda. Og mundu: MD-merkið er það sem allar hinar síðurnar lesa.",
          },
        ],
      },
      {
        heading: { en: "The three-step wizard", is: "Þriggja skrefa hjálparinn" },
        body: [
          {
            en: "Step 1 (Week type): the week's dates, the season (preseason / in-season / playoffs / off-season) and the match count (none / 1 / 2). Step 2 (Setup): intensity and manual control. Step 3 (Review & Activate): the day-by-day plan as players will see it, then “Activate → send to players”. A clear linear flow that ends in activation.",
            is: "Skref 1 (Week type): dagsetningar vikunnar, tímabil (preseason / in-season / playoffs / off-season) og fjöldi leikja (enginn / 1 / 2). Skref 2 (Setup): ákefð og handvirk stjórn. Skref 3 (Review & Activate): dag-fyrir-dag planið eins og leikmenn sjá það, og svo „Activate → send to players“. Skýrt línulegt flæði sem endar á virkjun.",
          },
        ],
      },
      {
        heading: { en: "MD-day tagging — the key output", is: "MD-daga merkingin — lykilafurðin" },
        body: [
          {
            en: "Each day gets a tag relative to match day: MD (the game), MD+1, MD+2 … and MD-1 before a match. This is the single most important thing the page produces, because Load Intelligence, readiness and the rest read “what's normal load for this day” from it. Without it, the system can't tell a match from a session.",
            is: "Hver dagur fær merki gagnvart leikdegi: MD (leikur), MD+1, MD+2 … og MD-1 fyrir leik. Þetta er það mikilvægasta sem síðan framleiðir, því Load Intelligence, reiðuskorið og allt hitt les „hvað er eðlilegt álag þennan dag“ úr merkingunni. Án hennar getur kerfið ekki aðgreint leik frá æfingu.",
          },
          {
            en: "When the week is activated, each player gets the right training day: a session type (GAME, OFF, RECOVERY or TRAIN) and a plain label (FORCE, POLISH/CALM, ACTIVATION and so on). The coach sets the week once; the whole squad gets it. This is what gets sent.",
            is: "Þegar vikan er virkjuð fær hver leikmaður réttan æfingadag: æfingategund (GAME, OFF, RECOVERY eða TRAIN) og einfaldan merkimiða (FORCE, POLISH/CALM, ACTIVATION o.s.frv.). Þjálfarinn stillir vikuna einu sinni; allur hópurinn fær hana. Þetta er það sem er sent.",
          },
        ],
      },
      {
        heading: { en: "Team breaks — humane by design", is: "Frí hópsins — mannúðlegt í eðli sínu" },
        body: [
          {
            en: "During a declared break players get a full rest: no reminders, no missed-check-in flags, and break days don't count against streak or compliance. The system also eases the return afterwards. So it reads a break as a break — not as a collapse in load or a lapse in discipline.",
            is: "Á skráðu fríi fá leikmenn fullt frí: engar áminningar, engin „vantar skráningu“ flögg, og frídagar teljast ekki gegn streaki eða skráningarhlutfalli. Kerfið mildar líka endurkomuna á eftir. Þannig les það frí sem frí — ekki sem hrun í álagi eða skort á aga.",
          },
        ],
      },
      {
        heading: { en: "Season-aware + manual override", is: "Tímabilsvitund + handvirk yfirtaka" },
        body: [
          {
            en: "Choosing the season shifts the week's intent — preparation, competition, playoffs or off-season call for a different shape. A manual override (“allow manual week setup”) lets the coach control day-to-day intent even when there are matches in the week — useful in preseason. Same frame, different intent by season.",
            is: "Val á tímabili breytir ásetningi vikunnar — undirbúningur, keppni, úrslitakeppni eða undirbúningstímabil kalla á ólíka lögun. Handvirk yfirtaka („allow manual week setup“) leyfir þjálfaranum að stýra ásetningi dag frá degi jafnvel þótt leikir séu í vikunni — gagnlegt á undirbúningstímabili. Sami rammi, ólíkur ásetningur eftir tímabili.",
          },
        ],
      },
      {
        heading: { en: "Microcycle review (Buchheit 2024)", is: "Microcycle-yfirferð (Buchheit 2024)" },
        body: [
          {
            en: "Once the week is built, an automatic, research-based review checks the shape and flags points — e.g. “move the rest day to MD+2” (a lower overuse-injury rate, Buchheit 2023, 56 team-seasons), or “place heavy eccentric work early, not late” (prolonged muscle damage / soreness). These are explicitly suggestions, not blocks — the coach decides, with the principle and citation shown.",
            is: "Þegar vikan er byggð fer sjálfvirk, rannsóknabyggð yfirferð yfir lögunina og bendir á atriði — t.d. „færðu frídaginn á MD+2“ (lægri ofnotkunar-meiðslatíðni, Buchheit 2023, 56 lið-tímabil), eða „settu þunga eccentric-vinnu snemma, ekki seint“ (langvarandi vöðvaskaði / eymsli). Þetta eru beinlínis tillögur, ekki hindranir — þjálfarinn ræður, með reglunni og heimildinni sýndri.",
          },
          {
            en: "Why it matters: this is the input that makes every downstream page fair. It's one of the small set of weekly coach inputs — skip it and the load model can't tell a match from a session and the MD logic breaks. A five-minute weekly setup that gives everything else its context: match days, intent, breaks — and sends each player the right day.",
            is: "Af hverju hún skiptir máli: þetta er inntakið sem gerir allar niðurstreymissíður sanngjarnar. Það er eitt af litla settinu af vikulegum inntökum þjálfarans — sleppirðu því getur álagslíkanið ekki aðgreint leik frá æfingu og MD-lógíkin brotnar. Fimm mínútna vikuuppsetning sem gefur öllu hinu samhengi: leikdaga, ásetning, frí — og sendir hverjum leikmanni réttan dag.",
          },
        ],
      },
    ],
  },

  "load-intelligence": {
    title: { en: "How to use Load Intelligence", is: "Hvernig á að nota Álagsgreiningu" },
    intro: {
      en: "Answers “is the squad building or easing?” — total load and who is spiking.",
      is: "Svarar „er hópurinn að þyngjast eða léttast?“ — heildarálag og hverjir toppa.",
    },
    sections: [
      {
        heading: { en: "The verdict first", is: "Niðurstaðan fyrst" },
        body: [
          {
            en: "Even this deeper page opens with a one-word verdict — e.g. “Building” — and a single sentence naming the players behind it. You read the answer before any numbers.",
            is: "Jafnvel þessi dýpri síða byrjar á niðurstöðu í einu orði — t.d. „Building“ — með einni setningu sem nefnir leikmennina á bak við hana. Þú lest svarið áður en nokkrar tölur koma.",
          },
        ],
      },
      {
        heading: { en: "The jargon is optional", is: "Fagorðin eru valkvæð" },
        body: [
          {
            en: "ACWR and monotony sit behind “Show S&C details” and never interrupt you unless you want them — open them when a board or a player asks for the number itself.",
            is: "ACWR og monotony liggja á bak við „Show S&C details“ og trufla þig ekki nema þú viljir þau — opnaðu þau þegar stjórn eða leikmaður biður um töluna sjálfa.",
          },
        ],
      },
      {
        heading: { en: "When to open it", is: "Hvenær á að opna hana" },
        body: [
          {
            en: "Not daily — open it when Today has flagged a load spike and you want to see who is spiking and by how much.",
            is: "Ekki daglega — opnaðu hana þegar Today hefur flaggað álagstopp og þú vilt sjá hver er að toppa og hversu mikið.",
          },
        ],
      },
    ],
  },

  quadrant: {
    title: { en: "How to use Quadrant Intelligence", is: "Hvernig á að nota Quadrant" },
    intro: {
      en: "The Quadrant plots external load (how much a player runs) against internal cost (how hard it feels to him). Players in the top right carry a lot of both — the zone to watch. Its job is to spot hidden fatigue before GPS moves. Works on both Pro and Lite.",
      is: "Quadrant ber ytra álag (hversu mikið leikmaðurinn hleypur) saman við innra álag (hversu erfitt honum finnst það). Leikmenn efst til hægri bera mikið af hvoru tveggja — svæðið sem vert er að fylgjast með. Hlutverk hennar er að sjá falda þreytu áður en GPS breytist. Virkar á bæði Pro og Lite.",
    },
    videoEmbedUrl: QUADRANT_VIDEO,
    sections: [
      {
        heading: { en: "How to read it", is: "Hvernig á að lesa hana" },
        body: [
          {
            en: "The top-left box, “Decoupled”, is the most telling: the player isn't running more than usual but it feels much harder — an early fatigue signal.",
            is: "Reiturinn efst til vinstri, „Decoupled“, er sá áhugaverðasti: leikmaðurinn hleypur ekki meira en venjulega en finnst það mun erfiðara — snemmbúið þreytumerki.",
          },
          {
            en: "The dividing lines sit at the squad median, so a player's position is always relative to the day — not a fixed threshold.",
            is: "Línurnar liggja um miðgildi hópsins, svo staðsetning leikmanns er alltaf afstæð við daginn — ekki fastur þröskuldur.",
          },
        ],
      },
      {
        heading: { en: "When to open it", is: "Hvenær á að opna hana" },
        body: [
          {
            en: "Open it when the numbers look normal but someone “feels” tired — the decoupled box often shows before any GPS number departs from normal.",
            is: "Opnaðu hana þegar tölurnar líta eðlilega út en einhver „finnst“ þreyttur — decoupled-reiturinn sést oft áður en nokkur GPS-tala víkur frá venju.",
          },
          {
            en: "The research behind it: Gabbett (2017) — external versus internal load.",
            is: "Rannsóknin á bak við hana: Gabbett (2017) — ytra á móti innra álagi.",
          },
        ],
      },
    ],
  },

  "indoor-load": {
    title: { en: "How to use Indoor Load Intelligence", is: "Hvernig á að nota Indoor Load" },
    intro: {
      en: "This page exists for one reason: GPS does not work indoors. Rather than show zero, MicroPulse deliberately discards the GPS signals and computes load from the inertial sensors alone (IMU) — Football Movement Profile stride bands, player load and deceleration. It auto-detects indoor sessions and compares each to the player's own indoor baseline (100 = his average). An indoor score is deliberately not comparable to an outdoor one — and the page says so plainly. For an Icelandic club, where much of the year is played indoors, this is not an edge case but the core.",
      is: "Þessi síða er til af einni ástæðu: GPS virkar ekki innanhúss. Í stað þess að sýna núll hendir MicroPulse GPS-merkjunum viljandi og reiknar álagið úr hröðunarmælunum einum (IMU) — Football Movement Profile stride-böndum, player load og hemlun. Kerfið greinir sjálfkrafa innanhússæfingar og ber hverja saman við eigin innanhúss-grunnlínu leikmannsins (100 = hans meðaltal). Innanhússtala er viljandi ekki samanburðarhæf við útitölu — og síðan segir það hreint út. Fyrir íslenskt félag, þar sem stór hluti ársins fer fram inni, er þetta ekki jaðartilfelli heldur kjarninn.",
    },
    videoEmbedUrl: INDOOR_LOAD_VIDEO,
    sections: [
      {
        heading: { en: "Read the page in 30 seconds", is: "Lestu síðuna á 30 sekúndum" },
        body: [
          {
            en: "Start with Team Today for the split. Scan Top Concerns: who needs rest, who is in return-to-play? The heatmap shows who has been in the red repeatedly. For one player, the composite score (100 = his average) gives the answer, and “Ready today?” says what to do. Always remember: 100 is HIS indoor usual — never compared to outdoor.",
            is: "Byrjaðu á Team Today fyrir skiptinguna. Renndu yfir Top Concerns: hver þarf hvíld, hver er í endurkomu? Hitakortið sýnir hverjir hafa verið á rauðu ítrekað. Fyrir einn leikmann gefur samsetta skorið (100 = hans meðaltal) svarið, og „Ready today?“ segir hvað á að gera. Mundu alltaf: 100 er HANS venja innanhúss — aldrei borið saman við úti.",
          },
        ],
      },
      {
        heading: { en: "Why indoor numbers look different", is: "Af hverju líta innanhússtölur öðruvísi út" },
        body: [
          {
            en: "Indoors, distance, high-speed running, sprints, top speed and metabolic power become unreliable (Brown 2016), so they are dropped. Load comes from IMU only: FMP stride bands, player load and deceleration. The score is compared to the player's own indoor baseline (100 = average), not to outdoor sessions or the squad. This is not a hidden detail — the honesty box sits at the top of the page. Requires Pro.",
            is: "Innanhúss verða vegalengd, háhraðahlaup, spretti, hámarkshraði og metabolic power óáreiðanleg (Brown 2016), svo þeim er sleppt. Álagið kemur eingöngu úr IMU: FMP stride-bönd, player load og hemlun. Skorið er borið saman við eigin innanhúss-grunnlínu leikmannsins (100 = meðaltal), ekki við útiæfingar eða hópinn. Þetta er ekki falið smáatriði — heiðarleikareiturinn stendur efst á síðunni. Krefst Pro.",
          },
        ],
      },
      {
        heading: { en: "Team Today + Top Concerns", is: "Team Today + Top Concerns" },
        body: [
          {
            en: "Team Today is one line splitting the squad into ready, lighter session, rest, and injury/return-to-play — the day's five-second read for a hall session. Top Concerns lists who needs attention, each with a status (e.g. “Hamstring — rehab”, “Head/Neck — RTP stage 4/5”, or “trained much harder than usual + decel:intensity imbalance”) and an action badge: Rehab, Return-to-play or Rest. Injury and RTP status is woven straight into the load view.",
            is: "Team Today er ein lína sem skiptir hópnum í klár, léttari æfingu, hvíld og meiðsli/endurkomu — fimm sekúndna lestur dagsins fyrir hallaræfingu. Top Concerns listar þá sem þurfa athygli, hvern með stöðu (t.d. „Hamstring — rehab“, „Head/Neck — RTP stage 4/5“, eða „trained much harder than usual + decel:intensity imbalance“) og aðgerðamerki: Rehab, Return-to-play eða Rest. Meiðsla- og endurkomustaða er fléttuð beint inn í álagssýnina.",
          },
        ],
      },
      {
        heading: { en: "Summary tiles + heatmap", is: "Samantektarflísar + hitakort" },
        body: [
          {
            en: "Five tiles count across the squad: players with data, heavy/spike, typical, light, and indoor sessions in the last 7 days. The 14-day heatmap is a grid of players × days — each cell one session, coloured by composite score (grey Light, blue Below, green Typical, amber Heavy, red Spike), with an inner red border marking an indoor session. In a second you see who has been in the red repeatedly.",
            is: "Fimm flísar telja yfir hópinn: leikmenn með gögn, þung/topp, dæmigerð, létt, og innanhússæfingar síðustu 7 daga. 14-daga hitakortið er rist af leikmönnum × dögum — hver reitur ein æfing, lituð eftir samsettu skori (grátt Light, blátt Below, grænt Typical, gult Heavy, rautt Spike), með rauðri innri línu sem merkir innanhússæfingu. Á sekúndu sérðu hverjir hafa verið á rauðu ítrekað.",
          },
        ],
      },
      {
        heading: { en: "The per-player list + “Ready today?”", is: "Leikmannalistinn + „Ready today?“" },
        body: [
          {
            en: "Each player row: an action badge (Rehab/RTP/Rest), the share of indoor sessions over 28 days, the composite score (100 = his average), ACWR (acute ÷ chronic) and density (d/min), with an injury line showing type, RTP stage and estimated return date. “Ready today?” turns that into an action: a one-word verdict (Rest / lighter / ready), the reason in plain language (“trained much harder than usual yesterday + ACWR 1.32 outside familiar range”), and coach guidance (“No high-intensity work — focus on mobility, recovery, light technical work”). Verdict → why → what to do.",
            is: "Hver leikmannaröð: aðgerðamerki (Rehab/RTP/Rest), hlutfall innanhússæfinga af 28 dögum, samsett skor (100 = hans meðaltal), ACWR (bráða ÷ langtíma) og þéttleiki (d/min), með meiðslalínu sem sýnir tegund, RTP-stig og áætlaðan endurkomudag. „Ready today?“ breytir því í aðgerð: niðurstaða í einu orði (Rest / lighter / ready), ástæðan á mannamáli („trained much harder than usual yesterday + ACWR 1.32 outside familiar range“), og þjálfaraleiðsögn („No high-intensity work — focus on mobility, recovery, light technical work“). Niðurstaða → af hverju → hvað á að gera.",
          },
        ],
      },
      {
        heading: { en: "Composite score + FMP distribution", is: "Samsett skor + FMP dreifing" },
        body: [
          {
            en: "The composite indoor score sets 100 as his own 28-day indoor average — so 143 is 43% above his usual (a spike), never compared to outdoor or the squad. A 14-day trend chart shows indoor vs outdoor, and three columns sit below: the latest session, the personal baseline (28d) and the last 7 days — Player Load, duration, Dynamic High%, HMLD and IMA side by side.",
            is: "Samsetta innanhússskorið setur 100 sem hans eigin 28 daga innanhússmeðaltal — svo 143 er 43% yfir hans venju (topp), aldrei borið saman við úti eða hópinn. 14-daga þróunarlínurit sýnir innanhúss á móti úti, og þrír dálkar sitja neðar: nýjasta æfingin, persónuleg grunnlína (28d) og síðustu 7 dagar — Player Load, tímalengd, Dynamic High%, HMLD og IMA hlið við hlið.",
          },
          {
            en: "The FMP movement distribution shows the shape of the session across six tiers (Very Low → Dynamic High). Lots in the low tiers = calm technical work; more in Dynamic High = an intense session. This Football Movement Profile is the heart of the indoor score.",
            is: "FMP hreyfidreifingin sýnir lögun æfingarinnar í sex þrepum (Very Low → Dynamic High). Mikið í lágum þrepum = róleg tæknivinna; meira í Dynamic High = snörp æfing. Þessi Football Movement Profile er hjartað í innanhússkorinu.",
          },
        ],
      },
    ],
  },

  "decel-intelligence": {
    title: { en: "How to use Decel Intelligence", is: "Hvernig á að nota Decel Intelligence" },
    intro: {
      en: "This page is really two engines under one roof. The top — Stride Intelligence (IMA Free Running) — is a biomechanical view of the run: cadence, stride length, asymmetry and sprint exposure. The lower half — Decel Intelligence proper (McBurnie 2022) — scores the cost of braking and cutting, which predicts knee and quad load better than running distance. Player Load ACWR sits between them.",
      is: "Þessi síða er í raun tvær vélar undir sama þaki. Efri hlutinn — Stride Intelligence (IMA Free Running) — er líffræðileg sýn á hlaupið: skreftíðni, skreflengd, ósamhverfa og sprettálag. Neðri hlutinn — Decel Intelligence sjálf (McBurnie 2022) — metur kostnaðinn við að hemla og snúa, sem spáir betur fyrir um álag á hné og framanlæri en hlaupavegalengd. Player Load ACWR situr á milli þeirra.",
    },
    videoEmbedUrl: DECEL_VIDEO,
    sections: [
      {
        heading: { en: "Read the page in 30 seconds", is: "Lestu síðuna á 30 sekúndum" },
        body: [
          {
            en: "Start with Decel:Sprint coupling (STEN) — McBurnie's primary metric. Above 3.5? You're fine. Then Underload: is anyone under 50% of match demand? They're under-prepared for match braking. Finally the high-intensity CoD asymmetry: is it over 15%? Only then is it worth a look. Everything else on the page is context behind those three questions.",
            is: "Byrjaðu á Decel:Sprint coupling (STEN) — aðalmælikvarða McBurnie. Yfir 3,5? Þá ertu í lagi. Kíktu svo á Underload: er einhver undir 50% af leikkröfu? Þeir eru vanbúnir fyrir hemlanir leiks. Loks á há-ákefðar CoD-ósamhverfuna: er hún yfir 15%? Aðeins þá er hún þess virði að skoða. Allt annað á síðunni er samhengi á bak við þessar þrjár spurningar.",
          },
        ],
      },
      {
        heading: { en: "Stride Intelligence — the four baseline cards", is: "Stride Intelligence — grunnlínukortin fjögur" },
        body: [
          {
            en: "With no session today, these compare the player to himself over a 28-day personal baseline and refresh as soon as the next training uploads: Cadence (how fast the feet turn over — a drop is often the first fatigue sign), Stride length in high-speed running (shorter strides at the same speed load the calf and hamstring), L/R asymmetry (a baseline card — a high number alone is not an alarm), and GPS-IMA decoupling (when he runs similar distances but the legs do more — hidden fatigue).",
            is: "Þegar engin æfing er í dag bera þessi kort leikmanninn saman við sjálfan sig á 28-daga persónulegri grunnlínu og uppfærast um leið og næsta æfing er hlaðin inn: Skreftíðni (hversu ört fæturnir stíga — lækkun er oft fyrsta þreytumerki), Skreflengd í háhraðahlaupi (styttri skref á sama hraða auka álag á kálfa og aftanlæri), L/R ósamhverfa (grunnlínukort — há tala ein og sér er ekki viðvörun) og GPS-IMA aftenging (þegar hann hleypur svipað en fæturnir vinna meira — falin þreyta).",
          },
        ],
      },
      {
        heading: { en: "Change-of-direction asymmetry (Bishop 2020)", is: "Stefnubreytinga-ósamhverfa (Bishop 2020)" },
        body: [
          {
            en: "Split into three intensity tiers, because asymmetry in hard actions matters more than in easy ones. Only the high-intensity tier is genuinely injury-relevant (thresholds: 9% watch · 15% concern · 18% high). Medium-intensity asymmetry is often just a positional habit; low-intensity is rarely interesting. The card states its own limit: >15% is a commonly-flagged imbalance but a risk factor, not a validated predictor — the evidence is mainly single-leg-jump, not running.",
            is: "Skipt í þrjú ákefðarþrep, því ósamhverfa í hörðum hreyfingum skiptir meira máli en í rólegum. Aðeins há-ákefðar þrepið er raunverulega meiðslatengt (þröskuldar: 9% fylgjast með · 15% áhyggjur · 18% hátt). Meðalákefðar ósamhverfa er oft bara stöðuvenja; lág-ákefðar er sjaldnast áhugaverð. Kortið segir sín eigin mörk: >15% er algengt flögg en áhættuþáttur, ekki staðfestur forspárþáttur — gögnin eru aðallega um einfættstökk, ekki hlaup.",
          },
        ],
      },
      {
        heading: { en: "Sprint exposure & Player Load ACWR", is: "Sprettálag & Player Load ACWR" },
        body: [
          {
            en: "Sprint exposure compares the week's sprint strides (IMA bands 5–8) to match-day average — roughly 100% means the week is on par with match demand. Malone 2017: low sprint exposure leaves a player under-prepared, moderate is protective, and the strongest signal is a rapid rise, not the height itself. Player Load ACWR is acute (7-day) over chronic (28-day) load; 0.8–1.3 is steady, over 1.5 is a spike. The card labels it itself: a reference, not a predictor (contested since Impellizzeri 2020).",
            is: "Sprettálag ber sprettskref vikunnar (IMA bönd 5–8) saman við leikdagsmeðaltal — um 100% þýðir að vikan er á pari við leikkröfu. Malone 2017: lágt sprettálag skilur leikmann eftir vanbúinn, hóflegt er verndandi, og sterkasta merkið er hröð aukning, ekki hæðin sjálf. Player Load ACWR er bráðaálag (7 daga) deilt með langtímaálagi (28 daga); 0,8–1,3 er stöðugt, yfir 1,5 er toppur. Kortið merkir það sjálft: viðmið, ekki forspá (umdeilt frá Impellizzeri 2020).",
          },
        ],
      },
      {
        heading: { en: "The six decel dimensions (McBurnie 2022)", is: "Decel-víddirnar sex (McBurnie 2022)" },
        body: [
          {
            en: "Each has its own threshold, shown on screen. Overload — 28-day braking count vs baseline (red if over 1.5× expected). Underload — 7-day braking vs match demand (red under 50%: under-prepared). Decel:Accel coupling — braking-to-accelerating balance (healthy 0.8–1.2). Decel:Sprint coupling — the primary risk metric, braking vs sprint strides on a 1–10 STEN scale (red ≤ 2.5, watch ≤ 3.5). Exposure concentration — share of load on the single heaviest day (red over 30%). Sharp cut load — 7- vs 28-day count of sharp 70–90° cuts, which produce the highest knee load (Dos'Santos 2021).",
            is: "Hver hefur sinn eigin þröskuld, sýnilegan á skjánum. Overload — 28-daga hemlunarfjöldi á móti grunnlínu (rautt ef yfir 1,5× vænt). Underload — 7-daga hemlun á móti leikkröfu (rautt undir 50%: vanbúinn). Decel:Accel coupling — jafnvægi hemlunar og hröðunar (heilbrigt 0,8–1,2). Decel:Sprint coupling — aðal-áhættumælikvarðinn, hemlun á móti sprettskrefum á 1–10 STEN kvarða (rautt ≤ 2,5, fylgjast með ≤ 3,5). Exposure concentration — hlutfall álags á þyngsta einstaka daginn (rautt yfir 30%). Sharp cut load — 7- á móti 28-daga fjölda snarpra 70–90° skurða, sem framleiða hæsta hnéálagið (Dos'Santos 2021).",
          },
        ],
      },
      {
        heading: { en: "The per-player rows", is: "Leikmannaraðirnar" },
        body: [
          {
            en: "At the bottom each player gets one row: a plain-language sentence (e.g. “recent braking < 50% of match demand — under-prepared”) and seven chips. The first six map straight to the dimensions above; the seventh, MPE Recovery, is the action — a button to assign recovery when a player is flagged. Green = fine, amber = watch, red = flagged.",
            is: "Neðst fær hver leikmaður eina röð: setningu á mannamáli (t.d. „nýleg hemlun < 50% af leikkröfu — vanbúinn“) og sjö merki. Fyrstu sex svara beint til víddanna að ofan; sjöunda, MPE Recovery, er aðgerðin — hnappur til að úthluta endurheimt þegar leikmaður er flaggaður. Grænt = í lagi, gult = fylgjast með, rautt = flaggað.",
          },
          {
            en: "Remember the honesty the page shows itself: ACWR is a “reference, not a predictor” and asymmetry is a “risk factor, not a validated predictor.” These numbers tell you where to look — they do not make the decision for you.",
            is: "Mundu heiðarleikann sem síðan sýnir sjálf: ACWR er „viðmið, ekki forspá“ og ósamhverfa er „áhættuþáttur, ekki staðfestur forspárþáttur“. Þessar tölur segja þér hvar á að horfa — þær taka ekki ákvörðunina fyrir þig.",
          },
        ],
      },
    ],
  },
  "ima-intelligence": {
    title: { en: "How to use IMA Intelligence", is: "Hvernig á að nota IMA Intelligence" },
    intro: {
      en: "IMA stands for inertial movement — accelerations, decelerations and changes of direction measured by the Catapult pod itself, independent of GPS, so it works indoors. Where the Load page asks “how much?”, this page asks “how did he move?” — a biomechanical view of a training day, everything compared to the player himself.",
      is: "IMA stendur fyrir inertial movement — hröðun, hemlun og stefnubreytingar mældar af Catapult-einingunni sjálfri, óháð GPS, svo þetta virkar innanhúss. Þar sem álag-síðan spyr „hversu mikið?“ spyr þessi síða „hvernig hreyfði hann sig?“ — líffræðileg sýn á æfingadag, allt borið saman við leikmanninn sjálfan.",
    },
    videoEmbedUrl: IMA_VIDEO,
    sections: [
      {
        heading: { en: "Read the page in 30 seconds", is: "Lestu síðuna á 30 sekúndum" },
        body: [
          {
            en: "Start with the weekly dial — are we above or below target, and where will the week land? Scan the movement verdict: who moved above their own usual? Session Shape tells you instantly whether the day was light or intense. Check high-CoD asymmetry (over 15% is worth a look) and finally stride length: is anyone pushing less? That's the hidden fatigue.",
            is: "Byrjaðu á vikumælinum — erum við yfir eða undir markmiði, og hvar endar vikan? Renndu yfir hreyfi-niðurstöðuna: hver hreyfði sig umfram sína venju? Session Shape segir strax hvort dagurinn var léttur eða snarpur. Athugaðu há-CoD ósamhverfu (yfir 15% = vert að skoða) og loks skreflengd: er einhver farinn að ýta minna? Það er falda þreytan.",
          },
        ],
      },
      {
        heading: { en: "Weekly IMA Load — the projection dial", is: "Weekly IMA Load — prójekt-mælirinn" },
        body: [
          {
            en: "The week's cumulative IMA load versus a typical week (from 8 historical weeks). The dial shows where the squad is now (Current), what's typical, and where the week will land if the current rate continues (Projected). “Day 4 of 7” tells you where in the week you are — it's a course-correction dial, visible mid-week while you can still change the plan.",
            is: "Uppsafnað IMA-álag vikunnar borið saman við dæmigerða viku (byggt á 8 sögulegum vikum). Mælirinn sýnir hvar hópurinn stendur núna (Current), hvað er dæmigert (Typical) og hvar vikan endar ef haldið er áfram á sama hraða (Projected). „Day 4 of 7“ segir hvar í vikunni þú ert — þetta er course-correction mælir, sést á miðvikudegi meðan enn má breyta.",
          },
          {
            en: "Eight sub-type cards break the week down by movement type: acceleration, deceleration, changes of direction (CoD) and strides in the top cadence bands (B6–B8). So you see not just WHETHER the week is heavy but WHY — whether it's braking or change-of-direction piling up.",
            is: "Átta undirtegundakort brjóta vikuna niður eftir hreyfitegund: hröðun, hemlun, stefnubreytingar (CoD) og skref í efstu tíðniböndunum (B6–B8). Þannig sérðu ekki bara HVORT vikan er þung heldur AF HVERJU — er það hemlun eða stefnubreytingar sem safnast upp.",
          },
        ],
      },
      {
        heading: { en: "Movement Intelligence — the verdict", is: "Movement Intelligence — niðurstaðan" },
        body: [
          {
            en: "One plain-language sentence naming the players who moved well above their own usual today — not a squad average (e.g. “4 players ran well above their own usual today”). Chips show “player · X% of usual”. Confidence states how many were compared to their own norm. It's a personal comparison and it works indoors.",
            is: "Ein setning á mannamáli sem nefnir þá leikmenn sem hreyfðu sig langt umfram sína eigin venju í dag — ekki hópmeðaltal (t.d. „4 players ran well above their own usual today“). Merkin sýna „leikmaður · X% af venju“. Öryggið segir hversu margir voru bornir saman við sína eigin norm. Þetta er persónulegur samanburður og virkar innanhúss.",
          },
        ],
      },
      {
        heading: { en: "Session Shape — the shape of the session", is: "Session Shape — lögun æfingarinnar" },
        body: [
          {
            en: "One word for the shape of the day (Recovery / short / full) plus four tiles: total strides, sprint-strides (B5–8) and their share, L/R CoD balance at high intensity, and how many are flagged on high-CoD asymmetry (e.g. 8/19). CoD splits into three intensity tiers — only “High (injury-relevant)” genuinely matters (Bishop 2020). The band distribution (Low b1–3 / Mid b4–6 / High b7–8) shows the shape: mostly low bands = recovery; more high = an intense session.",
            is: "Eitt orð um lögun dagsins (Recovery / short / full) auk fjögurra flísa: heildarskref, sprettskref (B5–8) og hlutfall þeirra, L/R CoD balance í háákefð, og fjöldi flaggaðra á há-CoD ósamhverfu (t.d. 8/19). CoD skiptist í þrjú ákefðarþrep — aðeins „High (injury-relevant)“ skiptir raunverulega máli (Bishop 2020). Bandadreifingin (Low b1–3 / Mid b4–6 / High b7–8) sýnir lögunina: mikið í lágum böndum = endurheimt; meira í háum = snörp æfing.",
          },
        ],
      },
      {
        heading: { en: "Free Running Distance & Stride Length", is: "Free Running Distance & Skreflengd" },
        body: [
          {
            en: "IMA Free Running Distance is high-speed running distance (m) split by cadence bands 5–8, with a total and ACWR (acute 7d ÷ chronic 28d). “Building” means load is accruing within safe bounds; a number like 0.52 shows a player well below his own norm (Gabbett).",
            is: "IMA Free Running Distance er háhraðahlaupsvegalengd (m) sundurliðuð eftir tíðniböndum 5–8, með heild og ACWR (bráða 7d ÷ langtíma 28d). „Building“ þýðir að álagið er að byggjast upp innan öruggra marka; tala eins og 0,52 sýnir leikmann langt undir sinni venju (Gabbett).",
          },
          {
            en: "Stride Length is the cleverest signal on the page. Under fatigue a player keeps his stride frequency but the stride shortens — he pushes less though the legs turn over as fast. Neither GPS distance nor cadence alone sees this; the ratio (high-cadence distance ÷ high-cadence strides) does. Compared to his own matches/big sessions and flagged if it deviates by more than 2.5 standard deviations — hidden fatigue that output numbers miss.",
            is: "Skreflengd er snjallasta merkið á síðunni. Undir þreytu heldur leikmaður skreftíðninni en skreflengdin styttist — hann ýtir minna þótt fæturnir stígi jafn ört. Hvorki GPS-vegalengd né skreftíðni ein sér sér þetta; hlutfallið (há-tíðni vegalengd ÷ há-tíðni skref) gerir það. Borið saman við hans eigin leiki/stórar æfingar og flaggað ef það víkur meira en 2,5 staðalfrávik — falin þreyta sem output-tölur missa af.",
          },
        ],
      },
      {
        heading: { en: "Per-player breakdown", is: "Leikmannataflan" },
        body: [
          {
            en: "One row per player: total strides, the split across band tiers (b1–3 / b4–6 / b7–8), sprint strides, the ratio to his own baseline (vs baseline %), and high-intensity CoD L/R with asymmetry-%. Each player expands to a full CoD breakdown (Low/Medium/High). The point of the whole page: “how” rather than “how much” — all compared to the player himself, and it works indoors where GPS does not.",
            is: "Ein röð á leikmann: heildarskref, skipting í bandaþrep (b1–3 / b4–6 / b7–8), sprettskref, hlutfall gagnvart sinni grunnlínu (vs baseline %), og há-ákefðar CoD L/R með ósamhverfu-%. Hægt að opna hvern leikmann til að sjá fulla CoD-sundurliðun (Low/Medium/High). Kjarni síðunnar: „hvernig“ frekar en „hversu mikið“ — allt borið saman við leikmanninn sjálfan, og virkar innanhúss þar sem GPS gerir það ekki.",
          },
        ],
      },
    ],
  },
  "match-movement": {
    title: { en: "How to use Match Movement", is: "Hvernig á að nota Match Movement" },
    intro: {
      en: "Where the IMA page shows one training day, this page compares how a single player moved across matches — his movement signature, game to game. It is descriptive and tactical — did his role change? — not injury prediction. IMA-driven on Pro, GPS movement on Lite.",
      is: "Þar sem IMA-síðan sýnir einn æfingadag ber þessi síða saman hvernig einn leikmaður hreyfði sig milli leikja — hreyfi-undirskrift hans, leik fyrir leik. Þetta er lýsandi og taktískt — breyttist hlutverk hans? — ekki meiðslaspá. IMA-drifið á Pro, GPS-hreyfing á Lite.",
    },
    videoEmbedUrl: MATCH_MOVEMENT_VIDEO,
    sections: [
      {
        heading: { en: "Read the page in 30 seconds", is: "Lestu síðuna á 30 sekúndum" },
        body: [
          {
            en: "Read the verdict sentence: did he move differently, and how? Check Accel:Decel — was he driving (>1) or reactive (<1)? The radar shape shows the whole signature at a glance. The AI paragraph gives the tactical story in plain language. And remember: this is descriptive — it tells you how the match demanded of him, not whether he is at injury risk.",
            is: "Lestu niðurstöðusetninguna: hreyfði hann sig öðruvísi, og hvernig? Kíktu á Accel:Decel — var hann drífandi (>1) eða viðbragðssamur (<1)? Radar-formið sýnir heildar-undirskriftina í einni mynd. AI-málsgreinin gefur taktísku söguna á mannamáli. Og mundu: þetta er lýsandi — það segir þér hvernig leikurinn krafðist hans, ekki hvort hann sé í meiðslahættu.",
          },
        ],
      },
      {
        heading: { en: "The comparison verdict", is: "Samanburðar-niðurstaðan" },
        body: [
          {
            en: "You pick a player, a match and a mode. One plain sentence says how he moved differently from usual (e.g. “moved differently — more high-cadence running, more braking-biased”), with the key percentage shifts. Below it, single lines: IMA load/min (+34%), CoD left% (+10 pts) and so on. Confidence is based on how many of his matches feed the comparison. The rules compute the numbers — not AI.",
            is: "Þú velur leikmann, leik og ham. Ein setning á mannamáli segir hvernig hann hreyfði sig öðruvísi en venjulega (t.d. „moved differently — more high-cadence running, more braking-biased“), með helstu prósentubreytingum. Undir henni koma stakar línur: IMA-álag/mín (+34%), CoD vinstri% (+10 stig) o.s.frv. Öryggið byggir á hversu margir af hans leikjum fæða samanburðinn. Reglur reikna tölurnar — ekki gervigreind.",
          },
        ],
      },
      {
        heading: { en: "AI explains — rules decide", is: "AI útskýrir — reglur ákveða" },
        body: [
          {
            en: "The clearest example of “rules decide, AI explains.” The AI writes a full paragraph interpreting the numbers — that the accel-to-braking ratio fell from 1.39 to 0.52, that left-turn bias rose from 47% to 57%, that sprint strides nearly doubled — and draws a tactical conclusion (a reactive, defence-heavy performance, not an injury concern). But it writes only from the re-computed Catapult numbers and invents nothing. It is labelled as AI.",
            is: "Skýrasta dæmið um „reglur ákveða, gervigreind útskýrir“. AI skrifar heila málsgrein sem túlkar tölurnar — að hröðunar-á-móti-hemlunar hlutfall hafi fallið úr 1,39 í 0,52, að vinstri-beygju hlutdeild hafi hækkað úr 47% í 57%, að sprettskref hafi nær tvöfaldast — og dregur taktíska ályktun (viðbragðssöm, varnarþung frammistaða, ekki meiðslaáhyggja). En hún skrifar eingöngu úr endurreiknuðu Catapult-tölunum og finnur ekkert upp. Hún er merkt sem gervigreind.",
          },
        ],
      },
      {
        heading: { en: "The five movement dimensions", is: "Hreyfivíddirnar fimm" },
        body: [
          {
            en: "Each is shown “this match vs his usual.” IMA load/min = total movement work per minute. Accel:Decel = the balance of speeding up vs slowing down: above 1 = more front-foot (driving), below 1 = more reactive (braking) — this is the key dimension. CoD/min = changes of direction per minute. CoD left% = share of left turns (positional bias). High-cadence strides/min = sprint-type running.",
            is: "Hver er sýnd „þessi leikur á móti venju hans“. IMA load/min = heildar hreyfivinna á mínútu. Accel:Decel = jafnvægi hröðunar og hemlunar: yfir 1 = meira á framfótinn (drífandi), undir 1 = meira viðbragð (hemlandi) — þetta er lykilvíddin. CoD/min = stefnubreytingar á mínútu. CoD left% = hlutdeild vinstri-beygja (stöðuhalli). High-cadence strides/min = sprett-tegund hlaups.",
          },
        ],
      },
      {
        heading: { en: "Movement shape (radar) + S&C breakdown", is: "Hreyfiform (radar) + S&C sundurliðun" },
        body: [
          {
            en: "The radar overlays “this match” (blue) on “his usual” (green) across the five axes, each normalised to the larger value — so the shape itself shows the difference at a glance: is the signature stretched toward sprinting, or toward braking? The by-dimension bars give the actual values.",
            is: "Radar-línuritið leggur „þennan leik“ (blátt) ofan á „venju hans“ (grænt) á fimm ásunum, hver normaliseraður að stærra gildinu — svo formið sjálft sýnir muninn í einni mynd: er undirskriftin teygð í átt að spretti, eða að hemlun? By-dimension súlurnar gefa raungildin.",
          },
          {
            en: "Because a summary can hide where the difference sits, the S&C breakdown shows raw counts by intensity: deceleration (Low/Medium/High), change of direction (Low/Medium/High), and high-cadence strides (bands 6, 7, 8). The red high-intensity rows are the demanding end — a descriptive read of mechanical demand (McBurnie 2022), not injury prediction.",
            is: "Þar sem samantekt getur falið hvar munurinn liggur sýnir S&C-sundurliðunin hráar tölur eftir ákefð: hemlun (Low/Medium/High), stefnubreytingar (Low/Medium/High) og háhraðaskref (bönd 6, 7, 8). Rauðu há-ákefðar línurnar eru krefjandi endinn — lýsandi mynd af vélrænni kröfu (McBurnie 2022), ekki meiðslaspá.",
          },
        ],
      },
      {
        heading: { en: "Three comparison modes", is: "Þrír samanburðarhamir" },
        body: [
          {
            en: "Same signature, three references (top right). vs norm: this match against his own average — did he change from himself? Match A/B: two specific matches side by side — what differed between them? Squad: him against the team — does he move differently from teammates in the same role? The point of the page: a player's movement signature, game to game, to see when role or tactics change how he moves.",
            is: "Sama undirskrift, þrjú viðmið (efst í hægra horni). vs norm: þessi leikur á móti hans eigin meðaltali — breyttist hann frá sjálfum sér? Match A/B: tveir tilteknir leikir hlið við hlið — hvað var öðruvísi milli þeirra? Squad: hann á móti hópnum — hreyfir hann sig öðruvísi en liðsfélagar í sömu stöðu? Kjarni síðunnar: hreyfi-undirskrift leikmanns, leik fyrir leik, til að sjá þegar hlutverk eða taktík breytir því hvernig hann hreyfir sig.",
          },
        ],
      },
    ],
  },
  "position-comparison": {
    title: { en: "How to use Position Comparison", is: "Hvernig á að nota Stöðu-samanburð" },
    intro: {
      en: "This page steps up from the individual to the role. It asks: how does each position play at THIS club, and how does a player compare to others in the same position? Everything is per-90 (GPS + IMA), each position gets a “Movement DNA” — the style it plays — and auto-assigned style tags. The rules decide the style; the AI only explains it.",
      is: "Þessi síða stígur upp úr einstaklingnum í hlutverkið. Hún spyr: hvernig spilar hver staða hjá ÞESSU félagi, og hvernig ber leikmaður sig saman við aðra í sömu stöðu? Allt er á 90 mínútur (GPS + IMA), hver staða fær sitt „Movement DNA“ — stílinn sem hún spilar — og sjálfvirk stíl-merki. Reglurnar ákveða stílinn; gervigreindin útskýrir hann bara.",
    },
    videoEmbedUrl: POSITION_COMPARISON_VIDEO,
    sections: [
      {
        heading: { en: "Read the page in 30 seconds", is: "Lestu síðuna á 30 sekúndum" },
        body: [
          {
            en: "Read the verdict sentence for the headline. Look at each position's Movement DNA — the largest slice is the style. The style tags give that style a name. The radar cards show the shape, and the standout marker shows who differs within a position. Remember: these are positions versus the squad, and the styles are rule-assigned — the AI only explains them.",
            is: "Lestu niðurstöðusetninguna fyrir fyrirsögnina. Skoðaðu Movement DNA hverrar stöðu — stærsta sneiðin er stíllinn. Stíl-merkin gefa nafnið á stílnum. Radar-kortin sýna formið, og sker-sig-úr merkið sýnir hverjir skera sig úr innan stöðunnar. Mundu: þetta eru stöður á móti hópnum, og stílarnir eru úthlutaðir af reglum — gervigreindin útskýrir þá bara.",
          },
        ],
      },
      {
        heading: { en: "The verdict + compare by metric", is: "Niðurstaðan + samanburður eftir mælikvarða" },
        body: [
          {
            en: "One sentence names which position leads on what — e.g. that attack and wide cover the most sprint distance while central mids change direction the most. Confidence shows how many positions and match-appearances are behind it.",
            is: "Ein setning nefnir hvaða staða leiðir í hverju — t.d. að sóknar-/kantstöður hlaupi mestan sprettvegalengd og miðjumenn breyti oftast um stefnu. Confidence sýnir hversu margar stöður og leik-viðverur liggja að baki.",
          },
          {
            en: "You pick a metric (Distance/90, HSR/90, Sprint distance/90, Top speed, Accelerations/90, Decelerations/90, Change of direction/90, Jumps/90, Player Load/90, Work rate) and each position gets a bar — a per-match average per 90. The dashed line is the squad average, so you see at once which position is above or below.",
            is: "Þú velur mælikvarða (Distance/90, HSR/90, Sprint distance/90, Top speed, Accelerations/90, Decelerations/90, Change of direction/90, Jumps/90, Player Load/90, Work rate) og hver staða fær súlu — leikjameðaltal á 90. Punktalínan er hópmeðaltalið, svo þú sérð strax hvaða staða er yfir eða undir.",
          },
        ],
      },
      {
        heading: { en: "Movement DNA — the position's signature", is: "Movement DNA — undirskrift stöðunnar" },
        body: [
          {
            en: "Each position's style is shown as relative emphasis across four axes — Speed, Agility, Engine and Aerial — computed from squad percentiles. The largest slice is the position's playing style: a centre back might be aerial-heavy, a central mid agility-heavy, a forward engine/speed-heavy.",
            is: "Stíll hverrar stöðu er sýndur sem hlutfallsleg áhersla á fjóra ása — Speed (hraði), Agility (lipurð), Engine (vél/úthald) og Aerial (loftbolti) — reiknað úr hundraðshlutum hópsins. Stærsta sneiðin er spilastíll stöðunnar: miðvörður gæti verið aerial-þungur, miðjumaður agility-þungur, sóknarmaður engine/speed-þungur.",
          },
        ],
      },
      {
        heading: { en: "Style tags — rules decide, AI explains", is: "Stíl-merkin — reglur ákveða, AI útskýrir" },
        body: [
          {
            en: "Each position gets one or more tags describing its style — “Aerial presence”, “High agility / repeat-effort”, “Engine / box-to-box”, “Speed / vertical threat” — assigned by rules from a z-score versus the other positions. “Driven by” names the metrics that produced the tag. An AI “Squad Style Overview” can then explain the whole in prose, but the rules assign the style, not the AI.",
            is: "Hver staða fær eitt eða fleiri merki sem lýsa spilastíl — „Aerial presence“, „High agility / repeat-effort“, „Engine / box-to-box“, „Speed / vertical threat“ — úthlutað af reglum út frá z-skori á móti öðrum stöðum. „Driven by“ nefnir mælikvarðana sem ollu merkinu. AI „Squad Style Overview“ getur svo útskýrt heildina í máli, en reglurnar úthluta stílnum, ekki gervigreindin.",
          },
        ],
      },
      {
        heading: { en: "Per-position radar cards", is: "Radar-kort á stöðu" },
        body: [
          {
            en: "Each position gets a card with the number of players and matches, the style tags, the “Driven by” metrics, and a radar (Dist, HSR, Sprint, Speed, Acc, Dec, CoD) against the squad median. The shape shows the position's signature. “Show players” expands to the individuals, with a marker on any player who stands out within the position.",
            is: "Hver staða fær kort með fjölda leikmanna og leikja, stíl-merkjunum, „Driven by“-mælikvörðunum, og radar (Dist, HSR, Sprint, Speed, Acc, Dec, CoD) borinn saman við miðgildi hópsins. Formið sýnir undirskrift stöðunnar. „Show players“ opnar einstaklingana, með merki á hverjum þeim leikmanni sem sker sig úr innan stöðunnar.",
          },
        ],
      },
      {
        heading: { en: "What it's for", is: "Til hvers hún er" },
        body: [
          {
            en: "Three uses: understanding each role's demands (what does a central mid actually have to do here?), judging whether a new signing fits the position's profile (recruitment), and defining the team's tactical identity. Because everything is per-90 and squad-relative, the comparison is fair. The point: the position's fingerprint, not the individual's.",
            is: "Þrjú not: að skilja kröfur hverrar stöðu (hvað þarf miðjumaður í raun að gera hjá okkur?), að meta hvort nýr leikmaður passi í prófíl stöðunnar (nýliðun), og að skilgreina taktíska sjálfsmynd liðsins. Af því allt er per-90 og afstætt við hópinn er samanburðurinn sanngjarn. Kjarninn: undirskrift stöðunnar, ekki einstaklingsins.",
          },
        ],
      },
    ],
  },
  "post-match-recovery": {
    title: { en: "How to use Post-match Recovery", is: "Hvernig á að nota Endurheimt eftir leik" },
    intro: {
      en: "After a match this page answers one question: who has bounced back, and who is still carrying it? The bottom line — feel recovers before the body does. Don't trust a green dot alone if the jump is still down; the gap between the two is the recovery you can't feel.",
      is: "Eftir leik svarar þessi síða einni spurningu: hver er kominn til baka, og hver ber leikinn enn? Kjarninn — líðanin jafnar sig á undan líkamanum. Ekki treysta grænum punkti einum ef stökkið er enn niðri; bilið þar á milli er endurheimtin sem þú finnur ekki.",
    },
    videoEmbedUrl: POST_MATCH_RECOVERY_VIDEO,
    sections: [
      {
        heading: { en: "Read it in 30 seconds", is: "Lestu hana á 30 sekúndum" },
        body: [
          {
            en: "First, the verdict — how many rebounded by MD+2. Second, the recovery curve — is the green growing day by day? Third, the dot versus the jump — a green feel with a down jump means still fatigued. And a heavy echo (high load plus still flagged) is the real one to act on.",
            is: "Fyrst niðurstaðan — hversu margir voru komnir til baka á MD+2. Svo endurheimtarkúrfan — er græna að vaxa dag frá degi? Loks punkturinn á móti stökkinu — græn líðan með lækkuðu stökki þýðir enn þreyttur. Og „heavy echo“ (mikið álag + enn flaggaður) er sá sem raunverulega þarf að bregðast við.",
          },
        ],
      },
      {
        heading: { en: "The recovery timeline", is: "Endurheimtar-tímalínan" },
        body: [
          {
            en: "The whole page rests on a known timeline: fatigue peaks the day after a match (MD+1) and should clear within two to three days (Nédélec 2012). So the page tracks each player across MD+1, MD+2 and MD+3 and asks: has he cleared on schedule, or is he still carrying it?",
            is: "Öll síðan hvílir á þekktri tímalínu: þreytan nær hámarki daginn eftir leik (MD+1) og á að hverfa innan tveggja til þriggja daga (Nédélec 2012). Síðan fylgir því hverjum leikmanni yfir MD+1, MD+2 og MD+3 og spyr: hreinsaðist hann á áætlun, eða ber hann leikinn enn?",
          },
        ],
      },
      {
        heading: { en: "Two reads, side by side — and the gap between them", is: "Tveir lestrar hlið við hlið — og bilið á milli" },
        body: [
          {
            en: "For every player, every day, there are two reads. The coloured dot is subjective — how he feels, from sleep, soreness and energy, versus his own norm. The percentage below it is objective — a countermovement jump (CMJ) test versus his baseline, the neuromuscular truth. Feel above, jump below.",
            is: "Fyrir hvern leikmann, hvern dag, eru tveir lestrar. Litaði punkturinn er huglægur — hvernig honum líður, út frá svefni, hörku og orku, borið saman við hans eigin venju. Prósentan fyrir neðan er hlutlæg — CMJ-stökkpróf á móti hans grunnlínu, taugavöðva-sannleikurinn. Líðan að ofan, stökk að neðan.",
          },
          {
            en: "Both are shown because a player can self-report green yet have a depressed jump — subjective feel recovers before the neuromuscular system does. When the dot says fine but the jump is still down, believe the jump: that gap is a player who thinks he's ready but isn't, and on Gathercole 2015 it is the single most useful signal on the page.",
            is: "Báðir eru sýndir því leikmaður getur skráð sig grænan en samt verið með lækkað stökk — huglæg líðan jafnar sig á undan taugavöðvakerfinu. Þegar punkturinn segir í lagi en stökkið er enn niðri, trúðu stökkinu: það bil er leikmaður sem heldur að hann sé klár en er það ekki, og samkvæmt Gathercole 2015 er það gagnlegasta merkið á síðunni.",
          },
        ],
      },
      {
        heading: { en: "The squad recovery curve", is: "Endurheimtarkúrfa hópsins" },
        body: [
          {
            en: "Three stacked bars, one per day, each split into red, yellow and green by the readiness verdict — you watch the green grow across the days. Six red on MD+1 becoming eleven green by MD+3 is a healthy rebound. If red lingers at MD+3, recovery is stalling and you have players to look at.",
            is: "Þrjár stöplasúlur, ein á dag, hver skipt í rautt, gult og grænt eftir niðurstöðunni — þú horfir á græna vaxa yfir dagana. Sex rauðir á MD+1 sem verða ellefu grænir á MD+3 er heilbrigð endurkoma. Ef rautt situr eftir á MD+3 er endurheimtin að stöðvast og þú átt leikmenn til að skoða.",
          },
        ],
      },
      {
        heading: { en: "Heavy echo vs likely not post-match", is: "Heavy echo á móti „líklega ekki eftir leik“" },
        body: [
          {
            en: "The page tells real match fatigue apart from noise. A heavy echo is high mechanical match load — decel-weighted, because high-intensity decelerations best predict muscle damage (McBurnie 2022) — plus still flagged at MD+2. That's genuine lingering fatigue: ease his plan or extend recovery. Contrast “likely not post-match”: flagged, but with low load or few minutes, so it probably isn't from the game — look elsewhere.",
            is: "Síðan greinir raunverulega leikþreytu frá suði. „Heavy echo“ er mikið vélrænt leikálag — vegið eftir hemlun, því háákefðar hemlanir spá best fyrir um vöðvaskemmdir (McBurnie 2022) — auk þess að vera enn flaggaður á MD+2. Það er raunveruleg viðvarandi þreyta: léttu planið hans eða lengdu endurheimtina. Berðu það saman við „líklega ekki eftir leik“: flaggaður, en með lágt álag eða fáar mínútur, svo það kemur líklega ekki úr leiknum — leitaðu annars staðar.",
          },
        ],
      },
      {
        heading: { en: "Recovery watch — when to escalate", is: "Recovery watch — hvenær á að stigmagna" },
        body: [
          {
            en: "Players still below their own baseline three days after the match get escalated — and the system doesn't just flag them. It names the driver (which subjective axis is dragging, energy or sleep, with the readiness-z) and gives an action: modify training and/or refer to physio, because they are past the expected echo. It's directional — the direction beside the colour, not the colour itself.",
            is: "Leikmenn sem eru enn undir sinni eigin grunnlínu þremur dögum eftir leik eru stigmagnaðir — og kerfið flaggar þá ekki bara. Það nefnir drifkraftinn (hvaða huglægi ás dregur niður, orka eða svefn, með readiness-z) og gefur aðgerð: breyta æfingu og/eða vísa til sjúkraþjálfara, því þeir eru komnir fram yfir væntanlegt bergmál. Þetta er stefnubundið — stefnan við hliðina á litnum, ekki liturinn sjálfur.",
          },
        ],
      },
    ],
  },
  "train-like-you-play": {
    title: { en: "How to use Train like you Play", is: "Hvernig á að nota Train like you Play" },
    intro: {
      en: "This page compares each role's training to what its matches actually demand. The principle (Gabbett 2016): train at the intensities the game asks, or the body isn't prepared. Crucially it flags under-exposure — not overload. Because movement events pile up in drills, training naturally runs above match intensity, so a high % is expected and fine; the risk is a low one.",
      is: "Þessi síða ber saman æfingar hverrar stöðu við það sem leikir hennar krefjast í raun. Grunnreglan (Gabbett 2016): æfðu á þeim ákefðum sem leikurinn kallar á, annars er líkaminn ekki undirbúinn. Lykilatriði: hún flaggar undir-áreiti — ekki ofálag. Því hreyfiatburðir hlaðast upp í æfingum keyrir æfingaálag eðlilega yfir leikákefð, svo há prósenta er væntanleg og í lagi; áhættan er lág prósenta.",
    },
    videoEmbedUrl: TRAIN_LIKE_YOU_PLAY_VIDEO,
    sections: [
      {
        heading: { en: "Read the page in 30 seconds", is: "Lestu síðuna á 30 sekúndum" },
        body: [
          {
            en: "Read the verdict: any exposure gaps? (it only fires below 50%). Look at the periodization: does the week follow the low-peak-low shape? The exposure table: amber or red cells = who to train harder, and on what. Then “How to develop him”: pick your game model and read each player's top priority. Remember: a high % is expected — the risk is a low %.",
            is: "Lestu niðurstöðuna: eru einhver exposure gaps? (kviknar aðeins undir 50%). Skoðaðu vikuskipulagið: fylgir vikan lágt-toppur-lágt forminu? Leikmannataflan: gul eða rauð hólf = hvern á að æfa harðar og á hverju. Svo „How to develop him“: veldu leikstílinn þinn og lestu efsta forgang hvers leikmanns. Mundu: há prósenta er væntanleg — áhættan er lág prósenta.",
          },
        ],
      },
      {
        heading: { en: "The principle + verdict", is: "Reglan + niðurstaðan" },
        body: [
          {
            en: "The verdict says how high the squad trains relative to match demand and how many have an “exposure gap” (e.g. “254% of match load · 0/11 with an exposure gap”). The gap fires only when best training drops below 50% of match demand (Malone 2017). A high % is not overload — it's expected, because events bunch up in drills.",
            is: "Niðurstaðan segir hversu hátt hópurinn æfir miðað við leikkröfu og hversu margir eru með „exposure gap“ (t.d. „254% of match load · 0/11 með exposure gap“). Gapið kviknar aðeins þegar besta æfing fer undir 50% af leikkröfu (Malone 2017). Há prósenta þýðir ekki ofálag — hún er væntanleg af því atburðir þéttast í æfingum.",
          },
        ],
      },
      {
        heading: { en: "Three bases, two comparisons", is: "Þrír grunnar, tveir samanburðir" },
        body: [
          {
            en: "You pick a basis: FMP (Catapult movement zones), IMA (events: accelerations, decelerations, changes of direction, jumps) or GPS. And a comparison: against the player's own match, or against the position's demand. FMP and IMA are inertial, so they work indoors where GPS doesn't. Switch basis to check another set of metrics.",
            is: "Þú velur grunn: FMP (Catapult hreyfisvæði), IMA (atburðir: hröðun, hemlun, stefnubreytingar, stökk) eða GPS. Og samanburð: við eigin leik leikmannsins eða við leikkröfu stöðunnar. FMP og IMA byggja á hröðunarmælum svo þau virka innanhúss þar sem GPS gerir það ekki. Skiptu um grunn til að athuga annað sett af mælikvörðum.",
          },
        ],
      },
      {
        heading: { en: "Weekly periodization by MD-day", is: "Vikuskipulag eftir MD-degi" },
        body: [
          {
            en: "Each training day is shown as a share of match demand against a “desirable band” — a typical periodization shape (low MD+1 and MD-1, peak mid-week). It's a reference, not a rule — adjust it to your model (Martín-García 2018; Akenhead 2016). The % is the session's total volume as a share of a full match, not per-90 (which would inflate short sessions).",
            is: "Hver æfingadagur er sýndur sem hlutfall af leikkröfu, borinn saman við „desirable band“ — dæmigerða skipulagsform (lágt MD+1 og MD-1, toppur um miðja viku). Þetta er viðmið, ekki regla — aðlagaðu að þínu módeli (Martín-García 2018; Akenhead 2016). Prósentan er heildarrúmmál æfingarinnar sem hlutfall af heilum leik, ekki per-90 (sem blési upp stuttar æfingar).",
          },
          {
            en: "On MD+1 and MD+2 the day is split in two: players who played a full shift (≥60 min) are recovering (Recovery), while subs and limited players do a compensatory top-up to replace the match stimulus they missed — each against its own band. This is a nuance most systems miss (Anderson 2016; Hills 2018; Nédélec 2012).",
            is: "Á MD+1 og MD+2 er dögunum skipt í tvennt: leikmenn sem spiluðu fullan leik (≥60 mín) eru að jafna sig (Recovery), en varamenn og þeir sem spiluðu lítið gera uppbótar-æfingu (Top-up) til að bæta upp leikáreitið sem þeir misstu af — hvor um sig borinn saman við sitt eigið band. Þetta er nákvæmni sem flest kerfi missa af (Anderson 2016; Hills 2018; Nédélec 2012).",
          },
        ],
      },
      {
        heading: { en: "The exposure table (per position)", is: "Leikmannataflan (áreiti eftir stöðu)" },
        body: [
          {
            en: "For each metric and each position the table shows best training as a share of match demand, coloured: green = well trained, amber = gap (50–80%), red = under-trained (<50%). So you see at once who to train harder — and on which metric — the moment a gap opens (Malone 2018; Duhig 2016).",
            is: "Fyrir hverja vídd og hverja stöðu sýnir taflan bestu æfingu sem hlutfall af leikkröfu, lituð: grænt = vel þjálfað, gult = gap (50–80%), rautt = undir-þjálfað (<50%). Þannig sést strax hvern á að æfa harðar — og á hvaða mælikvarða — um leið og gap opnast (Malone 2018; Duhig 2016).",
          },
        ],
      },
      {
        heading: { en: "“How to develop him” — game model × movement", is: "„How to develop him“ — leikstíll × hreyfing" },
        body: [
          {
            en: "At the bottom the page gives a development emphasis per player = your game model (High press / Possession / Direct / Low block / Balanced) times how he moves. It prescribes specific work — repeated-sprint, acceleration mechanics, eccentric braking — each with the player's z-score as evidence, a method and a priority (HIGH/MODERATE). Change the game model and the emphasis changes (Buchheit 2024; Morin 2016; Harper 2019; McBurnie 2022).",
            is: "Neðst gefur síðan þróunaráherslu á hvern leikmann = leikstíll félagsins (High press / Possession / Direct / Low block / Balanced) margfaldaður með því hvernig hann hreyfir sig. Hún ávísar tiltekinni vinnu — repeated-sprint, hröðunartækni, eccentric-hemlun — hverri með z-skori leikmannsins sem sönnun, aðferð og forgangi (HIGH/MODERATE). Breyttu leikstílnum og áherslan breytist (Buchheit 2024; Morin 2016; Harper 2019; McBurnie 2022).",
          },
          {
            en: "The point of the page: don't under-prepare the body for what the game asks — and when a gap opens, it says who to train harder, on what, and how, in line with how you want to play.",
            is: "Kjarni síðunnar: ekki vanbúa líkamann fyrir það sem leikurinn krefst — og þegar gap opnast segir hún hvern á að æfa harðar, á hverju, og hvernig, miðað við hvernig þú vilt spila.",
          },
        ],
      },
    ],
  },
  "injury-pattern-analysis": {
    title: { en: "How to use Injury Pattern Analysis", is: "Hvernig á að nota Meiðsla-munstursgreiningu" },
    intro: {
      en: "This is the “proof-of-ROI” page — it answers the question a board asks: is this delivering? For every recorded injury it looks back over the 14 days before and checks whether MicroPulse produced a warning signal — a yellow/red flag, a decoupling alert, or an ACWR spike. The headline is what share of injuries had a preceding warning. It is honest: it includes the ones it missed, and the number can fall as well as rise. This is a retrospective audit, not injury prediction.",
      is: "Þetta er „proof-of-ROI“ síðan — hún svarar spurningunni sem stjórn spyr: skilar þetta einhverju? Fyrir hverja skráða meiðsli lítur hún til baka yfir 14 dagana á undan og athugar hvort MicroPulse hafi gefið viðvörunarmerki — gult/rautt flagg, ósamræmisviðvörun, eða ACWR-topp. Fyrirsögnin er hvaða hlutfall meiðsla átti sér undanfarandi viðvörun. Hún er heiðarleg: hún tekur með tilvikin sem hún missti af, og talan getur lækkað eins og hún hækkar. Þetta er eftirámat, ekki meiðslaspá.",
    },
    videoEmbedUrl: INJURY_PATTERN_VIDEO,
    sections: [
      {
        heading: { en: "Read the page in 30 seconds", is: "Lestu síðuna á 30 sekúndum" },
        body: [
          {
            en: "Read the headline for the ROI story (the share with a warning). Scan the list and note the “no prior signal” cases — the honest misses. Open one injury to see the 14-day reconstruction: when the first warning came, the drivers, the decel pattern. And remember: this is a look-back audit, not a prediction — it shows whether the system warned, not what happens next.",
            is: "Lestu fyrirsögnina fyrir ROI-söguna (hlutfall með viðvörun). Renndu yfir listann og taktu eftir „no prior signal“ tilvikunum — heiðarlegu missunum. Opnaðu eina meiðsli til að sjá 14 daga endurgerðina: hvenær fyrsta viðvörunin kom, drifþættina, decel-mynstrið. Og mundu: þetta er eftirámat, ekki spá — það sýnir hvort kerfið varaði við, ekki hvað gerist næst.",
          },
        ],
      },
      {
        heading: { en: "The headline (proof of ROI)", is: "Fyrirsögnin (proof of ROI)" },
        body: [
          {
            en: "One number over the last 365 days: how many injuries had a warning signal in the days before (e.g. “26 of 31 · 84%”). Beside it: the count with a strong pattern match (≥0.5) and the average pattern score. Split by body part (hamstring, knee, ankle, groin) so you see where the patterns sit. It's computed from the club's real history — so it can fall as well as rise.",
            is: "Ein tala yfir síðustu 365 daga: hversu margar meiðsli áttu sér viðvörunarmerki dagana á undan (t.d. „26 af 31 · 84%“). Við hliðina: fjöldi með sterkt mynstursamræmi (≥0,5) og meðal-mynsturskor. Skipt eftir líkamshluta (aftanlæri, hné, ökkli, nári) svo þú sérð hvar mynstrin liggja. Reiknað úr raunverulegri sögu félagsins — svo hún getur lækkað jafnt sem hækkað.",
          },
        ],
      },
      {
        heading: { en: "Honest by design", is: "Heiðarleg í eðli sínu" },
        body: [
          {
            en: "The list shows each injury with a badge: either “preceded by warning · 100% match” or “no prior signal · 0% match”. The system does not hide the ones it missed — which is exactly why the number is credible. Because it's a retrospective read of real history, it can't flatter itself.",
            is: "Listinn sýnir hverja meiðsli með merki: annaðhvort „preceded by warning · 100% match“ eða „no prior signal · 0% match“. Kerfið felur ekki tilvikin sem það missti af — það er einmitt þess vegna sem talan er trúverðug. Þar sem hún er eftirámat úr raunverulegri sögu getur hún ekki hrósað sjálfri sér.",
          },
          {
            en: "Each injury gets a 0–1 pattern-match score for how strongly its lead-up matched a warning pattern; 0.5 or above counts as strong. The score aggregates several signals — flags, decoupling, load spikes — rather than relying on one, so it is less sensitive to chance.",
            is: "Hver meiðsli fær mynstursskor á bilinu 0–1 fyrir hversu sterkt aðdragandinn samræmdist viðvörunarmynstri; 0,5 eða hærra telst sterkt. Skorið safnar saman mörgum merkjum — flöggum, ósamræmi, álagstoppum — frekar en að treysta á eitt, svo það er ekki jafn viðkvæmt fyrir tilviljun.",
          },
        ],
      },
      {
        heading: { en: "The per-injury forensics", is: "Réttarrannsóknin á hverri meiðsli" },
        body: [
          {
            en: "Click an injury and you get a full reconstruction of the 14 days before: yellow/red days, decoupling alerts (Akubat 2014), ACWR (7d/28d), prior injuries (180 days), a VALD ForceDecks snapshot, GPS spikes (Buchheit 2010), match congestion (Lago-Peñas 2010), and McBurnie deceleration intelligence. At the top: when the first warning came (“first warning sign N days before”). Every signal carries its own citation — no guesswork.",
            is: "Smelltu á meiðsli og þú færð fulla endurgerð 14 daganna á undan: gulir/rauðir dagar, ósamræmisviðvaranir (Akubat 2014), ACWR (7d/28d), fyrri meiðsli (180 daga), VALD ForceDecks mynd, GPS-toppa (Buchheit 2010), leikjaþéttleika (Lago-Peñas 2010), og McBurnie decel-mat. Efst stendur hvenær fyrsta viðvörunin kom („first warning sign N days before“). Hvert merki ber sína heimild — engin ágiskun.",
          },
          {
            en: "At the bottom, a day-by-day line over every non-green day in the lead-up, with the score, the z-value and the drivers that produced the flag — e.g. “soreness 2/5”, “energy 2/5”, “acute drop Δz”, “sustained low”, “volatility” (Robertson). So you see exactly how the risk built up before the injury.",
            is: "Neðst er dag-fyrir-dag lína yfir hvern ekki-grænan dag í aðdragandanum, með skori, z-gildi og drifþáttunum sem ollu flagginu — t.d. „soreness 2/5“, „energy 2/5“, „acute drop Δz“, „sustained low“, „volatility“ (Robertson). Þannig sést nákvæmlega hvernig áhættan byggðist upp fyrir meiðslin.",
          },
        ],
      },
      {
        heading: { en: "What it is — and isn't", is: "Hvað hún er — og er ekki" },
        body: [
          {
            en: "It is a retrospective audit showing whether risk was flagged before an injury — proof the system earns its place. It is not injury prediction (no system predicts injuries reliably), and it is not where injuries are logged — that's the RTP tab. This page is read-only. The point: it's the answer to “is this delivering?”, computed from the club's real history, misses and all, so the number is proof rather than a promise.",
            is: "Hún er eftirámat sem sýnir hvort áhætta var flögguð fyrir meiðsli — sönnun þess að kerfið vinni fyrir sér. Hún er ekki meiðslaspá (ekkert kerfi spáir meiðslum áreiðanlega) og hún er ekki þar sem meiðsli eru skráð — það er gert á RTP-flipanum. Þessi síða er aðeins til aflestrar. Kjarninn: þetta er svarið við „skilar þetta einhverju?“, reiknað úr raunverulegri sögu félagsins, með missunum og öllu, svo talan sé sönnun en ekki loforð.",
          },
        ],
      },
    ],
  },
  "hsr-intelligence": {
    title: { en: "How to use HSR Intelligence", is: "Hvernig á að nota HSR Intelligence" },
    intro: {
      en: "This is the Lite-tier hamstring guard — per-player soft-tissue monitoring built on the GPS metrics every Catapult plan exposes (high-speed running, sprint, max velocity). It's the GPS counterpart to Decel Intelligence: the same published evidence (Malone 2017, Buchheit 2014), different inputs. Its job is to make sure each player gets enough high-speed running before a match — because both too much AND too little are hamstring risks.",
      is: "Þetta er aftanlærisvörnin á Lite-þrepi — persónulegt eftirlit með mjúkvefjaáhættu byggt á GPS-mælunum sem hver Catapult-áskrift skilar (háhraðahlaup, spretti, hámarkshraði). Hún er GPS-hliðstæða Decel Intelligence: sama ritrýnda sönnun (Malone 2017, Buchheit 2014), önnur inntök. Hlutverk hennar er að tryggja að hver leikmaður fái nóg af háhraðahlaupi fyrir leik — því bæði of mikið OG of lítið er aftanlærisáhætta.",
    },
    videoEmbedUrl: HSR_VIDEO,
    sections: [
      {
        heading: { en: "Read the page in 30 seconds", is: "Lestu síðuna á 30 sekúndum" },
        body: [
          {
            en: "Read the verdict: who's flagged and why (ramping up, or dropped off). The table is sorted red → green, so HIGH RISK sits at the top. For a flagged player, see which sub-flag drove it — HSR, Sprint or MaxV. And remember: both too much and too little are risks, and the MaxV exposure is the hamstring's inoculation for match sprints.",
            is: "Lestu niðurstöðuna: hverjir eru flaggaðir og af hverju (ramping up eða dropped off). Taflan er röðuð rautt → grænt, svo HIGH RISK er efst. Fyrir flaggaðan leikmann sjáðu hvaða undir-flagg olli — HSR, Sprint eða MaxV. Og mundu: bæði of mikið og of lítið er áhætta, og MaxV-áreitið er bólusetning aftanlærisins fyrir spretti leiks.",
          },
        ],
      },
      {
        heading: { en: "The verdict", is: "Niðurstaðan" },
        body: [
          {
            en: "One sentence names those carrying elevated high-speed-running load and those to keep an eye on. “Elevated load” means today's running is far above — or far below — the player's normal four-week pattern, or that he rarely reaches top speed. The chips classify it: “load ramping up fast”, “sprinting ramping up fast” or “load dropped off”. Confidence rests on a 4-week baseline, and both directions are flagged.",
            is: "Ein setning nefnir þá sem bera hækkað háhraðahlaupsálag og þá sem vert er að fylgjast með. „Hækkað álag“ þýðir að hlaup dagsins er langt yfir — eða langt undir — venjulegu fjögurra vikna mynstri leikmannsins, eða að hann nær sjaldan hámarkshraða. Merkin flokka það: „load ramping up fast“, „sprinting ramping up fast“ eða „load dropped off“. Öryggið hvílir á 4-vikna grunnlínu, og báðar áttir eru flaggaðar.",
          },
        ],
      },
      {
        heading: { en: "Three exposures — the heart of the page", is: "Þrjú áreiti — hjarta síðunnar" },
        body: [
          {
            en: "The page tracks three: HSR (high-speed-running distance above the threshold, with an ACWR of 7d/28d), Sprint (sprint distance, with an ACWR), and MaxV (%MAXV — how close to top speed — plus the count of sessions where ≥95% of max velocity was reached). Each exposure has its own coloured sub-flag in the table (Malone 2017; Buchheit 2014).",
            is: "Síðan fylgist með þremur: HSR (háhraðahlaupsvegalengd yfir þröskuldi, með ACWR 7d/28d), Sprint (sprettvegalengd, með ACWR), og MaxV (%MAXV — hversu nálægt hámarkshraða — auk fjölda æfinga þar sem ≥95% af hámarkshraða náðist). Hvert áreiti hefur sitt eigið litað undir-flagg í töflunni (Malone 2017; Buchheit 2014).",
          },
        ],
      },
      {
        heading: { en: "Both directions are the risk", is: "Báðar áttir eru áhætta" },
        body: [
          {
            en: "Ramping up too fast is a spike risk. But ramping down — or rarely reaching top speed — leaves the hamstring under-prepared for match sprints (Malone 2017). Too little high-speed running is as dangerous as too much. That's why “load dropped off” is flagged alongside “ramping up fast”: this isn't only overload protection, it's under-exposure protection too.",
            is: "Að rampa upp of hratt er toppáhætta. En að rampa niður — eða ná sjaldan hámarkshraða — skilur aftanlærið eftir vanbúið fyrir spretti leiks (Malone 2017). Of lítið háhraðahlaup er jafn hættulegt og of mikið. Þess vegna er „load dropped off“ flaggað við hliðina á „ramping up fast“: þetta er ekki bara ofálagsvörn heldur líka vörn gegn undir-áreiti.",
          },
          {
            en: "MaxV is the sprint inoculation. Reaching ≥95% of max velocity regularly is what prepares the hamstring for match sprints. The %MAXV over 28 days and the count of ≥95% sessions show whether he has had that exposure — few such sessions means under-prepared for the game's top end, even if total running looks fine.",
            is: "MaxV er sprett-„bólusetningin“. Að ná ≥95% af hámarkshraða reglulega er það sem býr aftanlærið undir spretti leiks. %MAXV yfir 28 daga og fjöldi ≥95%-æfinga sýnir hvort hann hafi fengið það áreiti — fáar slíkar æfingar þýða vanbúinn fyrir topphraða leiksins, jafnvel þótt heildarhlaup líti vel út.",
          },
        ],
      },
      {
        heading: { en: "The table — worst-of-three verdict", is: "Taflan — versta af þremur ræður" },
        body: [
          {
            en: "The table is sorted by risk (red → green). Each value is coloured by its own sub-flag, and the STATUS column on the right is the worst-of-three — the combined verdict from HSR, Sprint and MaxV. So a player's status is driven by whichever exposure is worst, not the average of the three. Columns: HSR 7D/ACWR · Sprint 7D/ACWR · %MAXV · ≥95% sessions.",
            is: "Taflan er röðuð eftir áhættu (rautt → grænt). Hvert gildi er litað eftir sínu eigin undir-flaggi, og STATUS-dálkurinn lengst til hægri er versta af þremur — samsett niðurstaða úr HSR, Sprint og MaxV. Þannig ræðst staða leikmanns af því áreiti sem er verst, ekki meðaltali þeirra þriggja. Dálkar: HSR 7D/ACWR · Sprint 7D/ACWR · %MAXV · ≥95% sessions.",
          },
        ],
      },
      {
        heading: { en: "Lite tier, same evidence", is: "Lite-þrep, sama sönnun" },
        body: [
          {
            en: "HSR Intelligence is the GPS-only equivalent of Decel Intelligence. It's built on what every Catapult plan exposes — no inertial data needed — so a Lite club gets real hamstring monitoring. The evidence is the same as Decel's (Malone 2017, Buchheit 2014, published in BJSM): different inputs, same quality. The point: make sure each player gets enough — but not too much — high-speed running before a match, on the Lite tier with the same science as Pro.",
            is: "HSR Intelligence er GPS-eingöngu jafngildi Decel Intelligence. Hún byggir á því sem hver Catapult-áskrift skilar — engin hröðunarmælagögn þarf — svo Lite-félag fær raunverulegt aftanlæriseftirlit. Sönnunin er sú sama og hjá Decel (Malone 2017, Buchheit 2014, ritrýnt í BJSM): önnur inntök, sömu gæði. Kjarninn: passaðu að hver leikmaður fái nóg — en ekki of mikið — af háhraðahlaupi fyrir leik, á Lite-þrepi með sömu vísindum og Pro.",
          },
        ],
      },
    ],
  },
  "return-to-training": {
    title: { en: "How to use Return-to-Training", is: "Hvernig á að nota Aftur í æfingar" },
    videoAspectPaddingTop: "75%",
    intro: {
      en: "This is the return-to-training engine — an individualized ramp back from injury. It rebuilds a player's load week by week toward a ceiling that is his own healthy baseline, never a generic scale. Qualities unlock in a safe order, and the ones most likely to cause re-injury unlock last and slowest. It splits load into Engine (GPS) and Driver (IMA), controls the ramp with ACWR, monitors L/R balance, and tells the coach today's session type. It is a load framework, not medical clearance to play.",
      is: "Þetta er endurkomueiningin — einstaklingsmiðuð uppbygging til baka eftir meiðsli. Hún endurbyggir álag leikmannsins viku fyrir viku að þaki sem er hans eigin heilbrigða grunnlína, aldrei almennur kvarði. Eiginleikar opnast í öruggri röð, og þeir sem eru líklegastir til að valda endurmeiðslum opnast síðast og hægast. Hún skiptir álagi í Engine (GPS) og Driver (IMA), stýrir uppbyggingunni með ACWR, fylgist með L/R jafnvægi, og segir þjálfaranum tegund æfingar dagsins. Hún er álagsrammi, ekki læknisfræðileg heimild til að spila.",
    },
    videoEmbedUrl: RETURN_TO_TRAINING_VIDEO,
    sections: [
      {
        heading: { en: "Read the page in 30 seconds", is: "Lestu síðuna á 30 sekúndum" },
        body: [
          {
            en: "Read the header for where he is (stage, capacity, plan week). “Today's session” says what to do today — a type plus a load ceiling. The ladder shows what's unlocked and what's still locked. The injury-specific note names the slow-ramp qualities. And remember: it's a ceiling, not a floor, and a framework, not clearance to play.",
            is: "Lestu hausinn fyrir stöðuna (þrep, geta, vika í áætlun). „Today's session“ segir hvað á að gera í dag — tegund auk álagsþaks. Framvinduröðin sýnir hvað er opið og hvað er enn læst. Meiðsla-sértæka nótan segir hvaða eiginleikar rampa hægt. Og mundu: þetta er þak en ekki gólf, og rammi en ekki heimild til að spila.",
          },
        ],
      },
      {
        heading: { en: "The header — where he is", is: "Hausinn — hvar hann er staddur" },
        body: [
          {
            en: "At the top it states the player is “Currently injured / Return-to-training”, with confidence (how many healthy weeks of baseline), the layoff length, how much capacity he retained, the plan length, and the RTP stage (e.g. 3/5 · non-contact). If injury records disagree, the system says so and asks you to confirm the record rather than guessing.",
            is: "Efst stendur að leikmaðurinn sé „Meiddur núna / Aftur í æfingar“, ásamt vissu (fjöldi heilbrigðra vikna í grunnlínu), lengd fjarveru, hversu miklu getu hann hélt, lengd áætlunar, og RTP-þrepi (t.d. 3/5 · non-contact). Ef meiðslaskráningar stangast á segir kerfið það hreint út og biður þig að staðfesta skráninguna frekar en að giska.",
          },
        ],
      },
      {
        heading: { en: "Ceiling = his own healthy baseline", is: "Þakið = eigin heilbrigða grunnlína" },
        body: [
          {
            en: "Every weekly target is a share of his own healthy weekly load, not a generic number. “Load is a ceiling” — the recommended value is the most he should do, not a floor. Each target shows its percentage of the ceiling (e.g. 90% of the healthy baseline), so you see exactly where he stands against full capacity.",
            is: "Hvert vikumarkmið er hlutfall af hans eigin heilbrigðu vikuálagi, ekki almennri tölu. „Load is a ceiling“ — ráðlagða gildið er það mesta sem hann ætti að gera, ekki lágmark. Hvert markmið sýnir sitt hlutfall af þakinu (t.d. 90% af heilbrigðri grunnlínu), svo þú sérð nákvæmlega hvar hann stendur gagnvart fullri getu.",
          },
        ],
      },
      {
        heading: { en: "The progression ladder + injury-specific ramp", is: "Framvinduröðin + meiðsla-sértæk uppbygging" },
        body: [
          {
            en: "Qualities unlock across the weeks in a safe order: volume first (player load, distance, HSR in week 1), then sprint/strides/accelerations (week 2), and the ones most likely to cause re-injury — high-intensity braking and change of direction — last (week 3). The risky work is added last, once the base is built.",
            is: "Eiginleikar opnast yfir vikurnar í öruggri röð: rúmmál fyrst (player load, vegalengd, háhraðahlaup í viku 1), svo spretti/skref/hröðun (viku 2), og þeir sem eru líklegastir til að valda endurmeiðslum — háákefðar hemlun og stefnubreytingar — síðast (viku 3). Áhættusama vinnan er bætt við síðast, þegar grunnurinn er kominn.",
          },
          {
            en: "The qualities most likely to re-injure this player (e.g. weekly sprinting and change of direction) ramp more slowly (about 7%/week) and start lower than the rest. The ramp is tailored to the injury, not one-size-fits-all — a hamstring case and a knee case get a different order and pace.",
            is: "Eiginleikarnir sem eru líklegastir til að endurmeiða þennan leikmann (t.d. vikuspretti og stefnubreytingar) rampa hægar (um 7%/viku) og byrja lægra en hinir. Uppbyggingin er sérsniðin að meiðslinu, ekki ein stærð fyrir alla — sami tognunarleikmaður og hnémeiðslaleikmaður fá ólíka röð og hraða.",
          },
        ],
      },
      {
        heading: { en: "Engine/Driver targets + today's session", is: "Engine/Driver markmið + æfing dagsins" },
        body: [
          {
            en: "“Today's recommended session load” splits what's left of the week evenly across the sessions still to come, and recommends today's type (e.g. “mechanical: cutting, braking”) based on what's still outstanding. Targets split into Engine (GPS: player load, distance, HSR, sprint) and Driver (IMA: strides, accels, braking, change of direction), each with “done · left” — the same Engine/Driver split as the game report.",
            is: "„Today's recommended session load“ skiptir því sem eftir er af vikunni jafnt á æfingarnar sem eftir eru, og mælir með tegund dagsins (t.d. „mechanical: cutting, braking“) eftir því hvað er enn ókomið. Markmiðin skiptast í Engine (GPS: player load, vegalengd, HSR, spretti) og Driver (IMA: skref, hröðun, hemlun, stefnubreytingar), hvert með „done · left“ — sama Engine/Driver skipting og í leikjaskýrslunni.",
          },
        ],
      },
      {
        heading: { en: "ACWR control, L/R balance, actual vs plan", is: "ACWR-stýring, L/R jafnvægi, raun vs plan" },
        body: [
          {
            en: "The week-to-week increase keeps ACWR near 1.04 — small, safe steps rather than jumps. The system states ACWR honestly: “a spike-size descriptor, not an injury predictor” (Gabbett/Williams), so the ramp is controlled without over-claiming.",
            is: "Aukningin milli vikna heldur ACWR nálægt 1,04 — lítil, örugg skref frekar en stökk. Kerfið orðar ACWR heiðarlega: „a spike-size descriptor, not an injury predictor“ (Gabbett/Williams), svo uppbyggingin er stýrð en ekki oftúlkuð.",
          },
          {
            en: "Left/right change-of-direction balance is monitored, not ramped: after a one-sided injury a player often avoids the injured side, and the goal is to restore his normal balance. Actual load is tracked against recommended week by week — but “under” mid-week doesn't mean he's behind, only that the week is unfinished.",
            is: "Stefnubreytinga-jafnvægi milli vinstri og hægri er fylgst með, ekki rampað: eftir einhliða meiðsli forðast leikmaður oft meidda hliðina, og markmiðið er að endurheimta eðlilegt jafnvægi. Raunálag er borið saman við ráðlagt viku fyrir viku — en „under“ á miðri viku þýðir ekki að hann sé á eftir, aðeins að vikan er ókláruð.",
          },
        ],
      },
      {
        heading: { en: "What it is — and isn't", is: "Hvað hún er — og er ekki" },
        body: [
          {
            en: "It is a framework for a safe, individualized ramp back — not medical clearance to play, which is the physiotherapist's call. The player sees a simplified version in the app (which week, this week's focus, what unlocks next — no raw numbers), so he's part of the journey without drowning in detail. The point: a safe road back, tailored to the player and the injury, with the riskiest work last and the ceiling set by himself.",
            is: "Hún er rammi fyrir örugga, einstaklingsmiðaða uppbyggingu til baka — ekki læknisfræðileg heimild til að spila, það er ákvörðun sjúkraþjálfarans. Leikmaðurinn sér einfaldaða útgáfu í appinu (hvaða viku, áhersla vikunnar, hvað opnast næst — engar hráar tölur), svo hann sé með í ferðinni án þess að drukkna í smáatriðum. Kjarninn: örugg leið til baka, sniðin að leikmanninum og meiðslinu, með áhættusömustu vinnuna síðast og þakið sett af honum sjálfum.",
          },
        ],
      },
    ],
  },
};
