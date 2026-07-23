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
  | "ima-intelligence";

export type TutorialSection = { heading: Bi; body: Bi[] };

export type Tutorial = {
  title: Bi;
  intro?: Bi;
  /** Third-party embed URL (iframe), overview video for this page (optional). */
  videoEmbedUrl?: string;
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
    title: { en: "How to use Week setup", is: "Hvernig á að nota Vikuskipulag" },
    intro: {
      en: "The one input that needs configuring rather than just entering. It tells the system what normal load is each day — without it, it can't tell a match from a session.",
      is: "Eina inntakið sem þarf uppsetningu frekar en bara innslátt. Það segir kerfinu hvað er eðlilegt álag hvern dag — án þess getur það ekki aðgreint leik frá æfingu.",
    },
    sections: [
      {
        heading: { en: "Set the week", is: "Settu upp vikuna" },
        body: [
          {
            en: "Pick the season phase, whether there are matches this week, and tag each day relative to match day (MD-3, MD-1…). That tagging governs the whole week's load assessment.",
            is: "Veldu tímabilshluta, hvort leikir eru í vikunni, og merktu hvern dag gagnvart leikdegi (MD-3, MD-1…). Sú merking stýrir öllu álagsmatinu þá vikuna.",
          },
        ],
      },
      {
        heading: { en: "The team-breaks box", is: "Frí-reiturinn" },
        body: [
          {
            en: "Small but important: during a break players get no reminders, missed check-ins don't count against them, and the system doesn't read the break as a collapse in load.",
            is: "Lítill en mikilvægur: á fríi fá leikmenn engar áminningar, vantandi skráningar teljast ekki gegn þeim, og kerfið les fríið ekki sem hrun í álagi.",
          },
        ],
      },
      {
        heading: { en: "How often", is: "Hversu oft" },
        body: [
          {
            en: "Once a week. It's the only regular setup — everything else is just quick entry (match minutes after a match, injuries when they happen).",
            is: "Einu sinni í viku. Það er eina reglulega uppsetningin — allt annað er bara fljótur innsláttur (leikmínútur eftir leik, meiðsli þegar þau verða).",
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
      en: "External load against internal load, at a glance.",
      is: "Ytra álag á móti innra álagi, í fljótu bragði.",
    },
    sections: [
      {
        heading: { en: "What it shows", is: "Hvað hún sýnir" },
        body: [
          {
            en: "Each player sits in a quadrant of external (GPS / running) against internal (how hard it felt). It answers “who runs a lot but finds it easier — or harder — than usual?”",
            is: "Hver leikmaður situr í reit sem ber saman ytra álag (GPS / hlaup) og innra álag (hversu erfitt það var). Hún svarar „hver hleypur mikið en finnst það léttara — eða þyngra — en venjulega?“",
          },
        ],
      },
      {
        heading: { en: "“Decoupled” is the early warning", is: "„Decoupled“ er snemmbúna viðvörunin" },
        body: [
          {
            en: "When external and internal pull apart — high running but low internal, or the reverse — a player reads as “Decoupled”. That's an early fatigue signal, often before it shows in the daily verdict.",
            is: "Þegar ytra og innra álag draga í sundur — mikið hlaup en lágt innra, eða öfugt — les leikmaður sem „Decoupled“. Það er snemmbúið þreytumerki, oft áður en það birtist í daglegu niðurstöðunni.",
          },
        ],
      },
    ],
  },

  "indoor-load": {
    title: { en: "How to use Indoor Load Intelligence", is: "Hvernig á að nota Indoor Load" },
    intro: {
      en: "Training load in the hall, when there is no GPS.",
      is: "Álag á innanhússæfingu, þegar enginn GPS er til staðar.",
    },
    sections: [
      {
        heading: { en: "How it works", is: "Hvernig hún virkar" },
        body: [
          {
            en: "Computed from the inertial sensors (Pro) — PlayerLoad, high-intensity accelerations/decelerations and change-of-direction — normalised to each player's own recent normal, so an indoor session isn't a blank card.",
            is: "Reiknað úr hröðunarmælum (Pro) — PlayerLoad, hraðar hröðanir/hægðanir og stefnubreytingar — kvarðað á hvers leikmanns eigin nýlega venju, svo innanhússæfing er ekki tómt kort.",
          },
        ],
      },
      {
        heading: { en: "The same layered read", is: "Sami lagskipti lesturinn" },
        body: [
          {
            en: "Open it for indoor sessions where GPS distance is zero. It opens with a verdict; the numbers sit behind a click, like every other page.",
            is: "Opnaðu hana fyrir innanhússæfingar þar sem GPS-vegalengd er núll. Hún byrjar á niðurstöðu; tölurnar liggja á bak við smell, eins og á öllum öðrum síðum.",
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
};
